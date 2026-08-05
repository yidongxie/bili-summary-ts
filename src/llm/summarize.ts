/** LLM summarization — OpenAI-compatible chat completions */

import { postJson } from "../common/http";
import {
  SUMMARY_PROMPTS,
  SUMMARIZE_SYSTEM_PROMPT,
  buildSummarizeUserPrompt,
  TAG_SYSTEM_PROMPT,
  buildTagSuggestUserPrompt,
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

// ── Public API ──────────────────────────────────────────────────────

export async function summarizeText(
  text: string,
  config: LlmConfig,
  mode: SummaryMode,
  meta?: { title?: string; author?: string; duration?: string },
): Promise<string> {
  if (!text.trim()) return "视频没有可用的转写文本，无法总结。";
  const maxInput = 16000;
  const input = text.length > maxInput ? text.slice(0, maxInput) + "\n\n...[内容较长，已截断]" : text;
  const instruction = SUMMARY_PROMPTS[mode] ?? SUMMARY_PROMPTS.brief;
  const messages = [
    { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
    { role: "user", content: buildSummarizeUserPrompt(instruction, input, meta) },
  ];
  return chatCompletion(config, messages, 2400, mode);
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
