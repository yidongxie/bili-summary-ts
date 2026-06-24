/** Audio download (yt-dlp via ffmpeg fallback) + OpenAI-compatible Whisper transcription */

import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { spawn } from 'child_process';
// Resolve a working ffmpeg binary path. Order of preference:
//   1. FFMPEG_PATH env var (set by the deploy script to a static binary)
//   2. @ffmpeg-installer/ffmpeg npm bundle (no postinstall network needed)
//   3. ffmpeg-static npm bundle
//   4. 'ffmpeg' on PATH
let ffmpegBinary: string = 'ffmpeg';
if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
  ffmpegBinary = process.env.FFMPEG_PATH;
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { path: installerPath } = require('@ffmpeg-installer/ffmpeg');
    if (typeof installerPath === 'string' && installerPath) ffmpegBinary = installerPath;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const staticPath = require('ffmpeg-static');
      if (typeof staticPath === 'string' && staticPath) ffmpegBinary = staticPath;
    } catch {
      // Fall back to PATH lookup.
    }
  }
}

export interface WhisperConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface TranscribedSegment {
  from: number;
  to: number;
  content: string;
}

const BILI_HEADERS_FOR_MEDIA: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com',
};

const MAX_AUDIO_DOWNLOAD_BYTES = parseInt(process.env.MAX_AUDIO_DOWNLOAD_BYTES || String(200 * 1024 * 1024), 10);
const MAX_TRANSCRIBE_UPLOAD_BYTES = parseInt(process.env.MAX_TRANSCRIBE_UPLOAD_BYTES || String(50 * 1024 * 1024), 10);

function assertUploadSize(filePath: string) {
  const size = fs.statSync(filePath).size;
  if (size > MAX_TRANSCRIBE_UPLOAD_BYTES) {
    throw new Error(`转写文件过大（${Math.ceil(size / 1024 / 1024)}MB），请使用更短的音频`);
  }
}

