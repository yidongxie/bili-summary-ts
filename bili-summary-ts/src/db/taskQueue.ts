/** Async task queue for summarize jobs + SSE progress */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import { extractVideoId, fetchVideoInfo, segmentsToParagraphs, fetchPageList } from "../bilibili/api";
import { transcribeBilibiliAudio } from "../whisper/transcribe";
import { summarizeText, suggestTags, SummaryMode } from "../llm/summarize";
import { getDecryptedConfig } from "./configStore";

const MAX_DAILY_SUMMARIES = parseInt(process.env.MAX_DAILY_SUMMARIES || "10", 10);
const MAX_SUBTITLE_CHARS = parseInt(process.env.MAX_SUBTITLE_CHARS || "60000", 10);

const ADMIN_EMAIL = "444925817@qq.com";

interface Task {
  id: string;
  userId: number;
  userEmail: string;
  status: "pending" | "running" | "done" | "error";
  progress: string;
  result?: any;
  error?: string;
  createdAt: number;
  res: Response | null; // SSE response to push to
}

const tasks = new Map<string, Task>();
const userTasks = new Map<number, string[]>(); // userId -> taskIds

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

function getOrCreateTaskId(db: Database.Database, userId: number, userEmail: string): string {
  const id = crypto.randomUUID();
  const task: Task = {
    id,
    userId,
    userEmail,
    status: "pending",
    progress: "排队中…",
    createdAt: Date.now(),
    res: null,
  };
  tasks.set(id, task);
  if (!userTasks.has(userId)) userTasks.set(userId, []);
  const list = userTasks.get(userId)!;
  if (list.length >= 10) {
    const old = list.shift()!;
    tasks.delete(old);
    db.prepare("DELETE FROM summary_tasks WHERE id = ?").run(old);
  }
  list.push(id);
  db.prepare(
    "INSERT INTO summary_tasks (id, user_id, user_email, status, progress, created_at, updated_at) VALUES (?, ?, ?, 'pending', '排队中…', ?, ?)"
  ).run(id, userId, userEmail, task.createdAt, Date.now());
  return id;
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

    req.on("close", () => {
      task.res = null;
    });
  });

  // Submit task
  router.post("/api/tasks/summarize", async (req: Request, res: Response) => {
    const userId = (req.user as any)?.id;
    const userEmail = (req.user as any)?.email || "";
    if (!userId) {
      res.status(401).json({ success: false, error: "请先登录" });
      return;
    }

    const url = String(req.body.url || "").trim();
    if (!url) { res.json({ success: false, error: "请输入视频链接" }); return; }

    // Rate limit check
    const today = new Date().toISOString().slice(0, 10);
    const usageRow = db
      .prepare("SELECT summarize_count FROM daily_usage WHERE user_id = ? AND date = ?")
      .get(userId, today) as any;

    if (userEmail !== ADMIN_EMAIL && usageRow && usageRow.summarize_count >= MAX_DAILY_SUMMARIES) {
      res.status(429).json({
        success: false,
        error: `今日总结次数已达上限（${MAX_DAILY_SUMMARIES} 次）`,
      });
      return;
    }

    const taskId = getOrCreateTaskId(db, userId, userEmail);
    const task = tasks.get(taskId)!;

    res.json({ success: true, task_id: taskId });

    // Run asynchronously
    setImmediate(async () => {
      await runTask(db, task, url, req.body);
    });
  });

  return router;
}

