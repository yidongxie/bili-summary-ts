// Pure helpers for the result page: chapter heuristics, subtitle formatting,
// SRT/Markdown export, and progress mapping. Extracted from ResultPage.tsx so
// the page component stays focused on interaction state.

import { formatTimelineTime } from './format';
import type { SubtitleSegment, SummaryResult } from './api';

export function progressToStep(progress: string) {
  if (/完成/.test(progress)) return 4;
  if (/总结|AI|标签/.test(progress)) return 3;
  if (/转写|Whisper|语音/.test(progress)) return 2;
  if (/音频|下载|提取/.test(progress)) return 1;
  return 0;
}

export function plainMarkdown(md: string) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*`_\-]+/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .trim();
}

export type ChapterItem = { timestamp: string; title: string; detail?: string; from: number };

export function cleanChapterTitle(text: string) {
  return plainMarkdown(text)
    .replace(/^[\d一二三四五六七八九十、.\s-]+/, '')
    .replace(/[，。！？；：,.!?;:]$/, '')
    .trim();
}

export function extractSummaryChapters(summary: string): { title: string; detail?: string }[] {
  const lines = summary.split('\n');
  const found: { title: string; detail?: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,3}\s+(.+)$/);
    if (m) {
      const title = cleanChapterTitle(m[1]);
      if (!title) continue;
      let detail: string | undefined;
      for (let j = i + 1; j < lines.length && j < i + 5; j++) {
        const next = lines[j].trim();
        if (next && !/^#/.test(next) && next.length > 10) {
          detail = cleanChapterTitle(next).slice(0, 80);
          break;
        }
      }
      found.push({ title, detail });
    }
  }

  if (found.length >= 2) return found;

  const boldMatches = Array.from(summary.matchAll(/\*\*(.+?)\*\*/g))
    .map((m) => ({ title: cleanChapterTitle(m[1]), detail: undefined as string | undefined }))
    .filter((h) => h.title.length >= 4 && h.title.length <= 30);

  if (boldMatches.length >= 2) return boldMatches;
  return [];
}

function scoreBoundary(prev: string, next: string) {
  let score = 0;
  if (/[。！？!?]$/.test(prev)) score += 5;
  if (/[，；：,;:]$/.test(prev)) score += 2;
  if (/^(但是|所以|然后|接下来|第二|第三|另外|同时|最后|总结|那么|其实|比如|我们|你会|重点|核心)/.test(next)) score += 5;
  if (/^(好|那|诶|嗯|呃|这个|接着)/.test(next)) score += 2;
  if (prev.length > 18) score += 1;
  return score;
}

export function buildChapters(segments: SubtitleSegment[] | undefined, summary: string): ChapterItem[] {
  const summaryChapters = extractSummaryChapters(summary);
  if (summaryChapters.length >= 2) {
    const maxTime = segments?.length
      ? Math.max(...segments.map((s) => Number(s.to || s.from || 0)), 0)
      : 600;
    const interval = maxTime / (summaryChapters.length + 1);
    return summaryChapters.map((ch, i) => ({
      timestamp: formatTimelineTime(Math.round(interval * (i + 0.5))),
      from: Math.round(interval * (i + 0.5)),
      title: ch.title,
      detail: ch.detail,
    }));
  }

  if (segments?.length) {
    const headings = summaryChapters.map((c) => c.title);
    const duration = Math.max(...segments.map((s) => Number(s.to || s.from || 0)), 0);
    const targetCount = Math.min(6, Math.max(3, Math.round(duration / 240) || 4));
    const minGap = Math.max(6, Math.floor(segments.length / Math.max(targetCount, 1) / 2));
    const candidates: Array<{ index: number; score: number }> = [];
    for (let i = 1; i < segments.length; i++) {
      candidates.push({ index: i, score: scoreBoundary(segments[i - 1]?.content || '', segments[i]?.content || '') });
    }
    const picked = [0];
    for (const c of candidates.sort((a, b) => b.score - a.score || a.index - b.index)) {
      if (picked.length >= targetCount) break;
      if (picked.every((idx) => Math.abs(idx - c.index) >= minGap)) picked.push(c.index);
    }
    return picked.sort((a, b) => a - b).map((idx, i) => {
      const seg = segments[Math.min(idx, segments.length - 1)];
      const context = segments.slice(idx, Math.min(idx + 3, segments.length)).map((s) => s.content).join('');
      const fallback = cleanChapterTitle(context).slice(0, 28) || `第${i + 1}段`;
      const title = headings[i] || fallback;
      return { timestamp: formatTimelineTime(seg.from || 0), from: Number(seg.from || 0), title: title.length > 30 ? title.slice(0, 30) + '…' : title, detail: fallback !== title ? fallback : undefined };
    });
  }

  const fallbackTitles = ['开场引入', '主要内容', '分析讲解', '案例实操', '总结收尾'];
  return fallbackTitles.map((h, i) => ({ timestamp: `0${i}:00`.slice(-5), from: i * 60, title: h }));
}

export function parseTranscriptToSegments(text: string): SubtitleSegment[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const segments: SubtitleSegment[] = [];
  let timeOffset = 0;

  for (const line of lines) {
    const tsMatch = line.match(/^\[?(\d{1,3}:?\d{2}(?:\.\d+)?)\]\s*(.+)/);
    if (tsMatch) {
      let seconds: number;
      if (tsMatch[1].includes(':')) {
        const [min, sec] = tsMatch[1].split(':').map(Number);
        seconds = min * 60 + (sec || 0);
      } else {
        seconds = parseFloat(tsMatch[1]);
      }
      timeOffset = seconds;
      const content = tsMatch[2].trim();
      if (content) {
        segments.push({ from: timeOffset, to: timeOffset + Math.max(3, content.length / 5), content });
      }
    } else {
      segments.push({ from: timeOffset, to: timeOffset + 3, content: line.trim() });
      timeOffset += 3;
    }
  }

  return segments;
}

function secondsToSrtTime(seconds: number) {
  const ms = Math.max(0, Math.floor((seconds % 1) * 1000));
  const total = Math.floor(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function buildSrt(segments: SubtitleSegment[] = []) {
  return segments
    .map((seg, i) => `${i + 1}\n${secondsToSrtTime(seg.from)} --> ${secondsToSrtTime(seg.to || seg.from + 3)}\n${seg.content}\n`)
    .join('\n');
}

export type FormattedSubtitleLine = { from: number; text: string };

export function subtitleTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function normalizeSubtitleText(text: string) {
  return String(text || '').replace(/\s+/g, ' ').replace(/([，。！？；：,.!?;:])+/g, '$1').trim();
}

function splitByPunctuation(text: string) {
  return normalizeSubtitleText(text).match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/g)?.map((s) => s.trim()).filter(Boolean) || [];
}

function semanticBreakIndex(text: string, min = 12, ideal = 18, max = 25) {
  const candidates = ['但是', '所以', '因为', '如果', '那么', '而且', '然后', '其实', '比如', '或者', '以及', '同时', '不过', '只是', '并且', '对于', '关于', '通过', '我们', '你会', '就会', '才会', '才能'];
  const positions: number[] = [];
  for (const token of candidates) {
    let idx = text.indexOf(token, 1);
    while (idx > 0) {
      positions.push(idx);
      idx = text.indexOf(token, idx + token.length);
    }
  }
  const usable = positions.filter((idx) => idx >= min && idx <= max);
  if (usable.length) return usable.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
  const softMarks = ['，', '；', '：', ',', ';', ':', '、'];
  const markPositions = [...text].map((ch, i) => (softMarks.includes(ch) ? i + 1 : -1)).filter((i) => i >= min && i <= max);
  if (markPositions.length) return markPositions.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
  return Math.min(Math.max(min, ideal), max, text.length);
}

function splitLongSubtitleClause(text: string): string[] {
  let rest = text.trim();
  const out: string[] = [];
  while (rest.length > 25) {
    const idx = semanticBreakIndex(rest);
    out.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function distributeTimestamps(segments: SubtitleSegment[], durationSeconds: number): SubtitleSegment[] {
  const duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : Math.max(segments.length * 3, 60);
  const totalLen = segments.reduce((sum, s) => sum + (s.content || '').length, 0) || 1;
  let cursor = 0;
  return segments.map((s) => {
    const from = cursor;
    cursor = Math.min(duration, cursor + ((s.content || '').length / totalLen) * duration);
    return { from, to: cursor, content: s.content };
  });
}

export function ensureTimedSegments(segments: SubtitleSegment[] = [], durationSeconds: number): SubtitleSegment[] {
  if (!segments.length) return segments;
  if (segments.length === 1) {
    const sentences = splitByPunctuation(segments[0].content)
      .map((s) => s.replace(/[，；：,;:]$/, '').trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      return distributeTimestamps(sentences.map((c) => ({ from: 0, to: 0, content: c })), durationSeconds);
    }
    return segments;
  }
  const starts = new Set(segments.map((s) => Number(s.from || 0)));
  return starts.size > 1 ? segments : distributeTimestamps(segments, durationSeconds);
}

const MAX_SUBTITLE_LINE_CHARS = 80;

export function formatSubtitleSegments(segments: SubtitleSegment[] = []): FormattedSubtitleLine[] {
  const lines: FormattedSubtitleLine[] = [];
  let pending: { from: number; parts: string[]; endPunct: string } | null = null;

  const flushPending = () => {
    if (!pending || !pending.parts.length) return;
    lines.push({ from: pending.from, text: pending.parts.join('') + pending.endPunct });
    pending = null;
  };

  for (const seg of segments) {
    const clauses = splitByPunctuation(seg.content).flatMap(splitLongSubtitleClause);
    if (!clauses.length) continue;

    for (const raw of clauses) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const isEnd = /[。！？]$/.test(trimmed);
      const part = trimmed.replace(/[，。！？；：,.!?;:]+$/, '').trim();
      if (!part) continue;

      if (!pending) {
        pending = { from: Number(seg.from || 0), parts: [], endPunct: '。' };
      }
      pending.parts.push(part);

      if (isEnd) {
        pending.endPunct = trimmed.slice(-1);
        flushPending();
      } else if (pending.parts.join('').length >= MAX_SUBTITLE_LINE_CHARS) {
        flushPending();
      }
    }
  }

  flushPending();

  return lines;
}

export function formattedSubtitleText(lines: FormattedSubtitleLine[]) {
  return lines.map((line) => `[${subtitleTimestamp(line.from)}] ${line.text}`).join('\n\n');
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(u);
}

export function extractYouTubeId(link: string) {
  try {
    const u = new URL(link);
    if (u.hostname.includes('youtu.be')) return u.pathname.replace(/^\//, '');
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || '';
  } catch {
    return '';
  }
  return '';
}

export function getPlatformLabel(result: SummaryResult) {
  if (result.type === 'bilibili') return 'B站';
  if (result.type === 'douyin') return '抖音';
  if (result.type === 'youtube') return 'YouTube';
  if (result.type === 'xiaoyuzhou') return '小宇宙';
  return result.type || '视频';
}

export function getHost(link?: string) {
  try {
    return link ? new URL(link).hostname.replace(/^www\./, '') : '未知来源';
  } catch {
    return '未知来源';
  }
}
