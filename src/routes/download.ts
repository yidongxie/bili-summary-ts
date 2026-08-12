/** Bilibili video download route. */

import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import { spawn } from "child_process";
import Database from "better-sqlite3";
import { enforceRateLimit } from "../common/rateLimit";
import { getDecryptedConfig } from "../db/configStore";
import { contentDisposition, slugify } from "./utils";
import { fetchVideoInfo, extractVideoId } from "../bilibili/api";
import { findYtDlpPath } from "../common/YtDlpExtractor";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BILI_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

const MAX_VIDEO_DOWNLOAD_BYTES = parseInt(process.env.MAX_VIDEO_DOWNLOAD_BYTES || String(2 * 1024 * 1024 * 1024), 10);

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  return "ffmpeg";
}

function requireUser(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

function requestJson<T>(url: string, headers?: Record<string, string>, timeout = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(url, { headers, timeout }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e}`));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
  });
}

interface PlayUrlResponse {
  code: number;
  message: string;
  data?: {
    durl?: Array<{ url: string; size: number }>;
    dash?: {
      video?: Array<{ baseUrl?: string; base_url?: string; bandwidth?: number; height?: number; width?: number; codecs?: string; id?: number }>;
      audio?: Array<{ baseUrl?: string; base_url?: string; bandwidth?: number }>;
    };
  };
}

type ResolvedStream =
  | { kind: "durl"; url: string; size?: number; height?: number }
  | { kind: "dash"; videoUrl: string; audioUrl: string; height?: number };

/**
 * Extract the SESSDATA value from a cookie dump that may be either
 * header style ("SESSDATA=abc; bili_jct=...") or Netscape cookies.txt
 * (domain / path / secure / expiry / name / value, tab-separated).
 */
export function extractSessdata(cookieDump: string): string {
  const raw = String(cookieDump || "");
  // Header style: SESSDATA=value;
  const header = raw.match(/SESSDATA=([^;\s]+)/);
  if (header) return header[1].trim();
  // Netscape style: look for a row whose 5th field is SESSDATA.
  for (const line of raw.split(/\r?\n/)) {
    const cols = line.split(/\t+/);
    if (cols.length >= 7 && cols[5]?.trim() === "SESSDATA") {
      const value = cols[6]?.trim();
      if (value) return value;
    }
  }
  return "";
}

/**
 * Resolve the best video stream. 1080p+ on Bilibili is only served via DASH
 * and requires a logged-in SESSDATA cookie, so we prefer DASH and fall back
 * to a combined MP4 (durl) which tops out around 720p.
 */
async function resolveStreams(bvid: string, cid: number, sessdata: string, qn = 116): Promise<ResolvedStream | null> {
  const headers = { ...BILI_HEADERS };
  if (sessdata?.trim()) headers.Cookie = `SESSDATA=${sessdata.trim()}`;

  // DASH carries every quality level (1080p / 1080p60 / 4K with membership).
  const dash = await requestJson<PlayUrlResponse>(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${qn}&fnval=4048&fnver=0&fourk=1`,
    headers,
  );
  if (dash.code === 0 && dash.data?.dash?.video?.length && dash.data.dash.audio?.length) {
    // Prefer highest resolution, then highest bitrate within it.
    const video = [...dash.data.dash.video].sort(
      (a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0),
    )[0];
    const audio = [...dash.data.dash.audio].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
    const videoUrl = video.baseUrl || video.base_url || "";
    const audioUrl = audio.baseUrl || audio.base_url || "";
    if (videoUrl && audioUrl) return { kind: "dash", videoUrl, audioUrl, height: video.height };
  }

  // Fallback: combined MP4 (only up to ~720p).
  const durlRes = await requestJson<PlayUrlResponse>(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${qn}&fnval=0&fnver=0&fourk=1`,
    headers,
  );
  if (durlRes.code === 0 && durlRes.data?.durl?.length) {
    const first = durlRes.data.durl[0];
    return { kind: "durl", url: first.url, size: first.size };
  }

  throw new Error(`B站接口错误: ${dash.code !== 0 ? dash.message : "无可用视频流"}`);
}

/** Stream an upstream response to res, forwarding Range for resumable downloads. */
function proxyStream(req: Request, res: Response, upstreamUrl: string): void {
  const parsed = new URL(upstreamUrl);
  const mod = parsed.protocol === "https:" ? https : http;
  const range = req.headers.range || undefined;
  const upstreamReq = mod.get(
    upstreamUrl,
    { headers: { ...BILI_HEADERS, ...(range ? { Range: range } : {}) }, timeout: 30000 },
    (upstream) => {
      if (upstream.statusCode && upstream.statusCode >= 400) {
        res.status(502).json({ success: false, error: `B站媒体返回 ${upstream.statusCode}` });
        upstream.resume();
        return;
      }
      res.status(upstream.statusCode === 206 ? 206 : 200);
      ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"].forEach((h) => {
        const v = upstream.headers[h];
        if (v) res.setHeader(h, v);
      });
      res.setHeader("X-Accel-Buffering", "no");
      let aborted = false;
      res.on("close", () => { aborted = true; upstreamReq.destroy(); });
      upstream.on("data", (c: Buffer) => { if (!aborted) res.write(c); });
      upstream.on("end", () => { if (!aborted) res.end(); });
      upstream.on("error", () => { if (!aborted) res.end(); });
    },
  );
  upstreamReq.on("error", (err: Error) => {
    console.error("[download] upstream error", err.message);
    if (!res.headersSent) res.status(502).json({ success: false, error: "获取视频流失败" });
    else res.end();
  });
  upstreamReq.on("timeout", () => { upstreamReq.destroy(new Error("timeout")); });
}

/**
 * List all videos from a Bilibili uploader's space via yt-dlp's flat
 * playlist mode (fast — no downloads, just metadata).
 */
async function listUploaderVideos(url: string, cookies?: string): Promise<{ uploader: string; videos: Array<{ title: string; bvid: string; duration?: number }> }> {
  const ytDlpPath = findYtDlpPath();
  if (!ytDlpPath) throw new Error("yt-dlp 未安装，无法获取博主视频列表");

  const args = [
    "--flat-playlist",
    "--no-warnings",
    "--no-update",
    "--print-json",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    url,
  ];
  let cookieFile = "";
  try {
    if (cookies?.trim()) {
      cookieFile = path.join(process.cwd(), "data", `yt-dlp-uploader-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
      fs.mkdirSync(path.dirname(cookieFile), { recursive: true });
      fs.writeFileSync(cookieFile, cookies.trim() + "\n", { mode: 0o600 });
      args.splice(args.length - 1, 0, "--cookies", cookieFile);
    }
  } catch (err: any) {
    console.error("[uploader] cookies setup failed:", err.message);
  }

  let stdout = "";
  try {
    const result = await execFileAsync(ytDlpPath, args, { timeout: 60000 });
    stdout = result.stdout;
  } catch (err: any) {
    console.error("[uploader] yt-dlp failed:", err.message);
    throw new Error("无法获取博主视频列表，请确认输入的是博主空间链接（如 space.bilibili.com/UID）");
  } finally {
    if (cookieFile) { try { fs.unlinkSync(cookieFile); } catch { /* ignore */ } }
  }

  const videos: Array<{ title: string; bvid: string; duration?: number }> = [];
  let uploader = "";

  // With --print-json + --flat-playlist yt-dlp prints one JSON object per
  // entry line. Tolerate both that and a single playlist JSON with entries[].
  const parsedEntries: any[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (Array.isArray(obj.entries)) parsedEntries.push(...obj.entries);
      else parsedEntries.push(obj);
    } catch { /* skip non-JSON */ }
  }
  for (const entry of parsedEntries) {
    if (entry.uploader || entry.channel) uploader = entry.uploader || entry.channel || uploader;
    const bvid = String(entry.id || "").match(/BV[a-zA-Z0-9]{10,}/)?.[0] || "";
    if (bvid) {
      videos.push({ title: entry.title || "未命名", bvid, duration: Number(entry.duration) || undefined });
    }
  }
  return { uploader, videos };
}

