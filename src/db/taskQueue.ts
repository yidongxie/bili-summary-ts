/** Async task queue for summarize jobs + SSE progress */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import { extractVideoId as extractBilibiliVideoId, fetchVideoInfo as fetchBilibiliVideoInfo, segmentsToParagraphs, fetchPageList, isBilibiliUrl } from "../bilibili/api";
import { isXiaoyuzhouUrl, extractEpisodeId, fetchEpisodeInfo } from "../xiaoyuzhou/api";
import { isYtDlpAvailable, extractVideoInfo as extractWithYtDlp, isUrlSupported, getPlatformName, validateUrl } from "../common/YtDlpExtractor";
import { transcribeBilibiliAudio, transcribeAudioUrl, transcribeLocalMedia } from "../whisper/transcribe";
import { summarizeText, suggestTags, SummaryMode } from "../llm/summarize";
import { enforceRateLimit } from "../common/rateLimit";
import { getDecryptedConfig } from "./configStore";
import { downloadWithDouyinDownloader, isDouyinDownloaderAvailable } from "../common/DouyinDownloaderFallback";
import { formatDuration } from "../common/date";

const MAX_DAILY_SUMMARIES = parseInt(process.env.MAX_DAILY_SUMMARIES || "10", 10);
const MAX_SUBTITLE_CHARS = parseInt(process.env.MAX_SUBTITLE_CHARS || "60000", 10);
const MAX_CONCURRENT_TASKS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_TASKS || "2", 10));
const MAX_PENDING_TASKS_PER_USER = Math.max(1, parseInt(process.env.MAX_PENDING_TASKS_PER_USER || "5", 10));
const MAX_MEDIA_DURATION_SECONDS = Math.max(60, parseInt(process.env.MAX_MEDIA_DURATION_SECONDS || "10800", 10));

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

interface Task {
  id: string;
  userId: number;
  userEmail: string;
  status: "pending" | "running" | "done" | "error";
  progress: string;
  result?: any;
  error?: string;
  createdAt: number;
  url: string;
  body: any;
  res: Response | null; // SSE response to push to
}

const tasks = new Map<string, Task>();
const userTasks = new Map<number, string[]>(); // userId -> taskIds
const queuedTaskIds: string[] = [];
let activeTaskCount = 0;

function startQueuedTasks(db: Database.Database) {
  while (activeTaskCount < MAX_CONCURRENT_TASKS && queuedTaskIds.length > 0) {
    const id = queuedTaskIds.shift()!;
    const task = tasks.get(id);
    if (!task || task.status !== "pending") continue;
    activeTaskCount += 1;
    setImmediate(async () => {
      try {
        await runTask(db, task, task.url, task.body);
      } finally {
        activeTaskCount = Math.max(0, activeTaskCount - 1);
        startQueuedTasks(db);
      }
    });
  }
}

function enqueueTask(db: Database.Database, task: Task) {
  queuedTaskIds.push(task.id);
  startQueuedTasks(db);
}

function loadPersistedTask(db: Database.Database, id: string): Task | null {
  const row = db.prepare("SELECT * FROM summary_tasks WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    status: row.status,
    progress: row.progress,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    url: "",
    body: {},
    res: null,
  };
}

function updateProgress(db: Database.Database, task: Task, progress: string) {
  task.progress = progress;
  // Narrow write: only progress and updated_at
  db.prepare("UPDATE summary_tasks SET progress = ?, updated_at = ? WHERE id = ?").run(progress, Date.now(), task.id);
  sendSSE(task, "status", { status: task.status, progress: task.progress });
}

function failTask(db: Database.Database, task: Task, error: string) {
  task.error = error;
  task.status = "error";
  task.progress = "";
  db.prepare("UPDATE summary_tasks SET status = 'error', progress = '', error = ?, updated_at = ? WHERE id = ?").run(error, Date.now(), task.id);
  sendSSE(task, "error", { error: task.error });
}

function completeTask(db: Database.Database, task: Task, result: any) {
  task.status = "done";
  task.result = result;
  task.progress = "完成";
  db.prepare(
    "UPDATE summary_tasks SET status = 'done', progress = '完成', result_json = ?, updated_at = ? WHERE id = ?"
  ).run(JSON.stringify(result), Date.now(), task.id);
  sendSSE(task, "complete", result);
}