async function runTask(
  db: Database.Database,
  task: Task,
  url: string,
  body: any
) {
  try {
    task.status = "running";
    updateProgress(db, task, "获取视频信息…");

    const config = getDecryptedConfig(db, task.userId);
    const apiKey = String(body.api_key || config.api_key || "").trim();
    const model = String(body.model || config.deepseek_model || "deepseek-chat").trim();
    const baseUrl = String(body.base_url || config.deepseek_base_url || "https://api.deepseek.com/v1").trim();
    const mode = (String(body.mode || "brief").trim() || "brief") as SummaryMode;

    if (!apiKey) {
      failTask(db, task, "请先在设置中填写 API Key");
      return;
    }

    const videoId = await extractVideoId(url);

    updateProgress(db, task, "获取视频元数据…");
    const info = await fetchVideoInfo(videoId);
    const bvid = info.bvid;
    const cid = info.cid;

    const pages = await fetchPageList(bvid);
    const correctCid = pages.length && pages[0].cid ? pages[0].cid : cid;
    if (correctCid !== cid) console.log("[cid] pagelist cid=%d differs from view cid=%d, using pagelist", correctCid, cid);

    // Force Whisper transcription. Drop the bilibili-subtitle fallback entirely.
    let subtitles: Array<{ from: number; to: number; content: string }> | null = null;
    let transcriptSource: "whisper" = "whisper";

    // Whisper config: prefer the caller's, fall back to the user's stored config,
    // and finally fall back to the admin's stored config for normal users.
    let whisperApiKey = String(body.whisper_api_key || config.whisper_api_key || "").trim();
    let whisperBaseUrl = String(body.whisper_base_url || config.whisper_base_url || "https://api.siliconflow.cn/v1").trim();
    let whisperModel = String(body.whisper_model || config.whisper_model || "FunAudioLLM/SenseVoiceSmall").trim();

    if (!whisperApiKey && task.userEmail !== ADMIN_EMAIL) {
      const adminRow = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(ADMIN_EMAIL) as { id?: number } | undefined;
      if (adminRow?.id) {
        const adminConfig = getDecryptedConfig(db, adminRow.id);
        if (adminConfig.whisper_api_key) {
          whisperApiKey = adminConfig.whisper_api_key;
          if (!body.whisper_base_url && !config.whisper_base_url) whisperBaseUrl = adminConfig.whisper_base_url || whisperBaseUrl;
          if (!body.whisper_model && !config.whisper_model) whisperModel = adminConfig.whisper_model || whisperModel;
        }
      }
    }

    if (!whisperApiKey) {
      failTask(db, task, "请先在设置中填写 Whisper API Key");
      return;
    }
    if (!correctCid) {
      failTask(db, task, "无法获取视频音频信息，请稍后重试");
      return;
    }

    updateProgress(db, task, "语音转写中…");
    try {
      const whisperResult = await transcribeBilibiliAudio(bvid, correctCid, { apiKey: whisperApiKey, baseUrl: whisperBaseUrl, model: whisperModel });
      if (whisperResult.segments?.length) {
        subtitles = whisperResult.segments;
      } else if (whisperResult.text) {
        subtitles = [{ from: 0, to: info.duration, content: whisperResult.text }];
      }
    } catch (e: any) {
      console.error("[whisper]", e);
      failTask(db, task, `语音转写失败：${e?.message || String(e)}，请稍后重试`);
      return;
    }

    if (!subtitles?.length) {
      failTask(db, task, "未能获取转写内容，请稍后重试");
      return;
    }

    let transcript = subtitles ? segmentsToParagraphs(subtitles).map((p: any) => p.content).join("\n\n") : "";
    let transcriptTruncated = false;
    let originalTranscriptLength = transcript.length;

    if (transcript.length > MAX_SUBTITLE_CHARS) {
      transcriptTruncated = true;
      // Take a head + tail slice so we keep both the intro and the conclusion.
      const head = Math.floor(MAX_SUBTITLE_CHARS * 0.7);
      const tail = MAX_SUBTITLE_CHARS - head;
      transcript =
        transcript.slice(0, head) +
        `\n\n[字幕过长，中间部分已省略 / Subtitle truncated, middle omitted]\n\n` +
        transcript.slice(-tail);
      updateProgress(db, task, `字幕过长（${originalTranscriptLength} 字），已自动截取前后共 ${MAX_SUBTITLE_CHARS} 字进行总结…`);
    }

    if (!transcript) {
      failTask(db, task, "未能获取转写内容，请稍后重试");
      return;
    }

    updateProgress(db, task, "AI 总结中…");
    const llmConfig = { apiKey, baseUrl, model };
    let summary = await summarizeText(transcript, llmConfig, mode);
    if (transcriptTruncated) summary += `\n\n> 字幕过长（${originalTranscriptLength} 字），本总结基于截取后的 ${MAX_SUBTITLE_CHARS} 字内容生成。`;

    updateProgress(db, task, "生成标签…");
    const suggestedTags = await suggestTags(info.title, info.author, summary, llmConfig);

    const subtitleSegments = subtitles
      ? subtitles.filter((s: any) => s.content?.trim()).map((s: any) => ({ from: s.from, to: s.to, content: s.content.trim() }))
      : [];

    // Increment daily usage
    db.prepare(
      `INSERT INTO daily_usage (user_id, date, summarize_count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET summarize_count = summarize_count + 1`
    ).run(task.userId, new Date().toISOString().slice(0, 10));

    const result = {
      video: { title: info.title, author: info.author, duration: info.duration, bvid, link: `https://www.bilibili.com/video/${bvid}`, pic: info.pic },
      subtitle_count: subtitles?.length ?? 0,
      transcript_source: transcriptSource,
      subtitle_segments: subtitleSegments,
      transcript,
      summary,
      mode,
      suggested_tags: suggestedTags,
    };

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
