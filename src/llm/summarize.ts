/** LLM summarization ? OpenAI-compatible chat completions */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// ── Types ───────────────────────────────────────────────────────────

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type SummaryMode = 'brief' | 'detailed' | 'timeline' | 'knowledge';

// ── Prompt templates ────────────────────────────────────────────────

const SUMMARY_PROMPTS: Record<SummaryMode, string> = {
  brief: '生成简洁总结：用 3-5 个要点概括视频核心内容，突出结论、方法和适用场景。',
  detailed: '生成详细笔记：按主题分层整理主要观点、关键细节、示例、步骤和可执行建议。',
  timeline: '生成时间线笔记：按视频内容推进顺序整理，每段包含阶段主题、关键内容和结论。',
  knowledge: '生成知识卡片：提炼概念、定义、背景、方法、注意事项和可复习的问题。',
};

// ── HTTP POST (zero-dep) ────────────────────────────────────────────

function postJson<T>(url: string, body: unknown, headers: Record<string, string>, timeout = 120000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const payload = Buffer.from(JSON.stringify(body), 'utf-8');
    const req = mod.request(
      parsed,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, ...headers },
        timeout,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`LLM response parse error: ${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('LLM request timeout')); });
    req.write(payload);
    req.end();
  });
}

interface ChatCompletionResponse {
  choices: { message: { content: string } }[];
}

function temperatureForMode(mode: SummaryMode): number {
  switch (mode) {
    case 'brief': return 0.05;
    case 'detailed': return 0.1;
    case 'timeline': return 0.15;
    case 'knowledge': return 0.1;
    default: return 0.1;
  }
}

export async function chatCompletion(config: LlmConfig, messages: { role: string; content: string }[], maxTokens: number, mode?: SummaryMode): Promise<string> {
  const temp = mode ? temperatureForMode(mode) : 0.1;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  // 清理 API Key，移除换行和无效字符
  const cleanApiKey = (config.apiKey || '').replace(/[\r\n\s]+/g, '').trim();
  const res = await postJson<ChatCompletionResponse>(
    url,
    { model: config.model, messages, temperature: temp, max_tokens: maxTokens, seed: 42 },
    { Authorization: `Bearer ${cleanApiKey}`, 'Content-Type': 'application/json' },
  );
  return res.choices[0].message.content;
}

// ── Public API ──────────────────────────────────────────────────────

export async function summarizeText(text: string, config: LlmConfig, mode: SummaryMode): Promise<string> {
  if (!text.trim()) return '视频没有可用的转写文本，无法总结。';
  const maxInput = 16000;
  const input = text.length > maxInput ? text.slice(0, maxInput) + '\n\n...[内容较长，已截断]' : text;
  const instruction = SUMMARY_PROMPTS[mode] ?? SUMMARY_PROMPTS.brief;
  const messages = [
    {
      role: 'system',
      content:
        '你是一个中文笔记助手，输入是一段 B 站视频的语音转写文本。请严格遵守：\n' +
        '1) 只提取视频内容中明确提到的信息，不编造、不补充、不推断视频里没有出现的内容；\n' +
        '2) 如果某点来自合理推断，请在该点后标注"（视频中未明确说明）"；\n' +
        '3) 输出使用 Markdown 格式，结构清晰；\n' +
        '4) 不要在输出中出现"字幕""转写""转录"这类字眼，统一以"视频"指代来源；不要描述自己拿到的是什么形式的素材；\n' +
        '5) 直接给总结正文，不要写"以下是总结""根据视频内容"等开场白。',
    },
    {
      role: 'user',
      content: `总结要求：${instruction}\n\n以下是该 B 站视频的内容文本，请据此生成总结：\n\n${input}`,
    },
  ];
  return chatCompletion(config, messages, 2400, mode);
}

// ── Tag suggestion ─────────────────────────────────────────────────

function parseTagList(raw: string): string[] {
  let text = raw.trim();
  // Strip code fences if the model wrapped JSON in ```json ... ```
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Try JSON array first
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.map((x) => String(x));
    } catch {
      // fall through to delimiter split
    }
  }
  return text
    .split(/[\n,，、|;；]+/)
    .map((s) => s.replace(/^["'`#\-\s]+|["'`\s]+$/g, ''))
    .filter(Boolean);
}

function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
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
    {
      role: 'system',
      content:
        '你是一个中文标签助手。根据给定的视频标题、UP主和总结，输出 5 到 8 个简短的中文标签，覆盖主题、领域、风格或目标受众。要求：\n' +
        '1) 每个标签 2-6 个字，不要带 # 号、不要带标点。\n' +
        '2) 优先用通用、可复用的领域词，避免照抄完整短语。\n' +
        '3) 只输出一个 JSON 数组，例如 ["AI","效率","编程"]，不要任何解释。',
    },
    {
      role: 'user',
      content: `标题：${title}\nUP主：${author}\n\n总结：\n${trimmedSummary}`,
    },
  ];
  try {
    const raw = await chatCompletion(config, messages, 200);
    return normaliseTags(parseTagList(raw));
  } catch (e) {
    console.error('[suggestTags]', e);
    return [];
  }
}