function getOrCreateTaskId(db: Database.Database, userId: number, userEmail: string, url: string, body: any): string {
  const id = crypto.randomUUID();
  const task: Task = {
    id,
    userId,
    userEmail,
    status: "pending",
    progress: "排队中…",
    createdAt: Date.now(),
    url,
    body,
    res: null,
  };
  tasks.set(id, task);
  if (!userTasks.has(userId)) userTasks.set(userId, []);
  const list = userTasks.get(userId)!;
  while (list.length >= 10) {
    const old = list[0];
    const oldTask = tasks.get(old);
    if (oldTask && (oldTask.status === "pending" || oldTask.status === "running")) break;
    list.shift();
    tasks.delete(old);
    db.prepare("DELETE FROM summary_tasks WHERE id = ? AND status IN ('done', 'error')").run(old);
  }
  list.push(id);
  db.prepare(
    "INSERT INTO summary_tasks (id, user_id, user_email, status, progress, created_at, updated_at) VALUES (?, ?, ?, 'pending', '排队中…', ?, ?)"
  ).run(id, userId, userEmail, task.createdAt, Date.now());
  return id;
}

function countActiveUserTasks(userId: number): number {
  let count = 0;
  for (const task of tasks.values()) {
    if (task.userId === userId && (task.status === "pending" || task.status === "running")) count += 1;
  }
  return count;
}

function chargeDailyUsage(db: Database.Database, userId: number, userEmail: string): boolean {
  if (ADMIN_EMAIL && userEmail === ADMIN_EMAIL) return true;
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare("SELECT summarize_count FROM daily_usage WHERE user_id = ? AND date = ?")
    .get(userId, today) as { summarize_count?: number } | undefined;
  if ((row?.summarize_count || 0) >= MAX_DAILY_SUMMARIES) return false;
  db.prepare(
    `INSERT INTO daily_usage (user_id, date, summarize_count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, date) DO UPDATE SET summarize_count = summarize_count + 1`
  ).run(userId, today);
  return true;
}

function assertDurationWithinLimit(duration: number | undefined, label = "内容") {
  if (duration && duration > MAX_MEDIA_DURATION_SECONDS) {
    throw new Error(`${label}时长超过限制（最长 ${Math.floor(MAX_MEDIA_DURATION_SECONDS / 60)} 分钟）`);
  }
}

function sendSSE(task: Task, event: string, data: any) {
  if (!task.res) return;
  if (task.res.writableEnded) { task.res = null; return; }
  try {
    task.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // client disconnected
  }
}

