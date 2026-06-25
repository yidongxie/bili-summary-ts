import fs from "fs";
import path from "path";

export interface DouyinFallbackResult {
  filePath: string;
  title: string;
  author: string;
  webpageUrl: string;
}

const MEDIA_EXTENSIONS = new Set([".mp4", ".mp3", ".m4a", ".mov", ".webm"]);

function walkMediaFiles(dir: string): Map<string, { mtimeMs: number; size: number }> {
  const files = new Map<string, { mtimeMs: number; size: number }>();
  if (!fs.existsSync(dir)) return files;

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const st = fs.statSync(full);
      files.set(full, { mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return files;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
  return data;
}

function pickNewMediaFile(before: Map<string, { mtimeMs: number; size: number }>, after: Map<string, { mtimeMs: number; size: number }>): string | null {
  const candidates: Array<{ file: string; mtimeMs: number; size: number }> = [];
  for (const [file, meta] of after) {
    const old = before.get(file);
    if (!old || old.mtimeMs !== meta.mtimeMs || old.size !== meta.size) {
      candidates.push({ file, ...meta });
    }
  }
  candidates.sort((a, b) => (b.mtimeMs - a.mtimeMs) || (b.size - a.size));
  return candidates[0]?.file || null;
}

export function isDouyinDownloaderAvailable(): boolean {
  return !!process.env.DOUYIN_DOWNLOADER_API;
}

export async function downloadWithDouyinDownloader(url: string): Promise<DouyinFallbackResult> {
  const api = (process.env.DOUYIN_DOWNLOADER_API || "").replace(/\/+$/, "");
  if (!api) throw new Error("DOUYIN_DOWNLOADER_API 未配置");
  const outputDir = process.env.DOUYIN_DOWNLOADER_OUTPUT_DIR || path.resolve(process.cwd(), "data", "douyin-downloader", "Downloaded");

  const before = walkMediaFiles(outputDir);
  const created = await fetchJson(api + "/api/v1/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const jobId = created.job_id;
  if (!jobId) throw new Error("抖音专用解析服务没有返回 job_id");

  const deadline = Date.now() + 5 * 60 * 1000;
  let lastJob: any = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    lastJob = await fetchJson(api + "/api/v1/jobs/" + encodeURIComponent(jobId));
    if (lastJob.status === "success") break;
    if (lastJob.status === "failed") throw new Error(lastJob.error || "抖音专用解析失败");
  }
  if (!lastJob || lastJob.status !== "success") throw new Error("抖音专用解析超时");

  const after = walkMediaFiles(outputDir);
  const filePath = pickNewMediaFile(before, after);
  if (!filePath) throw new Error("抖音专用解析完成，但未找到下载的媒体文件");

  const base = path.basename(filePath, path.extname(filePath));
  return {
    filePath,
    title: base || "抖音视频",
    author: "抖音",
    webpageUrl: url,
  };
}
