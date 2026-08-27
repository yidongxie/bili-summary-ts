/** Video frame extraction + multimodal vision analysis (opt-in via vision_model). */

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import Database from "better-sqlite3";
import { postJson } from "../common/http";
import { isSafeUpstreamUrl } from "../common/urlSafety";
import { getDecryptedConfig } from "../db/configStore";
import { VISION_SYSTEM_PROMPT, buildVisionUserPrompt } from "../llm/prompts";
import type { LlmConfig } from "../llm/summarize";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";

/**
 * Resolve the vision config: a multimodal model served over the same
 * SiliconFlow endpoint already used for Whisper. Disabled (null) until the
 * user sets `vision_model` in settings.
 */
export function getVisionConfig(db: Database.Database, userId: number): LlmConfig | null {
  const config = getDecryptedConfig(db, userId);
  const model = (config.vision_model || "").trim();
  if (!model) return null;
  if (config.whisper_api_key) {
    return { apiKey: config.whisper_api_key, baseUrl: config.whisper_base_url || DEFAULT_BASE_URL, model };
  }
  if (ADMIN_EMAIL) {
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email?: string } | undefined;
    if (user?.email !== ADMIN_EMAIL) {
      const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL) as { id?: number } | undefined;
      if (admin?.id) {
        const ac = getDecryptedConfig(db, admin.id);
        if (ac.whisper_api_key && ac.vision_model) {
          return { apiKey: ac.whisper_api_key, baseUrl: ac.whisper_base_url || DEFAULT_BASE_URL, model: ac.vision_model };
        }
      }
    }
  }
  return null;
}

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  return "ffmpeg";
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(resolveFfmpeg(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (c) => { stderr += c.toString(); });
    p.on("error", (e) => reject(new Error(`ffmpeg spawn: ${e.message}`)));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

/**
 * Extract `count` evenly-spaced keyframes from a video stream URL.
 * Returns absolute paths to JPEG files in a fresh temp directory.
 */
export async function extractKeyframes(
  videoUrl: string,
  duration: number,
  count = 5,
  headers?: Record<string, string>,
): Promise<string[]> {
  const n = Math.max(1, Math.min(8, Math.floor(count || 5)));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bilistudy-frames-"));
  const pattern = path.join(tmpDir, "frame_%02d.jpg");
  const args: string[] = ["-hide_banner", "-loglevel", "error"];
  if (headers) {
    const hdrLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
    args.push("-headers", `${hdrLines}\r\n`);
  }
  const dur = Math.max(1, Number(duration) || 0);
  // Unknown duration → sample one frame every 15s; otherwise spread evenly.
  const fps = duration && duration > 1 ? n / dur : 1 / 15;
  args.push("-i", videoUrl, "-vf", `fps=${fps}`, "-frames:v", String(n), "-q:v", "3", pattern);
  await runFfmpeg(args);
  return fs.readdirSync(tmpDir).filter((f) => /\.jpe?g$/.test(f)).sort().map((f) => path.join(tmpDir, f));
}

export function cleanupFrames(frames: string[]): void {
  if (!frames.length) return;
  try {
    fs.rmSync(path.dirname(frames[0]), { recursive: true, force: true });
  } catch { /* ignore */ }
}

/** Send keyframes to a multimodal model and return a Markdown description. */
export async function analyzeFrames(
  frames: string[],
  config: LlmConfig,
  meta: { title?: string; author?: string },
): Promise<string> {
  if (!frames.length) return "";
  if (!isSafeUpstreamUrl(config.baseUrl)) throw new Error("不允许连接到该地址");
  const content: unknown[] = [{ type: "text", text: buildVisionUserPrompt(meta) }];
  for (const f of frames) {
    const b64 = fs.readFileSync(f).toString("base64");
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
  }
  const cleanKey = (config.apiKey || "").replace(/[\r\n\s]+/g, "").trim();
  const res = await postJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    config.baseUrl.replace(/\/+$/, "") + "/chat/completions",
    {
      model: config.model,
      messages: [{ role: "system", content: VISION_SYSTEM_PROMPT }, { role: "user", content }],
      temperature: 0.1,
      max_tokens: 800,
    },
    { headers: { Authorization: `Bearer ${cleanKey}` }, timeout: 120000 },
  );
  return res?.choices?.[0]?.message?.content || "";
}
