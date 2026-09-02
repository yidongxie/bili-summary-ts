/** LLM summarization — OpenAI-compatible chat completions */

import { postJson } from "../common/http";
import { isSafeUpstreamUrl } from "../common/urlSafety";
import {
  SUMMARIZE_SYSTEM_PROMPTS,
  buildSummarizeUserPrompt,
  TAG_SYSTEM_PROMPT,
  buildTagSuggestUserPrompt,
  CHAPTER_SYSTEM_PROMPT,
  buildChapterUserPrompt,
} from "./prompts";

// ── Types ───────────────────────────────────────────────────────────

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type SummaryMode = "brief" | "detailed" | "timeline" | "knowledge";

// ── Temperature ─────────────────────────────────────────────────────

function temperatureForMode(mode: SummaryMode): number {
  switch (mode) {
    case "brief": return 0.05;
    case "detailed": return 0.1;
    case "timeline": return 0.15;
    case "knowledge": return 0.1;
    default: return 0.1;
  }
}

// ── Chat Completion ─────────────────────────────────────────────────

interface ChatCompletionResponse {
  choices: { message: { content: string } }[];
}

export async function chatCompletion(
  config: LlmConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
  mode?: SummaryMode,
): Promise<string> {
  const temp = mode ? temperatureForMode(mode) : 0.1;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  if (!isSafeUpstreamUrl(config.baseUrl)) throw new Error("不允许连接到该地址");
  // Clean API key — remove newlines and whitespace from pasted keys
  const cleanApiKey = (config.apiKey || "").replace(/[\r\n\s]+/g, "").trim();
  const res = await postJson<ChatCompletionResponse>(
    url,
    { model: config.model, messages, temperature: temp, max_tokens: maxTokens, seed: 42 },
    {
      headers: { Authorization: `Bearer ${cleanApiKey}` },
      timeout: 120000,
    },
  );
  return res.choices[0].message.content;
}

/**
 * Streaming chat completion (SSE). Calls `onChunk` with each delta of text
 * as it arrives from the provider's `stream: true` response.
 */
export async function chatCompletionStream(
  config: LlmConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
  onChunk: (text: string) => void,
): Promise<void> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  if (!isSafeUpstreamUrl(config.baseUrl)) throw new Error("不允许连接到该地址");
  const cleanApiKey = (config.apiKey || "").replace(/[\r\n\s]+/g, "").trim();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cleanApiKey}` },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.1, max_tokens: maxTokens, stream: true }),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function summarizeText(
  text: string,
  config: LlmConfig,
  mode: SummaryMode,
  meta?: { title?: string; author?: string; duration?: string },
  segments?: Array<{ from: number; to?: number; content: string }>,
): Promise<string> {
  if (!text.trim()) return "视频没有可用的转写文本，无法总结。";
  const maxInput = 16000;
  let input = text.length > maxInput ? text.slice(0, maxInput) + "\n\n...[内容较长，已截断]" : text;

  // Timeline mode needs real timestamps so the model can produce an accurate
  // timeline. When segment timestamps are available, feed those instead of the
  // plain transcript text.
  if (mode === "timeline" && segments?.length) {
    input = formatTimelineSegments(segments);
  }

  const systemPrompt = SUMMARIZE_SYSTEM_PROMPTS[mode] ?? SUMMARIZE_SYSTEM_PROMPTS.brief;
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildSummarizeUserPrompt(input, meta) },
  ];
  return chatCompletion(config, messages, 2400, mode);
}

function formatTimelineSegments(segments: Array<{ from: number; to?: number; content: string }>): string {
  const fmt = (s: number) => {
    const total = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  return segments
    .filter((s) => s.content?.trim())
    .map((s) => `[${fmt(s.from)} - ${fmt(s.to ?? s.from + 3)}] ${s.content}`)
    .join('\n');
}

// ── Tag Suggestion ─────────────────────────────────────────────────

function parseTagList(raw: string): string[] {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.map((x) => String(x));
    } catch {
      // fall through to delimiter split
    }
  }
  return text
    .split(/[\n,，、|;；]+/)
    .map((s) => s.replace(/^["'`#\-\s]+|["'`\s]+$/g, ""))
    .filter(Boolean);
}

function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/^#+/, "").replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > 16) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

export async function suggestTags(
  title: string,
  author: string,
  summary: string,
  config: LlmConfig,
): Promise<string[]> {
  if (!summary.trim() && !title.trim()) return [];
  const trimmedSummary = summary.length > 4000 ? summary.slice(0, 4000) : summary;
  const messages = [
    { role: "system", content: TAG_SYSTEM_PROMPT },
    { role: "user", content: buildTagSuggestUserPrompt(title, author, trimmedSummary) },
  ];
  try {
    const raw = await chatCompletion(config, messages, 200);
    return normaliseTags(parseTagList(raw));
  } catch (e) {
    console.error("[suggestTags]", e);
    return [];
  }
}

// ── Chapter Generation ───────────────────────────────────────────────

export interface Chapter {
  from: number;
  to: number;
  title: string;
  detail?: string;
}

function parseChapters(raw: string, duration: number): Chapter[] {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = text.indexOf("[");
  if (start < 0) return [];
  const end = text.lastIndexOf("]");
  if (end <= start) return [];
  let arr: any[];
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const max = Math.max(1, Math.floor(duration || 0));
  const chapters: Chapter[] = [];
  for (const item of arr) {
    const from = Math.max(0, Math.min(max, Math.floor(Number(item?.from) || 0)));
    const to = Math.max(from, Math.min(max, Math.floor(Number(item?.to) || from + 60)));
    const title = String(item?.title || "").trim().slice(0, 40);
    if (!title) continue;
    const detail = String(item?.detail || "").trim().slice(0, 120) || undefined;
    chapters.push({ from, to, title, detail });
  }
  chapters.sort((a, b) => a.from - b.from);
  return chapters.slice(0, 8);
}

export async function generateChapters(
  segments: Array<{ from: number; to: number; content: string }>,
  config: LlmConfig,
  duration: number,
): Promise<Chapter[]> {
  const text = segments
    .filter((s) => s.content?.trim())
    .map((s) => `[${Math.floor(s.from || 0)}-${Math.floor(s.to || s.from || 0)}] ${s.content.trim()}`)
    .join("\n");
  if (!text.trim()) return [];
  try {
    const raw = await chatCompletion(
      config,
      [
        { role: "system", content: CHAPTER_SYSTEM_PROMPT },
        { role: "user", content: buildChapterUserPrompt(text, duration) },
      ],
      1200,
    );
    return parseChapters(raw, duration);
  } catch (e) {
    console.warn("[generateChapters] failed:", (e as Error)?.message || e);
    return [];
  }
}
