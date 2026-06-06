/** LLM summarization ? OpenAI-compatible chat completions */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// ?? Types ???????????????????????????????????????????????????????????

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type SummaryMode = 'brief' | 'detailed' | 'timeline' | 'knowledge';

// ?? Prompt templates ?????????????????????????????????????????????????

const SUMMARY_PROMPTS: Record<SummaryMode, string> = {
  brief: '????????????????3-5 ???????',
  detailed: '?????????????????????????????????????',
  timeline: '??????????????????????????????',
  knowledge: '???????????????????????????????????',
};

// ?? HTTP POST (zero-dep) ????????????????????????????????????????????

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

async function chatCompletion(config: LlmConfig, messages: { role: string; content: string }[], maxTokens: number, mode?: SummaryMode): Promise<string> {
  const temp = mode ? temperatureForMode(mode) : 0.1;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await postJson<ChatCompletionResponse>(
    url,
    { model: config.model, messages, temperature: temp, max_tokens: maxTokens, seed: 42 },
    { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
  );
  return res.choices[0].message.content;
}

// ?? Public API ??????????????????????????????????????????????????????

export async function summarizeText(text: string, config: LlmConfig, mode: SummaryMode): Promise<string> {
  if (!text.trim()) return '\u89c6\u9891\u6ca1\u6709\u5b57\u5e55\u5185\u5bb9\uff0c\u65e0\u6cd5\u603b\u7ed3\u3002';
  const maxInput = 16000;
  const input = text.length > maxInput ? text.slice(0, maxInput) + '\n\n...[\u5185\u5bb9\u8f83\u957f\uff0c\u5df2\u622a\u65ad]' : text;
  const instruction = SUMMARY_PROMPTS[mode] ?? SUMMARY_PROMPTS.brief;
  const messages = [
    { role: 'system', content: '\u4f60\u662f\u4e00\u4e2a\u4e2d\u6587\u7b14\u8bb0\u52a9\u624b\u3002\u8bf7\u4e25\u683c\u9075\u5b88\uff1a1\uff09\u53ea\u63d0\u53d6\u5b57\u5e55\u6587\u672c\u4e2d\u660e\u786e\u63d0\u5230\u7684\u4fe1\u606f\uff0c\u4e0d\u7f16\u9020\u3001\u4e0d\u8865\u5145\u3001\u4e0d\u63a8\u65ad\u5b57\u5e55\u6ca1\u6709\u7684\u5185\u5bb9\u30022\uff09\u5982\u679c\u67d0\u70b9\u6765\u81ea\u63a8\u65ad\uff0c\u5fc5\u987b\u6807\u6ce8\u201c\uff08\u5b57\u5e55\u4e2d\u672a\u660e\u786e\u8bf4\u660e\uff09\u201d\u30023\uff09\u751f\u6210 Markdown \u683c\u5f0f\uff0c\u7ed3\u6784\u6e05\u6670\u30024\uff09\u53ea\u56de\u7b54\u57fa\u4e8e\u5df2\u7ed9\u5b57\u5e55\u7684\u5185\u5bb9\u3002' },
    { role: 'user', content: `\u603b\u7ed3\u8981\u6c42\uff1a${instruction}\n\n\u8bf7\u603b\u7ed3\u4ee5\u4e0b B\u7ad9\u89c6\u9891\u5b57\u5e55\uff1a\n\n${input}` },
  ];
  return chatCompletion(config, messages, 2400, mode);
}

export async function summarizeFromMetadata(
  title: string,
  author: string,
  desc: string,
  config: LlmConfig,
  mode: SummaryMode,
): Promise<string> {
  const instruction = SUMMARY_PROMPTS[mode] ?? SUMMARY_PROMPTS.brief;
  const messages = [
    { role: 'system', content: '\u4f60\u662f\u4e00\u4e2a\u8c28\u614e\u7684\u4e2d\u6587\u7b14\u8bb0\u52a9\u624b\u3002\u4f60\u6ca1\u6709\u5b57\u5e55\u6570\u636e\uff0c\u53ea\u80fd\u6839\u636e\u6807\u9898\u3001UP\u4e3b\u548c\u7b80\u4ecb\u505a\u4fdd\u5b88\u63d0\u53d6\u3002\u4e0d\u8981\u7f16\u9020\u5177\u4f53\u89c2\u70b9\u3001\u6570\u636e\u6216\u4f8b\u5b50\u3002\u53ea\u8bf4\u660e\u5143\u4fe1\u606f\u4e2d\u660e\u786e\u63d0\u5230\u7684\u5185\u5bb9\u3002\u751f\u6210 Markdown\u3002' },
    { role: 'user', content: `\u8fd9\u4e2a B\u7ad9\u89c6\u9891\u6ca1\u6709\u53ef\u7528\u5b57\u5e55\u3002\u8bf7\u4ec5\u6839\u636e\u5143\u4fe1\u606f\u751f\u6210\u4e00\u4e2a\u4fdd\u5b88\u7684\u5b66\u4e60\u5361\u7247\uff0c\u660e\u786e\u8bf4\u660e\u65e0\u6cd5\u786e\u8ba4\u89c6\u9891\u7ec6\u8282\uff0c\u4e0d\u8981\u7f16\u9020\u5177\u4f53\u89c2\u70b9\u3002\n\n\u603b\u7ed3\u8981\u6c42\uff1a${instruction}\n\n\u6807\u9898\uff1a${title}\nUP\u4e3b\uff1a${author}\n\u7b80\u4ecb\uff1a${desc.slice(0, 1200)}` },
  ];
  return chatCompletion(config, messages, 1000, mode);
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
