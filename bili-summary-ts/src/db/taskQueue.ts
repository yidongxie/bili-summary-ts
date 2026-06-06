/** Async task queue for summarize jobs + SSE progress */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import { extractVideoId, fetchVideoInfo, fetchSubtitles, segmentsToParagraphs, parseSessdata, fetchPageList } from "../bilibili/api";
import { transcribeBilibiliAudio } from "../whisper/transcribe";
import { summarizeText, summarizeFromMetadata, suggestTags, SummaryMode } from "../llm/summarize";
import { getDecryptedConfig } from "./configStore";

const MAX_DAILY_SUMMARIES = parseInt(process.env.MAX_DAILY_SUMMARIES || "30", 10);
const MAX_SUBTITLE_CHARS = parseInt(process.env.MAX_SUBTITLE_CHARS || "20000", 10);

interface Task {
  id: string;
  userId: number;
  status: "pending" | "running" | "done" | "error";
  progress: string;
  result?: any;
  error?: string;
  createdAt: number;
  res: Response | null; // SSE response to push to
}

const tasks = new Map<string, Task>();
const userTasks = new Map<number, string[]>(); // userId -> taskIds

function getOrCreateTaskId(userId: number): string {
  const id = crypto.randomUUID();
  const task: Task = {
    id,
    userId,
    status: "pending",
    progress: "排队中…",
    createdAt: Date.now(),
    res: null,
  };
  tasks.set(id, task);
  if (!userTasks.has(userId)) userTasks.set(userId, []);
  const list = userTasks.get(userId)!;
  if (list.length > 10) {
    const old = list.shift()!;
    tasks.delete(old);
  }
  list.push(id);
  return id;
}

function sendSSE(task: Task, event: string, data: any) {
  if (!task.res) return;
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
    const task = tasks.get(req.params.id);
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

    if (usageRow && usageRow.summarize_count >= MAX_DAILY_SUMMARIES) {
      res.status(429).json({
        success: false,
        error: `今日总结次数已达上限（${MAX_DAILY_SUMMARIES} 次）`,
      });
      return;
    }

    const taskId = getOrCreateTaskId(userId);
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
    sendSSE(task, "status", { status: "running", progress: "获取视频信息…" });

    const config = getDecryptedConfig(db, task.userId);
    const apiKey = String(body.api_key || config.api_key || "").trim();
    const sessdata = String(body.bili_sessdata || config.bili_sessdata || "").trim();
    const model = String(body.model || config.deepseek_model || "deepseek-chat").trim();
    const baseUrl = String(body.base_url || config.deepseek_base_url || "https://api.deepseek.com/v1").trim();
    const mode = (String(body.mode || "brief").trim() || "brief") as SummaryMode;

    if (!apiKey) {
      task.error = "请先在设置中填写 API Key";
      task.status = "error";
      sendSSE(task, "error", { error: task.error });
      return;
    }

    const videoId = await extractVideoId(url);
    const cookies = sessdata ? parseSessdata(sessdata) : undefined;
    
    sendSSE(task, "status", { status: "running", progress: "获取视频元数据…" });
    const info = await fetchVideoInfo(videoId, cookies);
    const bvid = info.bvid;
    const cid = info.cid;

    const pages = await fetchPageList(bvid, cookies);
    const correctCid = pages.length && pages[0].cid ? pages[0].cid : cid;
    if (correctCid !== cid) console.log("[cid] pagelist cid=%d differs from view cid=%d, using pagelist", correctCid, cid);

    sendSSE(task, "status", { status: "running", progress: "获取字幕…" });
    let subtitles = correctCid ? await fetchSubtitles(bvid, correctCid, cookies) : null;
    let transcriptSource: "bilibili" | "whisper" | "none" = subtitles?.length ? "bilibili" : "none";

    const useWhisper = ["1", "true", "yes", "on"].includes(String(body.use_whisper ?? "").toLowerCase());
    const whisperApiKey = String(body.whisper_api_key || config.whisper_api_key || "").trim();
    const whisperBaseUrl = String(body.whisper_base_url || config.whisper_base_url || "https://api.siliconflow.cn/v1").trim();
    const whisperModel = String(body.whisper_model || config.whisper_model || "FunAudioLLM/SenseVoiceSmall").trim();

    if (useWhisper && whisperApiKey && correctCid) {
      sendSSE(task, "status", { status: "running", progress: "语音转写中…" });
      try {
        const whisperResult = await transcribeBilibiliAudio(bvid, correctCid, cookies, { apiKey: whisperApiKey, baseUrl: whisperBaseUrl, model: whisperModel });
        if (whisperResult.segments?.length) {
          subtitles = whisperResult.segments;
        } else if (whisperResult.text) {
          subtitles = [{ from: 0, to: info.duration, content: whisperResult.text }];
        }
        if (subtitles?.length) transcriptSource = "whisper";
      } catch (e: any) {
        console.error("[whisper]", e);
      }
    }

    const transcript = subtitles ? segmentsToParagraphs(subtitles).map((p: any) => p.content).join("\n\n") : "";
    
    if (transcript.length > MAX_SUBTITLE_CHARS) {
      task.error = `字幕过长（超过 ${MAX_SUBTITLE_CHARS} 字限制）`;
      task.status = "error";
      sendSSE(task, "error", { error: task.error });
      return;
    }

    sendSSE(task, "status", { status: "running", progress: "AI 总结中…" });
    const llmConfig = { apiKey, baseUrl, model };
    let summary: string;

    if (subtitles && transcript) {
      summary = await summarizeText(transcript, llmConfig, mode);
      if (transcriptSource === "whisper") summary += "\n\n> 本总结基于 Whisper 语音转写生成。";
    } else {
      summary = await summarizeFromMetadata(info.title, info.author, info.desc, llmConfig, mode);
      summary += "\n\n> 未获取到字幕，以上内容基于视频标题、UP主和简介生成，准确度会低一些。";
    }

    sendSSE(task, "status", { status: "running", progress: "生成标签…" });
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

    task.status = "done";
    task.result = result;
    sendSSE(task, "complete", result);
  } catch (err: any) {
    console.error("[task]", err);
    task.status = "error";
    task.error = err.message || String(err);
    sendSSE(task, "error", { error: task.error });
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
