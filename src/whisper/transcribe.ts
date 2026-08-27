/** Audio download (yt-dlp via ffmpeg fallback) + OpenAI-compatible Whisper transcription */

import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { spawn } from 'child_process';
import { isSafeUpstreamUrl } from '../common/urlSafety';
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
// Long audio is split into chunks of this many seconds and transcribed separately,
// then merged back with correct time offsets (ASR providers often cap single-request length).
const MAX_TRANSCRIBE_DURATION_SECONDS = parseInt(process.env.MAX_TRANSCRIBE_DURATION_SECONDS || "1800", 10);

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
  return runFfmpeg(['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', output]);
}

/** Generic ffmpeg wrapper that resolves on exit 0 and rejects otherwise. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
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

/** Probe an audio file's duration in seconds (0 on failure). */
function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegBinary, ['-i', filePath, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c.toString(); });
    p.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) resolve(parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]));
      else resolve(0);
    });
    p.on('error', () => resolve(0));
  });
}

/** Split an audio file into fixed-length chunks (stream copy, no re-encode). */
async function splitAudio(input: string, outDir: string, chunkSeconds: number): Promise<Array<{ file: string; start: number }>> {
  const pattern = path.join(outDir, 'chunk_%03d.mp3');
  await runFfmpeg(['-y', '-i', input, '-f', 'segment', '-segment_time', String(chunkSeconds), '-reset_timestamps', '1', '-c', 'copy', pattern]);
  const files = fs.readdirSync(outDir).filter((f) => /^chunk_\d+\.mp3$/.test(f)).sort();
  return files.map((f, i) => ({ file: path.join(outDir, f), start: i * chunkSeconds }));
}

interface WordTimestamp { word: string; start: number; end: number; }

/** Group word-level timestamps into sentence segments (split on 。！？.!?）. */
function wordsToSegments(words: WordTimestamp[]): TranscribedSegment[] {
  const out: TranscribedSegment[] = [];
  let cur: { from: number; to: number; parts: string[] } | null = null;
  for (const w of words) {
    const word = String(w.word || '').trim();
    if (!word) continue;
    if (!cur) cur = { from: Number(w.start) || 0, to: Number(w.end) || 0, parts: [] };
    cur.to = Number(w.end) || cur.to;
    cur.parts.push(word);
    if (/[。！？.!?]$/.test(word)) {
      out.push({ from: cur.from, to: cur.to, content: cur.parts.join(' ') });
      cur = null;
    }
  }
  if (cur && cur.parts.length) out.push({ from: cur.from, to: cur.to, content: cur.parts.join(' ') });
  return out;
}

/**
 * Normalise an OpenAI-compatible transcription response into segments.
 * Tolerates several shapes: segments[], timestamped_segments[], words[].
 */
function parseTranscription(json: any): { text: string; segments?: TranscribedSegment[] } {
  const text = String(json.text || '').trim();
  const direct = json.segments || json.timestamped_segments || json.segments_with_timestamps || json.transcript_segments;
  if (Array.isArray(direct)) {
    const segs = direct
      .map((s: any) => ({
        from: Number(s.start) || 0,
        to: Number(s.end) || Number(s.start) || 0,
        content: String(s.text || s.content || '').trim(),
      }))
      .filter((s: TranscribedSegment) => s.content);
    if (segs.length) return { text, segments: segs };
  }
  const words = json.words || json.word_timestamps || json.timestamped_words;
  if (Array.isArray(words) && words.length) {
    const segs = wordsToSegments(words);
    if (segs.length) return { text, segments: segs };
  }
  return { text };
}

/** Upload to an OpenAI-compatible /audio/transcriptions endpoint. */
function postMultipartRaw(
  filePath: string,
  config: WhisperConfig,
  withWordTimestamps: boolean,
): Promise<{ text: string; segments?: TranscribedSegment[] }> {
  return new Promise((resolve, reject) => {
    if (!isSafeUpstreamUrl(config.baseUrl)) {
      reject(new Error('不允许连接到该地址'));
      return;
    }
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
      // Word-level timestamps give us per-sentence timing. Some endpoints
      // reject this param, so the wrapper retries without it on a 4xx.
      ...(withWordTimestamps ? [header('timestamp_granularities[]', 'word'), header('timestamp_granularities[]', 'segment')] : []),
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
            resolve(parseTranscription(JSON.parse(text)));
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

/**
 * Transcribe, preferring the fast path (verbose_json alone, which most
 * endpoints answer with segment timestamps directly) and only paying for
 * word-level alignment when no segments come back.
 */
async function postMultipartTranscribe(
  filePath: string,
  config: WhisperConfig,
): Promise<{ text: string; segments?: TranscribedSegment[] }> {
  // Fast path: plain verbose_json usually yields segment timestamps directly.
  const plain = await postMultipartRaw(filePath, config, false);
  if (plain.segments?.length) return plain;
  // Slow path: no segments — ask for word-level timestamps and group them.
  try {
    return await postMultipartRaw(filePath, config, true);
  } catch (e: any) {
    if (/HTTP 400|HTTP 422/.test(String(e?.message || ''))) {
      return plain; // endpoint rejects the granularity param; keep the text-only result
    }
    throw e;
  }
}

/**
 * Transcribe a 16k-mono mp3, splitting long audio into chunks and merging the
 * results with correct time offsets so 1-3h podcasts work even when the ASR
 * provider caps single-request length.
 */
async function transcribeFileSmart(
  filePath: string,
  config: WhisperConfig,
): Promise<{ text: string; segments?: TranscribedSegment[] }> {
  const duration = await getAudioDuration(filePath);
  if (duration <= MAX_TRANSCRIBE_DURATION_SECONDS) {
    assertUploadSize(filePath);
    return postMultipartTranscribe(filePath, config);
  }

  const chunksDir = path.join(path.dirname(filePath), 'chunks');
  fs.mkdirSync(chunksDir, { recursive: true });
  const chunks = await splitAudio(filePath, chunksDir, MAX_TRANSCRIBE_DURATION_SECONDS);
  const segments: TranscribedSegment[] = [];
  const texts: string[] = [];
  for (const chunk of chunks) {
    assertUploadSize(chunk.file);
    const r = await postMultipartTranscribe(chunk.file, config);
    texts.push(r.text);
    if (r.segments?.length) {
      for (const s of r.segments) {
        segments.push({ from: s.from + chunk.start, to: s.to + chunk.start, content: s.content });
      }
    }
  }
  try { fs.rmSync(chunksDir, { recursive: true, force: true }); } catch { /* ignore */ }
  return { text: texts.join(''), segments };
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


/** End-to-end: convert a local media file, send to whisper, return segments. */
export async function transcribeLocalMedia(
  mediaPath: string,
  whisper: WhisperConfig,
): Promise<AudioTranscribeResult> {
  if (!whisper.apiKey) throw new Error('缺少 Whisper API Key');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilistudy-local-'));
  const mp3File = path.join(tmpDir, 'audio.mp3');
  try {
    await ffmpegToMp3(mediaPath, mp3File);
    const result = await transcribeFileSmart(mp3File, whisper);
    return { text: result.text, segments: result.segments || [] };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
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
    const result = await transcribeFileSmart(mp3File, whisper);
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
    const result = await transcribeFileSmart(mp3File, whisper);
    return { text: result.text, segments: result.segments || [] };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
