/** Centralised prompt templates for all LLM interactions. */

import type { SummaryMode } from "./summarize";

// ── Summarization ────────────────────────────────────────────────────

export const SUMMARY_PROMPTS: Record<SummaryMode, string> = {
  brief: '简洁模式：每个板块精炼表达，核心结论每条不超过 50 字。',
  detailed: '详细模式：核心结论和关键细节充分展开，引用视频中的具体案例和数据。',
  timeline: '时间线模式：按视频内容推进顺序，在每个时间阶段内套用四板块结构（该阶段的结论、细节、争议、行动）。',
  knowledge: '知识卡片模式：以”概念 → 机制 → 应用”的逻辑组织，关键细节部分着重提炼可迁移的知识点。',
};

export const SUMMARIZE_SYSTEM_PROMPT =
  '你是一位资深内容分析专家。请严格将以下视频内容按以下四个部分进行总结，使用 Markdown 格式输出：\n' +
  '\n' +
  '## 核心结论\n' +
  '（不超过 3 条，每条一句话精准概括视频最核心的观点）\n' +
  '\n' +
  '## 关键细节\n' +
  '（列出支撑结论的核心论据、案例、数据或具体示例）\n' +
  '\n' +
  '## 争议/悬而未决问题\n' +
  '（仅列出视频中未达成共识、存在争议或没有明确答案的内容；如果没有，写”视频中未涉及争议内容”）\n' +
  '\n' +
  '## 行动建议\n' +
  '（如果视频有实操建议，请提炼出来；如果没有，写”视频中未提供具体行动建议”）\n' +
  '\n' +
  '约束规则：\n' +
  '1) 只提取视频内容中明确提到的信息，不编造、不补充；\n' +
  '2) 合理推断请标注”（推断）”；\n' +
  '3) 不要出现”字幕””转写””转录”等字眼，统一以”视频”指代；\n' +
  '4) 直接输出总结，不要写”以下是总结””根据视频内容”等开场白。';

export function buildSummarizeUserPrompt(instruction: string, input: string): string {
  return `总结要求：${instruction}\n\n以下是该 B 站视频的内容文本，请据此生成总结：\n\n${input}`;
}

// ── Tag Suggestion ───────────────────────────────────────────────────

export const TAG_SYSTEM_PROMPT =
  '你是一个中文标签助手。根据给定的视频标题、UP主和总结，输出 5 到 8 个简短的中文标签，覆盖主题、领域、风格或目标受众。要求：\n' +
  '1) 每个标签 2-6 个字，不要带 # 号、不要带标点。\n' +
  '2) 优先用通用、可复用的领域词，避免照抄完整短语。\n' +
  '3) 只输出一个 JSON 数组，例如 ["AI","效率","编程"]，不要任何解释。';

export function buildTagSuggestUserPrompt(title: string, author: string, summary: string): string {
  return `标题：${title}\nUP主：${author}\n\n总结：\n${summary}`;
}

// ── Chat / Q&A ───────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT =
  '你是视频学习助手。只能基于用户提供的视频总结、字幕和引用回答；如果信息不足，请明确说明。回答中文，结构清晰，必要时引用时间戳。';

export function buildChatUserPrompt(question: string, summary: string, citations: string[], transcript: string): string {
  return `问题：${question}\n\n视频总结：\n${summary}\n\n相关字幕引用：\n${citations.join('\n')}\n\n完整文本摘录：\n${transcript.slice(0, 4000)}`;
}

// ── Rewrite ──────────────────────────────────────────────────────────

export const REWRITE_SYSTEM_PROMPT =
  '你是内容改写助手。只基于提供的视频总结改写，不编造事实。';

export const REWRITE_STYLE_MAP: Record<string, string> = {
  '公众号': '写成公众号文章，标题吸引人，结构完整，分节清晰。',
  '小红书': '写成小红书笔记，口语化，emoji 适量，标题吸睛，要点短。',
  '微博': '写成微博长文，观点鲜明，适合转发，尽量精炼。',
  '博客': '写成博客文章，逻辑严谨，适合知识沉淀。',
};

export function buildRewriteUserPrompt(
  platform: string,
  style: string,
  keyPoints: string[],
  summary: string,
): string {
  return `目标平台：${platform}\n风格要求：${style}\n\n核心要点：\n${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n原始总结：\n${summary}`;
}

// ── Quiz Generation ──────────────────────────────────────────────────

export const QUIZ_SYSTEM_PROMPT =
  '你是学习测验出题助手。只返回 JSON 数组，不要 Markdown。每题包含 type, question, options, answer, explanation。';

export function buildQuizUserPrompt(title: string, summary: string, transcript: string): string {
  return `基于以下内容生成 5 道中文学习测验题，题型混合选择题/判断题/简答题。\n标题：${title}\n总结：${summary}\n字幕摘录：${transcript.slice(0, 4000)}`;
}