export function createTaskRouter(db: Database.Database): Router {
  const router = Router();

  // SSE endpoint
  router.get("/api/tasks/:id/events", (req: Request, res: Response) => {
    let task = tasks.get(req.params.id);
    if (!task) {
      const persisted = loadPersistedTask(db, req.params.id);
      if (persisted) {
        // Only cache non-terminal tasks in memory to avoid stale res references
        if (persisted.status === "pending" || persisted.status === "running") {
          tasks.set(persisted.id, persisted);
        }
        task = persisted;
      }
    }
    if (!task) {
      res.status(404).json({ success: false, error: "任务不存在" });
      return;
    }
    const userId = (req as any).user?.id;
    if (!userId || task.userId !== userId) {
      res.status(403).json({ success: false, error: "无权访问此任务" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    task.res = res;

    // Send current state
    sendSSE(task, "status", { status: task.status, progress: task.progress });

    // If already done or error, send result and close
    if (task.status === "done" || task.status === "error") {
      if (task.status === "done") sendSSE(task, "complete", task.result);
      else sendSSE(task, "error", { error: task.error });
      res.end();
      task.res = null;
      return;
    }

  const heartbeat = setInterval(() => {
      if (!task.res || task.res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      try { task.res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      task.res = null;
    });
  });

  // Polling endpoint for mini programs (no SSE support)
  router.get("/api/tasks/:id/poll", (req: Request, res: Response) => {
    let task = tasks.get(req.params.id);
    if (!task) {
      const persisted = loadPersistedTask(db, req.params.id);
      if (persisted) task = persisted;
    }
    if (!task) { res.status(404).json({ success: false, error: "任务不存在" }); return; }

    const userId = (req as any).user?.id;
    if (!userId || task.userId !== userId) {
      res.status(403).json({ success: false, error: "无权访问此任务" });
      return;
    }

    const row = db.prepare("SELECT status, progress, result_json, error FROM summary_tasks WHERE id = ?").get(task.id) as any;
    if (row?.status === "done") {
      res.json({ status: "done", ...JSON.parse(row.result_json || "{}") });
    } else if (row?.status === "error") {
      res.json({ status: "error", error: row.error || "任务失败" });
    } else {
      res.json({ status: row?.status || "pending", progress: row?.progress || "处理中…" });
    }
  });

  // Submit task
  router.post("/api/tasks/summarize", async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const userEmail = (req as any).user?.email || "";
    if (!userId) {
      res.status(401).json({ success: false, error: "请先登录" });
      return;
    }

    if (!enforceRateLimit(req, res, "task", 20, 60 * 60 * 1000, String(userId))) return;

    const url = String(req.body.url || "").trim();
    if (!url) { res.json({ success: false, error: "请输入视频链接" }); return; }

    if (countActiveUserTasks(userId) >= MAX_PENDING_TASKS_PER_USER) {
      res.status(429).json({ success: false, error: `排队任务过多，请等待当前任务完成后再提交` });
      return;
    }

    if (!chargeDailyUsage(db, userId, userEmail)) {
      res.status(429).json({
        success: false,
        error: `今日总结次数已达上限（${MAX_DAILY_SUMMARIES} 次）`,
      });
      return;
    }

    const taskId = getOrCreateTaskId(db, userId, userEmail, url, req.body);
    const task = tasks.get(taskId)!;

    res.json({ success: true, task_id: taskId });
    enqueueTask(db, task);
  });

  return router;
}

/** Get whisper config with admin fallback */
function getWhisperConfig(db: Database.Database, userEmail: string, body: any, config: any) {
  let whisperApiKey = String(body.whisper_api_key || config.whisper_api_key || "").trim();
  let whisperBaseUrl = String(body.whisper_base_url || config.whisper_base_url || "https://api.siliconflow.cn/v1").trim();
  let whisperModel = String(body.whisper_model || config.whisper_model || "TeleAI/TeleSpeechASR").trim();

  if (!whisperApiKey && ADMIN_EMAIL && userEmail !== ADMIN_EMAIL) {
    const adminRow = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(ADMIN_EMAIL) as { id?: number } | undefined;
    if (adminRow?.id) {
      const adminConfig = getDecryptedConfig(db, adminRow.id);
      if (adminConfig.whisper_api_key) {
        whisperApiKey = adminConfig.whisper_api_key;
        // Always use the admin's baseUrl/model with the admin's key, so the key
        // can never be sent to a user-controlled endpoint.
        whisperBaseUrl = adminConfig.whisper_base_url || whisperBaseUrl;
        whisperModel = adminConfig.whisper_model || whisperModel;
      }
    }
  }

  return { apiKey: whisperApiKey, baseUrl: whisperBaseUrl, model: whisperModel };
}

/** Process Bilibili video */
async function processBilibili(
  db: Database.Database,
  task: Task,
  url: string,
  whisperConfig: { apiKey: string; baseUrl: string; model: string },
  llmConfig: { apiKey: string; baseUrl: string; model: string },
  mode: SummaryMode
) {
  const videoId = await extractBilibiliVideoId(url);

  updateProgress(db, task, "获取视频元数据…");
  const info = await fetchBilibiliVideoInfo(videoId);
  assertDurationWithinLimit(info.duration, "视频");
  const bvid = info.bvid;
  const cid = info.cid;

  const pages = await fetchPageList(bvid);
  const correctCid = pages.length && pages[0].cid ? pages[0].cid : cid;
  if (correctCid !== cid) console.log("[cid] pagelist cid=%d differs from view cid=%d, using pagelist", correctCid, cid);

  if (!whisperConfig.apiKey) {
    throw new Error("请先在设置中填写 Whisper API Key");
  }
  if (!correctCid) {
    throw new Error("无法获取视频音频信息，请稍后重试");
  }

  updateProgress(db, task, "语音转写中…");
  const whisperResult = await transcribeBilibiliAudio(bvid, correctCid, whisperConfig);
  let subtitles = whisperResult.segments?.length
    ? whisperResult.segments
    : whisperResult.text ? [{ from: 0, to: info.duration, content: whisperResult.text }] : [];

  if (!subtitles.length) {
    throw new Error("未能获取转写内容，请稍后重试");
  }

  let transcript = segmentsToParagraphs(subtitles).map((p: any) => p.content).join("\n\n");
  let transcriptTruncated = false;
  let originalTranscriptLength = transcript.length;

  if (transcript.length > MAX_SUBTITLE_CHARS) {
    transcriptTruncated = true;
    const head = Math.floor(MAX_SUBTITLE_CHARS * 0.7);
    const tail = MAX_SUBTITLE_CHARS - head;
    transcript =
      transcript.slice(0, head) +
      `\n\n[字幕过长，中间部分已省略 / Subtitle truncated, middle omitted]\n\n` +
      transcript.slice(-tail);
    updateProgress(db, task, `字幕过长（${originalTranscriptLength} 字），已自动截取前后共 ${MAX_SUBTITLE_CHARS} 字进行总结…`);
  }

  if (!transcript) {
    throw new Error("未能获取转写内容，请稍后重试");
  }

  updateProgress(db, task, "AI 总结中…");
  let summary = await summarizeText(transcript, llmConfig, mode, {
    title: info.title,
    author: info.author,
    duration: formatDuration(info.duration),
  });
  if (transcriptTruncated) summary += `\n\n> 字幕过长（${originalTranscriptLength} 字），本总结基于截取后的 ${MAX_SUBTITLE_CHARS} 字内容生成。`;

  updateProgress(db, task, "生成标签…");
  const suggestedTags = await suggestTags(info.title, info.author, summary, llmConfig);

  const subtitleSegments = subtitles
    .filter((s: any) => s.content?.trim())
    .map((s: any) => ({ from: s.from, to: s.to, content: s.content.trim() }));

  return {
    type: "bilibili" as const,
    video: { title: info.title, author: info.author, duration: info.duration, bvid, link: `https://www.bilibili.com/video/${bvid}`, pic: info.pic },
    subtitle_count: subtitles.length,
    transcript_source: "whisper" as const,
    subtitle_segments: subtitleSegments,
    transcript,
    summary,
    mode,
    suggested_tags: suggestedTags,
  };
}

/** Process Xiaoyuzhou podcast */
async function processXiaoyuzhou(
  db: Database.Database,
  task: Task,
  url: string,
  whisperConfig: { apiKey: string; baseUrl: string; model: string },
  llmConfig: { apiKey: string; baseUrl: string; model: string },
  mode: SummaryMode
) {
  const episodeId = await extractEpisodeId(url);

  updateProgress(db, task, "获取播客元数据…");
  const episode = await fetchEpisodeInfo(episodeId, url);
  assertDurationWithinLimit(episode.duration, "播客");

  if (!whisperConfig.apiKey) {
    throw new Error("请先在设置中填写 Whisper API Key");
  }
  if (!episode.audioUrl) {
    throw new Error("无法获取播客音频链接");
  }

  updateProgress(db, task, "语音转写中…");
  const whisperResult = await transcribeAudioUrl(episode.audioUrl, whisperConfig);
  let subtitles = whisperResult.segments?.length
    ? whisperResult.segments
    : whisperResult.text ? [{ from: 0, to: episode.duration || 0, content: whisperResult.text }] : [];

  if (!subtitles.length) {
    throw new Error("未能获取转写内容，请稍后重试");
  }

  let transcript = segmentsToParagraphs(subtitles).map((p: any) => p.content).join("\n\n");
  let transcriptTruncated = false;
  let originalTranscriptLength = transcript.length;

  if (transcript.length > MAX_SUBTITLE_CHARS) {
    transcriptTruncated = true;
    const head = Math.floor(MAX_SUBTITLE_CHARS * 0.7);
    const tail = MAX_SUBTITLE_CHARS - head;
    transcript =
      transcript.slice(0, head) +
      `\n\n[内容过长，中间部分已省略 / Content truncated, middle omitted]\n\n` +
      transcript.slice(-tail);
    updateProgress(db, task, `内容过长（${originalTranscriptLength} 字），已自动截取前后共 ${MAX_SUBTITLE_CHARS} 字进行总结…`);
  }

  if (!transcript) {
    throw new Error("未能获取转写内容，请稍后重试");
  }

  updateProgress(db, task, "AI 总结中…");
  let summary = await summarizeText(transcript, llmConfig, mode, {
    title: episode.title,
    author: episode.author,
    duration: formatDuration(episode.duration || 0),
  });
  if (transcriptTruncated) summary += `\n\n> 内容过长（${originalTranscriptLength} 字），本总结基于截取后的 ${MAX_SUBTITLE_CHARS} 字内容生成。`;

  updateProgress(db, task, "生成标签…");
  const suggestedTags = await suggestTags(episode.title, episode.author, summary, llmConfig);

  const subtitleSegments = subtitles
    .filter((s: any) => s.content?.trim())
    .map((s: any) => ({ from: s.from, to: s.to, content: s.content.trim() }));

  return {
    type: "xiaoyuzhou" as const,
    podcast: { title: episode.title, author: episode.author, podcastName: episode.podcastName, duration: episode.duration, id: episodeId, link: episode.episodeUrl, cover: episode.coverUrl, audioUrl: episode.audioUrl },
    subtitle_count: subtitles.length,
    transcript_source: "whisper" as const,
    subtitle_segments: subtitleSegments,
    transcript,
    summary,
    mode,
    suggested_tags: suggestedTags,
  };
}

/**
 * 使用 yt-dlp 处理通用视频（支持抖音、小红书、YouTube 等 1000+ 网站）
 */
async function processWithYtDlp(
  db: Database.Database,
  task: Task,
  url: string,
  whisperConfig: { apiKey: string; baseUrl: string; model: string },
  llmConfig: { apiKey: string; baseUrl: string; model: string },
  mode: SummaryMode,
  ytDlpCookies = ""
) {
  if (!whisperConfig.apiKey) {
    throw new Error("请先在设置中填写 Whisper API Key");
  }

  // 验证 URL 格式并清理
  const validation = validateUrl(url);
  if (!validation.valid) {
    throw new Error(validation.message || "链接格式不正确");
  }

  // 使用清理后的 URL
  const cleanedUrl = validation.cleanedUrl || url;

  updateProgress(db, task, "正在获取视频信息…");
  let videoInfo;
  try {
    videoInfo = await extractWithYtDlp(cleanedUrl, ytDlpCookies);
  } catch (error: any) {
    // 给出更友好的错误提示
    let message = error.message || "视频提取失败";
    if (/unsupported.*url/i.test(message) || /generic.*information/i.test(message)) {
      message = "无法识别此链接，请使用手机端分享的链接（不要使用网页版链接）";
    } else if (/network|connect|timed?out/i.test(message)) {
      message = "网络连接超时，请检查网络或稍后重试";
    }
    throw new Error(message);
  }

  assertDurationWithinLimit(videoInfo.duration, "视频");

  if (!videoInfo.audioUrl) {
    throw new Error(`无法获取 ${getPlatformName(videoInfo.platform)} 视频音频链接，请尝试其他平台或稍后重试`);
  }

  updateProgress(db, task, "语音转写中…");
  const whisperResult = await transcribeAudioUrl(videoInfo.audioUrl, whisperConfig);
  let subtitles = whisperResult.segments?.length
    ? whisperResult.segments
    : whisperResult.text ? [{ from: 0, to: videoInfo.duration || 0, content: whisperResult.text }] : [];

  if (!subtitles.length) {
    throw new Error("未能获取转写内容，请稍后重试");
  }

  let transcript = segmentsToParagraphs(subtitles).map((p: any) => p.content).join("\n\n");
  let transcriptTruncated = false;
  let originalTranscriptLength = transcript.length;

  if (transcript.length > MAX_SUBTITLE_CHARS) {
    transcriptTruncated = true;
    const head = Math.floor(MAX_SUBTITLE_CHARS * 0.7);
    const tail = MAX_SUBTITLE_CHARS - head;
    transcript =
      transcript.slice(0, head) +
      `\n\n[内容过长，中间部分已省略 / Content truncated, middle omitted]\n\n` +
      transcript.slice(-tail);
    updateProgress(db, task, `内容过长（${originalTranscriptLength} 字），已自动截取前后共 ${MAX_SUBTITLE_CHARS} 字进行总结…`);
  }

  if (!transcript) {
    throw new Error("未能获取转写内容，请稍后重试");
  }

  updateProgress(db, task, "AI 总结中…");
  let summary = await summarizeText(transcript, llmConfig, mode, {
    title: videoInfo.title,
    author: videoInfo.author,
    duration: formatDuration(videoInfo.duration || 0),
  });
  if (transcriptTruncated) summary += `\n\n> 内容过长（${originalTranscriptLength} 字），本总结基于截取后的 ${MAX_SUBTITLE_CHARS} 字内容生成。`;

  updateProgress(db, task, "生成标签…");
  const suggestedTags = await suggestTags(videoInfo.title, videoInfo.author, summary, llmConfig);

  const subtitleSegments = subtitles
    .filter((s: any) => s.content?.trim())
    .map((s: any) => ({ from: s.from, to: s.to, content: s.content.trim() }));

  // 返回类型根据平台判断
  const type = videoInfo.platform as any;
  const isAudio = /xiaoyuzhou|podcast|fm/i.test(videoInfo.platform);

  if (isAudio) {
    return {
      type: "xiaoyuzhou" as const,
      podcast: {
        title: videoInfo.title,
        author: videoInfo.author,
        podcastName: getPlatformName(videoInfo.platform),
        duration: videoInfo.duration || 0,
        id: url,
        link: videoInfo.webpageUrl,
        cover: videoInfo.coverUrl,
        audioUrl: videoInfo.audioUrl,
      },
      subtitle_count: subtitles.length,
      transcript_source: "whisper" as const,
      subtitle_segments: subtitleSegments,
      transcript,
      summary,
      mode,
      suggested_tags: suggestedTags,
    };
  }

  return {
    type,
    video: {
      title: videoInfo.title,
      author: videoInfo.author,
      duration: videoInfo.duration || 0,
      bvid: videoInfo.audioUrl,
      link: videoInfo.webpageUrl,
      pic: videoInfo.coverUrl,
    },
    subtitle_count: subtitles.length,
    transcript_source: "whisper" as const,
    subtitle_segments: subtitleSegments,
    transcript,
    summary,
    mode,
    suggested_tags: suggestedTags,
  };
}

async function processWithDouyinDownloader(
  db: Database.Database,
  task: Task,
  url: string,
  whisperConfig: { apiKey: string; baseUrl: string; model: string },
  llmConfig: { apiKey: string; baseUrl: string; model: string },
  mode: SummaryMode
) {
  if (!whisperConfig.apiKey) throw new Error("请先在设置中填写 Whisper API Key");

  updateProgress(db, task, "抖音专用解析中…");
  const media = await downloadWithDouyinDownloader(url);

  updateProgress(db, task, "语音转写中…");
  const whisperResult = await transcribeLocalMedia(media.filePath, whisperConfig);
  const subtitles = whisperResult.segments?.length
    ? whisperResult.segments
    : whisperResult.text ? [{ from: 0, to: 0, content: whisperResult.text }] : [];
  if (!subtitles.length) throw new Error("未能获取转写内容，请稍后重试");

  let transcript = segmentsToParagraphs(subtitles).map((p: any) => p.content).join("\n\n");
  let transcriptTruncated = false;
  const originalTranscriptLength = transcript.length;
  if (transcript.length > MAX_SUBTITLE_CHARS) {
    transcriptTruncated = true;
    const head = Math.floor(MAX_SUBTITLE_CHARS * 0.7);
    const tail = MAX_SUBTITLE_CHARS - head;
    transcript = transcript.slice(0, head) + `\n\n[内容过长，中间部分已省略 / Content truncated, middle omitted]\n\n` + transcript.slice(-tail);
    updateProgress(db, task, `内容过长（${originalTranscriptLength} 字），已自动截取前后共 ${MAX_SUBTITLE_CHARS} 字进行总结…`);
  }

  updateProgress(db, task, "AI 总结中…");
  let summary = await summarizeText(transcript, llmConfig, mode, {
    title: media.title,
    author: media.author,
    duration: '未知',
  });
  if (transcriptTruncated) summary += `\n\n> 内容过长（${originalTranscriptLength} 字），本总结基于截取后的 ${MAX_SUBTITLE_CHARS} 字内容生成。`;

  updateProgress(db, task, "生成标签…");
  const suggestedTags = await suggestTags(media.title, media.author, summary, llmConfig);
  const subtitleSegments = subtitles
    .filter((seg: any) => seg.content?.trim())
    .map((seg: any) => ({ from: seg.from, to: seg.to, content: seg.content.trim() }));

  return {
    type: "douyin" as const,
    video: {
      title: media.title,
      author: media.author,
      duration: 0,
      bvid: media.filePath,
      link: media.webpageUrl,
      pic: "",
    },
    subtitle_count: subtitles.length,
    transcript_source: "whisper" as const,
    subtitle_segments: subtitleSegments,
    transcript,
    summary,
    mode,
    suggested_tags: suggestedTags,
  };
}

async function runTask(
  db: Database.Database,
  task: Task,
  url: string,
  body: any
) {
  try {
    task.status = "running";
    db.prepare("UPDATE summary_tasks SET status = 'running', updated_at = ? WHERE id = ?").run(Date.now(), task.id);
    updateProgress(db, task, "获取信息…");

    const config = getDecryptedConfig(db, task.userId);
    let apiKey = String(body.api_key || config.api_key || "").trim();
    let model = String(body.model || config.deepseek_model || "deepseek-v4-flash").trim();
    let baseUrl = String(body.base_url || config.deepseek_base_url || "https://api.deepseek.com/v1").trim();
    const mode = (String(body.mode || "brief").trim() || "brief") as SummaryMode;

    // Fall back to the admin's full config (key + baseUrl + model) so an admin
    // key is never sent to a user-controlled baseUrl.
    if (!apiKey && ADMIN_EMAIL && task.userEmail !== ADMIN_EMAIL) {
      const adminRow = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(ADMIN_EMAIL) as { id?: number } | undefined;
      if (adminRow?.id) {
        const adminConfig = getDecryptedConfig(db, adminRow.id);
        if (adminConfig.api_key) {
          apiKey = adminConfig.api_key;
          model = adminConfig.deepseek_model || model;
          baseUrl = adminConfig.deepseek_base_url || baseUrl;
        }
      }
    }

    if (!apiKey) {
      failTask(db, task, "请先在设置中填写 API Key");
      return;
    }

    const llmConfig = { apiKey, baseUrl, model };
    const whisperConfig = getWhisperConfig(db, task.userEmail, body, config);

    // 第一步：清理 URL（从分享文本中提取纯 URL）
    const validation = validateUrl(url);
    const cleanedUrl = validation.cleanedUrl || url;

    // Determine platform and process accordingly
    let result;
    const hasYtDlp = await isYtDlpAvailable();

    // 平台检测顺序：小宇宙 → B站（原生提取更稳定）→ 其他平台（yt-dlp）
    if (isXiaoyuzhouUrl(cleanedUrl)) {
      result = await processXiaoyuzhou(db, task, cleanedUrl, whisperConfig, llmConfig, mode);
    } else if (isBilibiliUrl(cleanedUrl)) {
      // B站优先使用原生提取器（更稳定）
      result = await processBilibili(db, task, cleanedUrl, whisperConfig, llmConfig, mode);
    } else if (hasYtDlp && isUrlSupported(cleanedUrl)) {
      try {
        result = await processWithYtDlp(db, task, cleanedUrl, whisperConfig, llmConfig, mode, config.yt_dlp_cookies);
      } catch (err: any) {
        if (/douyin|iesdouyin/i.test(cleanedUrl) && isDouyinDownloaderAvailable()) {
          console.warn("[douyin-fallback] yt-dlp failed, trying douyin-downloader:", err.message);
          result = await processWithDouyinDownloader(db, task, cleanedUrl, whisperConfig, llmConfig, mode);
        } else {
          throw err;
        }
      }
    } else if (hasYtDlp) {
      try {
        result = await processWithYtDlp(db, task, cleanedUrl, whisperConfig, llmConfig, mode, config.yt_dlp_cookies);
      } catch (err: any) {
        if (/douyin|iesdouyin/i.test(cleanedUrl) && isDouyinDownloaderAvailable()) {
          console.warn("[douyin-fallback] yt-dlp failed, trying douyin-downloader:", err.message);
          result = await processWithDouyinDownloader(db, task, cleanedUrl, whisperConfig, llmConfig, mode);
        } else {
          throw err;
        }
      }
    } else if (/douyin|iesdouyin/i.test(cleanedUrl) && isDouyinDownloaderAvailable()) {
      result = await processWithDouyinDownloader(db, task, cleanedUrl, whisperConfig, llmConfig, mode);
    } else {
      // 没有 yt-dlp，默认尝试使用 Bilibili 原生提取器
      result = await processBilibili(db, task, cleanedUrl, whisperConfig, llmConfig, mode);
    }

    completeTask(db, task, result);
  } catch (err: any) {
    console.error("[task]", err);
    failTask(db, task, err.message || String(err));
  } finally {
    // If SSE still connected, close
    setTimeout(() => {
      if (task.res) {
        try { task.res.end(); } catch {}
        task.res = null;
      }
    }, 500);
  }
}
