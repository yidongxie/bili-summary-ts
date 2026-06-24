/**
 * yt-dlp 视频提取器
 * 支持 1000+ 网站，包括抖音、小红书、YouTube 等
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

export interface VideoInfo {
  title: string;
  author: string;
  duration: number;
  videoUrl: string;
  audioUrl: string;
  coverUrl: string;
  webpageUrl: string;
  platform: string;
  description: string;
}

/**
 * 查找 yt-dlp 可执行文件路径
 */
export function findYtDlpPath(): string | null {
  const possiblePaths = [
    // Explicit deploy/runtime override
    process.env.YT_DLP_PATH || "",
    // 项目 tools 目录
    path.join(process.cwd(), "tools", "yt-dlp.exe"),
    path.join(process.cwd(), "tools", "yt-dlp"),
    // 项目根目录
    path.join(process.cwd(), "yt-dlp.exe"),
    path.join(process.cwd(), "yt-dlp"),
    // 全局命令
    "yt-dlp",
    "yt-dlp.exe",
  ];

  for (const p of possiblePaths) {
    if (!p) continue;
    if (p === "yt-dlp" || p === "yt-dlp.exe") {
      return p; // 全局命令
    }
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * 检查 yt-dlp 是否可用
 */
export async function isYtDlpAvailable(): Promise<boolean> {
  const version = await getYtDlpVersion();
  return version !== null && version.length > 0;
}

/**
 * 获取 yt-dlp 版本
 */
export async function getYtDlpVersion(): Promise<string | null> {
  const ytDlpPath = findYtDlpPath();
  if (!ytDlpPath) return null;

  try {
    const { stdout } = await execFileAsync(ytDlpPath, ["--version"], { timeout: 15000 });
    return stdout.trim();
  } catch (error: any) {
    console.error("[yt-dlp] version check failed:", error.message);
    return null;
  }
}

/**
 * 提取视频信息
 */
export async function extractVideoInfo(url: string, cookies?: string): Promise<VideoInfo> {
  const ytDlpPath = findYtDlpPath();
  if (!ytDlpPath) {
    throw new Error("yt-dlp 未安装，请先安装 yt-dlp");
  }

  try {
    // 使用 yt-dlp 获取视频元数据，同时获取最佳音频和视频 URL。
    // Use execFile with argv so user-controlled URLs never pass through a shell.
    const args = [
      "--no-playlist",
      "--skip-download",
      "--no-update",
      "--print-json",
      "--format", "bestaudio/best",
    ];
    let cookieFile = "";
    try {
      if (cookies?.trim()) {
        cookieFile = path.join(process.cwd(), "data", `yt-dlp-cookies-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
        fs.mkdirSync(path.dirname(cookieFile), { recursive: true });
        fs.writeFileSync(cookieFile, cookies.trim() + "\n", { mode: 0o600 });
      }
      if (cookieFile) {
        args.push("--cookies", cookieFile);
      } else if (process.env.YT_DLP_COOKIES_FILE) {
        args.push("--cookies", process.env.YT_DLP_COOKIES_FILE);
      } else if (process.env.YT_DLP_BROWSER_COOKIES) {
        args.push("--cookies-from-browser", process.env.YT_DLP_BROWSER_COOKIES);
      }
    } catch (err: any) {
      console.error("[yt-dlp] cookies setup failed:", err.message);
    }
    args.push(url);

    let stdout = "";
    try {
      const result = await execFileAsync(ytDlpPath, args, { timeout: 60000 });
      stdout = result.stdout;
    } finally {
      if (cookieFile) {
        try { fs.unlinkSync(cookieFile); } catch { /* ignore */ }
      }
    }
    const data = JSON.parse(stdout.trim());

    // 提取音频 URL - 从 requested_formats 或直接获取 url
    let audioUrl = data.url || "";
    if (data.requested_formats && data.requested_formats.length > 0) {
      const audioFormat = data.requested_formats.find((f: any) =>
        f.acodec && f.acodec !== "none"
      );
      if (audioFormat) {
        audioUrl = audioFormat.url;
      }
    }

    // 如果还是没有，尝试从 formats 中找
    if (!audioUrl && data.formats) {
      const audioFormats = data.formats.filter((f: any) =>
        f.acodec && f.acodec !== "none" && f.vcodec === "none"
      );
      if (audioFormats.length > 0) {
        // 按音质排序，取最好的
        audioFormats.sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0));
        audioUrl = audioFormats[0].url;
      }
    }

    // 确定平台
    let platform = data.extractor || data.extractor_key || "unknown";
    if (/douyin|iesdouyin/i.test(platform) || /douyin|iesdouyin/i.test(url)) {
      platform = "douyin";
    } else if (/xiaohongshu/i.test(platform) || /xiaohongshu/i.test(url)) {
      platform = "xiaohongshu";
    } else if (/bilibili/i.test(platform) || /bilibili/i.test(url)) {
      platform = "bilibili";
    } else if (/youtube/i.test(platform)) {
      platform = "youtube";
    }

    return {
      title: data.title || data.fulltitle || "视频",
      author: data.uploader || data.artist || data.creator || data.channel || "未知作者",
      duration: data.duration || 0,
      videoUrl: data.url || data.webpage_url || url,
      audioUrl: audioUrl || data.url || "",
      coverUrl: data.thumbnail || data.thumbnails?.[0]?.url || "",
      webpageUrl: data.webpage_url || url,
      platform,
      description: data.description || "",
    };
  } catch (error: any) {
    console.error("[yt-dlp] 提取失败:", error.message);
    const msg = error.message || "请检查链接是否正确";
    if (/Fresh cookies|cookies.*needed|login required/i.test(msg)) {
      throw new Error("视频提取失败: 该平台需要服务器配置有效 Cookies。请在服务器设置 YT_DLP_COOKIES_FILE 后重试。\n导出浏览器 cookies.txt 后放到服务器，例如 /opt/bili-summary/cookies/douyin.txt");
    }
    throw new Error(`视频提取失败: ${msg}`);
  }
}

/**
 * 检测 URL 是否支持
 */
export function isUrlSupported(url: string): boolean {
  // 常见支持的域名模式
  const supportedPatterns = [
    /douyin\.com/i,
    /iesdouyin\.com/i,
    /xiaohongshu\.com/i,
    /bilibili\.com/i,
    /b23\.tv/i,
    /youtube\.com/i,
    /youtu\.be/i,
    /xiaoyuzhou\.fm/i,
    /xyz\.fm/i,
    /tiktok\.com/i,
    /instagram\.com/i,
    /twitter\.com/i,
    /x\.com/i,
    /vimeo\.com/i,
    /twitch\.tv/i,
  ];

  return supportedPatterns.some(pattern => pattern.test(url));
}

/**
 * 从文本中提取 URL（处理抖音/小红书分享时带文字的情况）
 */
export function extractUrlFromText(text: string): string {
  // 匹配 URL 的正则
  const urlPattern = /https?:\/\/[^\s]+/g;
  const matches = text.match(urlPattern);
  if (matches && matches.length > 0) {
    return matches[0].trim();
  }
  return text.trim();
}

/**
 * 验证 URL 格式并给出提示
 */
export function validateUrl(url: string): { valid: boolean; message?: string; cleanedUrl?: string } {
  // 先从文本中提取纯 URL
  const cleanedUrl = extractUrlFromText(url);

  // 检查抖音链接格式
  if (/douyin\.com/i.test(cleanedUrl)) {
    // 检查是否是分享短链
    if (/v\.douyin\.com\/[a-zA-Z0-9]+/i.test(cleanedUrl)) {
      return { valid: true, cleanedUrl };
    }
    // 检查是否是视频长链
    if (/douyin\.com\/video\/\d+/i.test(cleanedUrl)) {
      return { valid: true, cleanedUrl };
    }
    // 不支持的抖音页面
    return {
      valid: false,
      cleanedUrl,
      message: '请使用抖音手机端分享的链接（格式：https://v.douyin.com/xxxxxx/），不要使用网页版精选页面链接',
    };
  }

  // 检查小红书链接格式
  if (/xiaohongshu\.com/i.test(cleanedUrl) || /xhslink\.com/i.test(cleanedUrl)) {
    if (/xhslink\.com/i.test(cleanedUrl) || /\/discovery\/item\//i.test(cleanedUrl) || /\/explore\//i.test(cleanedUrl)) {
      return { valid: true, cleanedUrl };
    }
    return {
      valid: false,
      cleanedUrl,
      message: '请使用小红书 APP 分享的链接（点击笔记右上角分享 → 复制链接）',
    };
  }

  // 默认通过（其他平台由 yt-dlp 自己处理）
  return { valid: true, cleanedUrl };
}

/**
 * 获取平台中文名称
 */
export function getPlatformName(platform: string): string {
  const names: Record<string, string> = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    bilibili: "B站",
    youtube: "YouTube",
    xiaoyuzhou: "小宇宙",
    tiktok: "TikTok",
    instagram: "Instagram",
    twitter: "Twitter",
    vimeo: "Vimeo",
    twitch: "Twitch",
  };
  return names[platform.toLowerCase()] || platform;
}