/** Mux DASH video+audio into a fragmented MP4 via ffmpeg, streaming to res. */
function muxDash(res: Response, videoUrl: string, audioUrl: string): void {
  const ffmpeg = resolveFfmpegPath();
  const headersArg =
    "Referer: https://www.bilibili.com\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n";
  const args = [
    "-hide_banner", "-loglevel", "error",
    "-headers", headersArg,
    "-i", videoUrl,
    "-headers", headersArg,
    "-i", audioUrl,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c", "copy",
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1",
  ];
  const p = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  p.stderr.on("data", (c) => { stderr += c.toString(); });
  p.on("error", (e) => {
    console.error("[download] ffmpeg spawn error", e.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: "ffmpeg 不可用，请确认服务器已安装 ffmpeg" });
    else res.end();
  });
  p.on("close", (code) => {
    if (code !== 0) console.error("[download] ffmpeg exit", code, stderr.slice(-400));
    res.end();
  });
  res.on("close", () => { p.kill(); });
  p.stdout.pipe(res);
}

export function createDownloadRouter(db: Database.Database): Router {
  const router = Router();

  // List all videos from an uploader's space (yt-dlp flat playlist).
  router.get("/api/download/uploader", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "download-uploader", 6, 10 * 60 * 1000, String(userId))) return;

    const raw = String(req.query.url || req.query.uid || "").trim();
    if (!raw) { res.status(400).json({ success: false, error: "缺少博主空间链接或 UID" }); return; }

    let url = raw;
    const uidMatch = raw.match(/^(?:UID|uid)?\s*(\d+)$/);
    if (uidMatch) {
      url = `https://space.bilibili.com/${uidMatch[1]}/video`;
    } else if (/space\.bilibili\.com/i.test(raw)) {
      // ensure it points at the video tab
      if (!/\/video/i.test(raw)) url = raw.replace(/\/+$/, "") + "/video";
    } else {
      res.status(400).json({ success: false, error: "请输入博主空间链接（如 https://space.bilibili.com/UID）" });
      return;
    }

    try {
      const config = getDecryptedConfig(db, userId);
      const cookies = config.yt_dlp_cookies || "";
      const { uploader, videos } = await listUploaderVideos(url, cookies);
      if (!videos.length) {
        res.status(400).json({
          success: false,
          error: "未能获取到视频列表。B站空间列表需要登录 cookies，请到设置页一键提取 B站 cookies 后重试。",
        });
        return;
      }
      res.json({ success: true, uploader, url, total: videos.length, videos });
    } catch (err: any) {
      console.error("[uploader] failed", err.message);
      if (!res.headersSent) res.status(500).json({ success: false, error: err.message || "获取视频列表失败" });
    }
  });

  router.get("/api/download/bilibili", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "download-bili", 20, 10 * 60 * 1000, String(userId))) return;

    const raw = String(req.query.bvid || req.query.url || "").trim();
    if (!raw) { res.status(400).json({ success: false, error: "缺少 bvid 或 url" }); return; }

    let bvid = raw;
    const bvMatch = raw.match(/BV[a-zA-Z0-9]{10,}/);
    if (bvMatch) {
      bvid = bvMatch[0];
    } else if (/bilibili\.com|b23\.tv/i.test(raw)) {
      try { bvid = await extractVideoId(raw); } catch (e: any) { res.status(400).json({ success: false, error: e?.message || "无法解析链接" }); return; }
    } else {
      res.status(400).json({ success: false, error: "仅支持 B 站视频链接或 BV 号" });
      return;
    }

    try {
      const info = await fetchVideoInfo(bvid);
      const config = getDecryptedConfig(db, userId);
      // yt_dlp_cookies is a Netscape/header-style cookie dump; pull SESSDATA
      // out of it so we can attach it to the playurl request for higher
      // quality. Videos without a login still download fine at base quality.
      const sessdata = extractSessdata(config.yt_dlp_cookies || "");

      // qn param: 112=1080p, 116=1080p60, 120=4K (needs membership). Default 116.
      const qn = parseInt(String(req.query.qn || "116"), 10);
      const validQn = [32, 64, 80, 112, 116, 120].includes(qn) ? qn : 116;

      const streams = await resolveStreams(bvid, info.cid, sessdata, validQn);
      if (!streams) {
        res.status(400).json({ success: false, error: "未能获取到可下载的视频流（可能需登录或该视频不可下载）" });
        return;
      }

      const filename = `${slugify(info.title)}.mp4`;
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", contentDisposition(filename));
      if (streams.height) res.setHeader("X-Video-Height", String(streams.height));

      if (streams.kind === "durl") {
        if (streams.size && streams.size > MAX_VIDEO_DOWNLOAD_BYTES) {
          res.status(413).json({ success: false, error: `视频过大（${Math.ceil(streams.size / 1024 / 1024)}MB），超出下载限制` });
          return;
        }
        proxyStream(req, res, streams.url);
      } else {
        muxDash(res, streams.videoUrl, streams.audioUrl);
      }
    } catch (err: any) {
      console.error("[download] failed", err.message);
      if (!res.headersSent) res.status(500).json({ success: false, error: `下载失败: ${err.message}` });
    }
  });

  return router;
}