function requestJson<T>(url: string, headers: Record<string, string>, timeout = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { headers, timeout }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch (e) {
          reject(new Error(`JSON parse: ${e}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

interface PlayUrlResponse {
  code: number;
  message: string;
  data: {
    dash?: {
      audio?: Array<{ id: number; baseUrl: string; base_url?: string; bandwidth: number }>;
    };
    durl?: Array<{ url: string; size: number }>;
  };
}

/** Get a direct audio (or fallback combined) stream URL from Bilibili. */
async function getAudioStreamUrl(bvid: string, cid: number): Promise<string> {
  const headers = { ...BILI_HEADERS_FOR_MEDIA };
  // fnval=16 = request DASH; 4048 enables most formats
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=4048&fnver=0&fourk=1`;
  const res = await requestJson<PlayUrlResponse>(url, headers);
  if (res.code !== 0) throw new Error(`playurl error: ${res.message}`);
  const audio = res.data.dash?.audio;
  if (audio && audio.length) {
    // pick smallest bandwidth (cheapest, fastest) - quality irrelevant for ASR
    const pick = [...audio].sort((a, b) => a.bandwidth - b.bandwidth)[0];
    return pick.baseUrl || pick.base_url || '';
  }
  if (res.data.durl && res.data.durl.length) {
    return res.data.durl[0].url; // MP4 fallback (no separate audio track)
  }
  throw new Error('未获取到可用的 B 站音频流');
}

/** Download stream to a local file (handles redirect, requires Bilibili Referer). */
function downloadToFile(url: string, dest: string, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers = { ...BILI_HEADERS_FOR_MEDIA };
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { headers, timeout: 60000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        downloadToFile(next, dest, redirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`download HTTP ${res.statusCode}`));
        return;
      }
      const contentLength = Number(res.headers['content-length'] || 0);
      if (contentLength > MAX_AUDIO_DOWNLOAD_BYTES) {
        res.resume();
        reject(new Error(`音频文件过大（${Math.ceil(contentLength / 1024 / 1024)}MB）`));
        return;
      }
      let downloaded = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (downloaded > MAX_AUDIO_DOWNLOAD_BYTES) {
          req.destroy(new Error('音频文件超过大小限制'));
          out.destroy();
          try { fs.unlinkSync(dest); } catch {}
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
  });
}

/** Run ffmpeg to convert any input audio/video into a 16k mono mp3 (small + Whisper-friendly). */
function ffmpegToMp3(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', output];
    const p = spawn(ffmpegBinary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c.toString(); });
    p.on('error', (e) => reject(new Error(`ffmpeg spawn: ${e.message}`)));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Multipart upload to OpenAI-compatible /audio/transcriptions endpoint. */
function postMultipartTranscribe(filePath: string, config: WhisperConfig): Promise<{ text: string; segments?: TranscribedSegment[] }> {
  return new Promise((resolve, reject) => {
    const base = config.baseUrl.replace(/\/+$/, '');
    const url = new URL(base + '/audio/transcriptions');
    const boundary = '----BiliStudyBoundary' + Math.random().toString(16).slice(2);
    const fileBuf = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const header = (name: string, value: string) =>
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf-8');
    const parts: Buffer[] = [
      header('model', config.model),
      header('response_format', 'verbose_json'),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/mpeg\r\n\r\n`,
        'utf-8',
      ),
      fileBuf,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
    ];
    const body = Buffer.concat(parts);
    const mod = url.protocol === 'https:' ? https : http;
    // 清理 API Key，移除换行和无效字符
    const cleanApiKey = (config.apiKey || '').replace(/[\r\n\s]+/g, '').trim();
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          Authorization: `Bearer ${cleanApiKey}`,
        },
        timeout: 600000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Whisper HTTP ${res.statusCode}: ${text.slice(0, 400)}`));
            return;
          }
          try {
            const j = JSON.parse(text);
            const segments: TranscribedSegment[] = Array.isArray(j.segments)
              ? j.segments.map((s: any) => ({ from: Number(s.start) || 0, to: Number(s.end) || 0, content: String(s.text || '').trim() })).filter((s: TranscribedSegment) => s.content)
              : [];
            resolve({ text: String(j.text || '').trim(), segments });
          } catch (e) {
            reject(new Error(`Whisper JSON parse: ${e}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Whisper timeout')); });
    req.write(body);
    req.end();
  });
}

export interface AudioTranscribeResult {
  text: string;
  segments: TranscribedSegment[];
}

/** Download a generic audio file from any URL (with custom headers support) */
function downloadGenericAudio(url: string, dest: string, headers?: Record<string, string>, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { headers: headers || {}, timeout: 120000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        downloadGenericAudio(next, dest, headers, redirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`download HTTP ${res.statusCode}`));
        return;
      }
      const contentLength = Number(res.headers['content-length'] || 0);
      if (contentLength > MAX_AUDIO_DOWNLOAD_BYTES) {
        res.resume();
        reject(new Error(`音频文件过大（${Math.ceil(contentLength / 1024 / 1024)}MB）`));
        return;
      }
      let downloaded = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (downloaded > MAX_AUDIO_DOWNLOAD_BYTES) {
          req.destroy(new Error('音频文件超过大小限制'));
          out.destroy();
          try { fs.unlinkSync(dest); } catch {}
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
  });
}

/** End-to-end: pull bilibili audio, convert, send to whisper, return segments. */
export async function transcribeBilibiliAudio(
  bvid: string,
  cid: number,
  whisper: WhisperConfig,
): Promise<AudioTranscribeResult> {
  if (!whisper.apiKey) throw new Error('缺少 Whisper API Key');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilistudy-'));
  const rawFile = path.join(tmpDir, 'audio.bin');
  const mp3File = path.join(tmpDir, 'audio.mp3');
  try {
    const streamUrl = await getAudioStreamUrl(bvid, cid);
    await downloadToFile(streamUrl, rawFile);
    await ffmpegToMp3(rawFile, mp3File);
    assertUploadSize(mp3File);
    const result = await postMultipartTranscribe(mp3File, whisper);
    return { text: result.text, segments: result.segments || [] };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** End-to-end: download generic audio file, convert, send to whisper, return segments. */
export async function transcribeAudioUrl(
  audioUrl: string,
  whisper: WhisperConfig,
  headers?: Record<string, string>,
): Promise<AudioTranscribeResult> {
  if (!whisper.apiKey) throw new Error('缺少 Whisper API Key');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilistudy-podcast-'));
  const rawFile = path.join(tmpDir, 'audio.bin');
  const mp3File = path.join(tmpDir, 'audio.mp3');
  try {
    await downloadGenericAudio(audioUrl, rawFile, headers);
    await ffmpegToMp3(rawFile, mp3File);
    assertUploadSize(mp3File);
    const result = await postMultipartTranscribe(mp3File, whisper);
    return { text: result.text, segments: result.segments || [] };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
