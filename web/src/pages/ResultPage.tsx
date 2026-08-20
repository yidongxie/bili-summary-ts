import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Circle,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Fullscreen,
  GitBranch,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Subtitles,
  User,
} from 'lucide-react';
import {
  createSummarizeTask,
  subscribeTask,
  saveLibrary,
  checkLibraryByBvid,
  type SummaryResult,
  type SubtitleSegment,
  type AppConfig,
  chatApi,
  translateApi,
  rewriteApi,
} from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { formatDuration, formatTimelineTime, markdownToHtml } from '@/lib/format';
import { mindNodeToMarkdown } from '@/lib/mindmap';
import { DownloadModal } from '@/components/modals/DownloadModal';

// Lazy-load the mind-map renderer (markmap + d3 + katex ≈ 600KB) so it only
// downloads when the user actually opens the mindmap tab.
const MarkmapMindMap = lazy(() =>
  import('@/components/MarkmapMindMap').then((m) => ({ default: m.MarkmapMindMap })),
);

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(w.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}

type Phase = 'submitting' | 'progress' | 'success' | 'error';
type TabKey = 'summary' | 'subtitles' | 'mindmap' | 'chat';
type MindNode = { label: string; children?: MindNode[] };
type ChatMessage = { role: 'user' | 'ai'; content: string };

interface ResultPageProps {
  url: string;
  mode: string;
  config: AppConfig;
  initialResult?: SummaryResult;
  initialSaved?: boolean;
  initialSeek?: number;
  onBack: () => void;
  onSaved: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
  onRequireLogin: () => void;
}

const PROCESS_STEPS = [
  '正在解析视频链接...',
  '正在提取音频轨道...',
  '正在进行语音转写...',
  '正在生成 AI 总结...',
  '正在构建思维导图...',
  '即将完成...',
];

const pageBg = 'var(--canvas)';
const cardBg = 'var(--canvas)';
const mutedBg = 'var(--surface)';
const border = 'var(--hairline)';
const fg = 'var(--ink)';
const muted = 'var(--steel)';
const primary = 'var(--primary)';

const darkCardStyle: CSSProperties = {
  background: cardBg,
  border: `1px solid ${border}`,
};
const darkSubtleStyle: CSSProperties = { background: mutedBg, border: `1px solid ${border}` };

function progressToStep(progress: string) {
  if (/完成/.test(progress)) return 5;
  if (/标签|思维/.test(progress)) return 4;
  if (/总结|AI/.test(progress)) return 3;
  if (/转写|Whisper|语音/.test(progress)) return 2;
  if (/音频|下载|提取/.test(progress)) return 1;
  return 0;
}

function plainMarkdown(md: string) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*`_\-]+/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .trim();
}

function splitSentences(text: string) {
  return text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

const KEY_INSIGHT_MARKERS = /(核心|关键|重要|建议|总结|结论|方法|策略|原理|本质|要点|启示|实践|行动)/;
const SKIP_SENTENCE_PATTERN = /^(AI|总结|笔记|以下是|根据视频|本文)/;

function buildKeyPoints(summary: string) {
  // Strategy: extract the most insightful sentences from the summary,
  // NOT just strip bullet markers (which duplicates the structured notes).
  // 1) Priority: sentences with key insight markers from the summary body
  // 2) Fallback: heading titles (which are usually the structural points)
  // 3) Last resort: first few non-trivial sentences

  const plain = plainMarkdown(summary);
  const allSentences = splitSentences(plain).filter((s) => !SKIP_SENTENCE_PATTERN.test(s));

  // Pick sentences with key insight markers first
  const insightSentences = allSentences.filter((s) => KEY_INSIGHT_MARKERS.test(s));

  // Also extract heading titles (AI already structures the summary with ## / ###)
  const headingTitles = Array.from(summary.matchAll(/^#{1,3}\s+(.+)$/gm))
    .map((m) => m[1].replace(/[#*_`]/g, '').trim())
    .filter((h) => h.length > 4 && h.length < 60 && !/^AI|总结|笔记/.test(h));

  // Merge: headings first (they're intentional structure), then insight sentences, then plain sentences
  const combined = [
    ...new Set([...headingTitles, ...insightSentences, ...allSentences]),
  ].filter((s) => s.length > 6 && s.length < 120);

  if (combined.length === 0) {
    // Nothing extracted — generate a minimal point from the first line
    const firstLine = summary.split('\n').find((l) => l.trim().length > 10);
    if (firstLine) combined.push(firstLine.replace(/^[#*>\-\s]+/, '').trim().slice(0, 100));
  }

  return combined.slice(0, 5);
}

type ChapterItem = { timestamp: string; title: string; detail?: string; from: number };

function cleanChapterTitle(text: string) {
  return plainMarkdown(text)
    .replace(/^[\d一二三四五六七八九十、.\s-]+/, '')
    .replace(/[，。！？；：,.!?;:]$/, '')
    .trim();
}

function extractSummaryChapters(summary: string): { title: string; detail?: string }[] {
  // AI summaries already have structured headings. Use them as chapters.
  // Match ## Title or ### Title lines, possibly followed by a short description.
  const lines = summary.split('\n');
  const found: { title: string; detail?: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,3}\s+(.+)$/);
    if (m) {
      const title = cleanChapterTitle(m[1]);
      if (!title) continue;
      // The next non-empty, non-heading line is the detail/summary of this section
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

  // If we found at least 2 headings, trust them; otherwise fall back to time-based
  if (found.length >= 2) return found;

  // Try bold text as headings (less reliable)
  const boldMatches = Array.from(summary.matchAll(/\*\*(.+?)\*\*/g))
    .map((m) => ({ title: cleanChapterTitle(m[1]), detail: undefined as string | undefined }))
    .filter((h) => h.title.length >= 4 && h.title.length <= 30);

  if (boldMatches.length >= 2) return boldMatches;
  return [];
}

/** Heuristic score for how good a chapter boundary between two adjacent subtitle segments is. */
function scoreBoundary(prev: string, next: string) {
  let score = 0;
  if (/[。！？!?]$/.test(prev)) score += 5;
  if (/[，；：,;:]$/.test(prev)) score += 2;
  if (/^(但是|所以|然后|接下来|第二|第三|另外|同时|最后|总结|那么|其实|比如|我们|你会|重点|核心)/.test(next)) score += 5;
  if (/^(好|那|诶|嗯|呃|这个|接着)/.test(next)) score += 2;
  if (prev.length > 18) score += 1;
  return score;
}

function buildChapters(segments: SubtitleSegment[] | undefined, summary: string): ChapterItem[] {
  // First choice: LLM-generated headings from the summary structure
  const summaryChapters = extractSummaryChapters(summary);
  if (summaryChapters.length >= 2) {
    // Evenly space timestamps across the video duration for heading-based chapters
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

  // Second choice: time-based segmentation from subtitle boundaries
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

  // Fallback: no segments, use generic labels
  const fallbackTitles = ['开场引入', '主要内容', '分析讲解', '案例实操', '总结收尾'];
  return fallbackTitles.map((h, i) => ({ timestamp: `0${i}:00`.slice(-5), from: i * 60, title: h }));
}

/** Parse plain transcript text into timestamped subtitle segments. */
function parseTranscriptToSegments(text: string): SubtitleSegment[] {
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

function buildSrt(segments: SubtitleSegment[] = []) {
  return segments
    .map((seg, i) => `${i + 1}\n${secondsToSrtTime(seg.from)} --> ${secondsToSrtTime(seg.to || seg.from + 3)}\n${seg.content}\n`)
    .join('\n');
}

type FormattedSubtitleLine = { from: number; text: string };

function subtitleTimestamp(seconds: number) {
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

// Whisper sometimes returns a single all-encompassing segment or none at all.
// Detect that and estimate progressive timestamps across the media duration so
// subtitle lines don't all render as [00:00:00].
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

function ensureTimedSegments(segments: SubtitleSegment[] = [], durationSeconds: number): SubtitleSegment[] {
  if (!segments.length) return segments;
  if (segments.length === 1) {
    // One segment carrying the whole text — split into sentences so we can space them out.
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

const MAX_SUBTITLE_LINE_CHARS = 80; // safety cap so a transcript without sentence-final punctuation can't collapse into one giant line

function formatSubtitleSegments(segments: SubtitleSegment[] = []): FormattedSubtitleLine[] {
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
      // Keep the actual sentence-ending punctuation (。！？) instead of always forcing a period
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
        // Safety net: flush mid-sentence once a line gets too long
        flushPending();
      }
    }
  }

  // Flush any remaining partial sentence
  flushPending();

  return lines;
}

function formattedSubtitleText(lines: FormattedSubtitleLine[]) {
  return lines.map((line) => `[${subtitleTimestamp(line.from)}] ${line.text}`).join('\n\n');
}

function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(u);
}

function buildMindMap(keyPoints: string[]): MindNode {
  return {
    label: '视频学习笔记',
    children: [
      { label: '核心要点', children: keyPoints.map((p) => ({ label: p.slice(0, 48) })) },
    ],
  };
}

function outlineText(node: MindNode, depth = 0): string {
  return `${'  '.repeat(depth)}- ${node.label}\n${(node.children || []).map((c) => outlineText(c, depth + 1)).join('')}`;
}

function mockChatReply(q: string) {
  if (/核心|观点/.test(q)) return '这个视频的核心观点可以概括为：尽早建立高质量输入系统，用大量阅读提升判断力，并把看到的内容转化成自己的行动清单。';
  if (/总结|要点/.test(q)) return '五个关键要点：持续阅读、主动筛选信息、建立笔记系统、定期复盘、把知识转化为实践。';
  if (/案例/.test(q)) return '视频中的案例主要围绕个人成长、阅读习惯、信息差和长期主义展开，可以作为建立学习系统的参考。';
  if (/资源|学习/.test(q)) return '建议继续学习：阅读方法、知识管理、批判性思维、写作输出和长期项目实践。';
  return '我会基于当前总结和字幕帮你分析。你可以继续追问某个观点、章节或行动建议。';
}

function extractYouTubeId(link: string) {
  try {
    const u = new URL(link);
    if (u.hostname.includes('youtu.be')) return u.pathname.replace(/^\//, '');
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || '';
  } catch {
    return '';
  }
  return '';
}

function getPlatformLabel(result: SummaryResult) {
  if (result.type === 'bilibili') return 'B站';
  if (result.type === 'douyin') return '抖音';
  if (result.type === 'youtube') return 'YouTube';
  if (result.type === 'xiaoyuzhou') return '小宇宙';
  return result.type || '视频';
}

function getHost(link?: string) {
  try {
    return link ? new URL(link).hostname.replace(/^www\./, '') : '未知来源';
  } catch {
    return '未知来源';
  }
}

function DarkButton({ children, onClick, variant = 'ghost', disabled }: { children: ReactNode; onClick?: () => void; variant?: 'ghost' | 'primary'; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition disabled:opacity-60"
      style={{
        background: 'var(--canvas)',
        color: disabled ? 'var(--muted)' : 'var(--ink)',
        border: '1px solid var(--hairline)',
      }}
    >
      {children}
    </button>
  );
}

export function ResultPage({ url, mode, config, initialResult, initialSaved, initialSeek, onBack, onSaved, onShowToast, onRequireLogin }: ResultPageProps) {
  const [phase, setPhase] = useState<Phase>(initialResult ? 'success' : 'submitting');
  const [progress, setProgress] = useState('正在提交任务…');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SummaryResult | null>(initialResult || null);
  const [saved, setSaved] = useState(!!initialSaved);
  const [downloadTarget, setDownloadTarget] = useState<{ kind: 'bilibili' | 'xiaoyuzhou'; bvid?: string; urlOrId?: string; title?: string } | null>(null);
  const [savedItemId, setSavedItemId] = useState(initialResult?.id || '');
  const [runId, setRunId] = useState(0);
  const [reRunKey, setReRunKey] = useState(0);
  const closeRef = useRef<(() => void) | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [rewritePlatform, setRewritePlatform] = useState('小红书');
  const [rewriteText, setRewriteText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState('');
  const [language, setLanguage] = useState('English');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['视频学习笔记', '核心要点']));
  const [mindFull, setMindFull] = useState(false);
  const [messages, setMessages] = useState<Array<ChatMessage & { citations?: Array<{ time: number; text: string }> }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [subtitleSearch, setSubtitleSearch] = useState('');
  const [highlightTime, setHighlightTime] = useState<number | null>(null);
  const [mindView, setMindView] = useState<'tree' | 'cards'>('tree');
  const [subtitleView, setSubtitleView] = useState<'original' | 'translated' | 'bilingual'>('original');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeContainerRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [streamFailed, setStreamFailed] = useState(false);
  const pendingSeekRef = useRef<number | null>(null);

  // Seek the player once when the user arrives via a citation (initialSeek).
  useEffect(() => {
    if (initialSeek != null && initialSeek > 0) pendingSeekRef.current = initialSeek;
  }, [initialSeek]);

  useEffect(() => {
    if (initialResult && !reRunKey) {
      setResult(initialResult);
      setSaved(!!initialSaved);
      setSavedItemId(initialResult.id || '');
      setPhase('success');
      return;
    }
    let cancelled = false;
    setPhase('submitting');
    setProgress('正在提交任务…');
    setError('');
    setResult(null);
    setSaved(false);
    (async () => {
      try {
        const created = await createSummarizeTask({
          url,
          mode,
          api_key: config.api_key || '',
          model: config.deepseek_model || 'deepseek-v4-flash',
          base_url: config.deepseek_base_url || 'https://api.deepseek.com/v1',
          whisper_api_key: config.whisper_api_key || '',
          whisper_base_url: config.whisper_base_url || '',
          whisper_model: config.whisper_model || '',
        });
        if (cancelled) return;
        if (!created.success || !created.task_id) throw new Error(created.error || '提交失败');
        setPhase('progress');
        setProgress('正在解析视频链接...');
        closeRef.current = subscribeTask(created.task_id, (e) => {
          if (e.type === 'status') setProgress(e.data?.progress || '处理中…');
          else if (e.type === 'complete') {
            const data: SummaryResult = e.data;
            setResult(data);
            setPhase('success');
            const idToCheck = data.video?.bvid || data.podcast?.audioUrl || data.podcast?.id;
            setSaved(false);
            if (idToCheck) {
              checkLibraryByBvid(idToCheck).then((r) => {
                if (r?.item?.id) {
                  // Already in the library (e.g. a re-run) — keep its id so the
                  // "更新收藏" button updates it instead of creating a duplicate.
                  setSavedItemId(r.item.id);
                } else {
                  // Fresh result not yet saved — auto-save to prevent loss.
                  setSavedItemId('');
                  void autoSave(data);
                }
              }).catch(() => {});
            }
            closeRef.current?.();
            closeRef.current = null;
          } else if (e.type === 'network-error') setProgress(e.data?.error || '连接中断，正在等待重连…');
          else if (e.type === 'error') {
            const msg = e.data?.error || '总结失败';
            setError(msg);
            setPhase('error');
            if (/未登录|401/.test(msg)) onRequireLogin();
            closeRef.current?.();
            closeRef.current = null;
          }
        });
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || '提交失败');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      closeRef.current?.();
      closeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, initialResult, initialSaved, reRunKey]);

  const meta = result?.video || result?.podcast;
  const keyPoints = useMemo(() => buildKeyPoints(result?.summary || ''), [result]);
  const chapters = useMemo(() => buildChapters(result?.subtitle_segments, result?.summary || ''), [result]);
  const notes = result?.summary || '';
  const subtitles = useMemo(() => {
    if (result?.subtitle_segments?.length) return result.subtitle_segments;
    // Fallback: parse transcript text into segments for display
    if (result?.transcript) {
      return parseTranscriptToSegments(result.transcript);
    }
    return [];
  }, [result]);
  const mindMap = useMemo(() => buildMindMap(keyPoints), [keyPoints]);
  const chatKey = useMemo(() => `bilistudy:chat:${meta?.link || (meta && 'bvid' in meta ? meta.bvid : undefined) || url}`, [meta, url]);

  useEffect(() => {
    if (!result) return;
    try {
      const raw = localStorage.getItem(chatKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [chatKey, result]);

  useEffect(() => {
    if (!result) return;
    try { localStorage.setItem(chatKey, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [chatKey, messages, result]);

  function seekVideo(seconds: number) {
    const v = videoRef.current;
    if (v) {
      v.currentTime = seconds;
      v.play().catch(() => {});
      return;
    }
    const yt = youtubePlayerRef.current;
    if (yt) {
      try {
        yt.seekTo(seconds, true);
        yt.playVideo();
      } catch { /* ignore */ }
    }
  }

  useEffect(() => {
    const link = result?.video?.link;
    if (result?.type !== 'youtube' || !link) return;
    const videoId = extractYouTubeId(link);
    if (!videoId) return;
    let disposed = false;
    let player: any = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    loadYouTubeApi().then((YT) => {
      if (disposed) return;
      player = new YT.Player(youtubeContainerRef.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { autoplay: 0, rel: 0 },
        events: {
          onReady: () => {
            if (disposed) return;
            youtubePlayerRef.current = player;
            interval = setInterval(() => {
              try {
                const t = player.getCurrentTime?.();
                if (typeof t === 'number') setVideoCurrentTime(Math.floor(t));
              } catch { /* ignore */ }
            }, 500);
          },
        },
      });
    });
    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      youtubePlayerRef.current = null;
      if (player) { try { player.destroy?.(); } catch { /* ignore */ } }
    };
  }, [result?.type, result?.video?.link]);

  useEffect(() => {
    setStreamFailed(false);
  }, [result?.video?.bvid]);

  function jumpToSubtitle(time: number) {
    setActiveTab('subtitles');
    setHighlightTime(time);
    seekVideo(time);
    setTimeout(() => document.getElementById(`subtitle-${Math.floor(time)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    setTimeout(() => setHighlightTime(null), 2200);
  }

  function askSelectedText() {
    const selected = window.getSelection()?.toString().trim() || '';
    if (selected.length > 8) {
      setActiveTab('chat');
      sendChat(`请解释这段话：${selected.slice(0, 500)}`);
    }
  }

  async function handleSave() {
    if (!result) return;
    const video = result.video || {
      title: result.podcast?.title || '',
      author: result.podcast?.author || '',
      duration: result.podcast?.duration || 0,
      bvid: result.podcast?.audioUrl || result.podcast?.id || '',
      link: result.podcast?.link || '',
      pic: result.podcast?.cover || '',
    };
    const isUpdate = !!savedItemId;
    const data = await saveLibrary({
      id: savedItemId || undefined,
      video,
      summary: result.summary,
      transcript: result.transcript || '',
      subtitle_count: result.subtitle_count,
      subtitle_segments: result.subtitle_segments || [],
      mode: result.mode || mode,
      // On update, omit notes/tags/category so the server keeps the user's
      // existing values instead of wiping them with the fresh task's defaults.
      ...(isUpdate ? {} : {
        category: config.default_category || '待整理',
        tags: result.suggested_tags || [],
        notes: '',
      }),
    });
    setSaved(true);
    onSaved();
    onShowToast(isUpdate ? `已更新：${data.item.title}` : `已保存：${data.item.title}`, 'ok');
  }

  // Auto-save a freshly-generated summary so nothing is lost if the user
  // forgets to click "保存". Best-effort — if it fails, the manual button stays.
  async function autoSave(data: SummaryResult) {
    const video = data.video || {
      title: data.podcast?.title || '',
      author: data.podcast?.author || '',
      duration: data.podcast?.duration || 0,
      bvid: data.podcast?.audioUrl || data.podcast?.id || '',
      link: data.podcast?.link || '',
      pic: data.podcast?.cover || '',
    };
    try {
      const saved = await saveLibrary({
        video,
        summary: data.summary,
        transcript: data.transcript || '',
        subtitle_count: data.subtitle_count,
        subtitle_segments: data.subtitle_segments || [],
        mode: data.mode || mode,
        category: config.default_category || '待整理',
        tags: data.suggested_tags || [],
        notes: '',
      });
      setSavedItemId(saved.item.id);
      setSaved(true);
      onSaved();
      onShowToast('已自动保存到收藏库', 'info');
    } catch {
      // keep saved=false so the user can still save manually
    }
  }

  function streamText(text: string, setter: (s: string) => void, speed = 20, chunk = 2, done?: () => void) {
    setter('');
    let i = 0;
    const t = setInterval(() => {
      i += chunk;
      setter(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(t);
        done?.();
      }
    }, speed);
  }

  async function sendChat(question?: string) {
    const q = (question ?? chatInput).trim();
    if (!q || streaming) return;
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setChatInput('');
    setStreaming('');
    try {
      const data = await chatApi({ question: q, summary: result?.summary || '', transcript: result?.transcript || '', segments: subtitles, history: messages.slice(-6) });
      const reply = data.answer || mockChatReply(q);
      streamText(reply, setStreaming, 18, 2, () => {
        setMessages((m) => [...m, { role: 'ai', content: reply, citations: data.citations || [] }]);
        setStreaming('');
      });
    } catch {
      const reply = mockChatReply(q);
      streamText(reply, setStreaming, 18, 2, () => {
        setMessages((m) => [...m, { role: 'ai', content: reply }]);
        setStreaming('');
      });
    }
  }

  async function handleTranslate() {
    setTranslating(true);
    setTranslation('');
    const raw = subtitles.map((s) => s.content).join('\n').trim();
    if (!raw) { setTranslating(false); onShowToast('暂无字幕可翻译', 'info'); return; }
    try {
      const data = await translateApi({ text: raw, target: language });
      streamText(data.text || '', setTranslation, 12, 6, () => setTranslating(false));
    } catch (e: any) {
      setTranslating(false);
      onShowToast(e?.message || '翻译失败，请检查 API Key 或稍后重试', 'error');
    }
  }

  async function handleRewrite() {
    const summary = plainMarkdown(notes).trim();
    if (!summary) { onShowToast('暂无内容可改写', 'info'); return; }
    try {
      const data = await rewriteApi({ platform: rewritePlatform, summary });
      streamText(data.text || '', setRewriteText, 15, 4);
    } catch (e: any) {
      onShowToast(e?.message || '改写失败，请检查 API Key 或稍后重试', 'error');
    }
  }

  if (phase === 'submitting' || phase === 'progress') return <LoadingState progress={progress} onBack={onBack} />;
  if (phase === 'error') return <ErrorState error={error} onBack={onBack} onRetry={() => setRunId((n) => n + 1)} onCopy={() => copyText(error).then(() => onShowToast('错误信息已复制', 'ok'))} />;
  if (!result || !meta || (!result.summary && !result.transcript && !subtitles.length)) return <NoDataState onBack={onBack} link={meta?.link} />;

  return (
    <main className="min-h-full overflow-y-auto px-4 sm:px-6 py-5" style={{ background: pageBg, color: fg }}>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-center gap-3 rounded-lg px-4 py-3 " style={darkCardStyle}>
          <DarkButton onClick={onBack}><ArrowLeft className="w-4 h-4" />返回</DarkButton>
          <div className="min-w-0 flex-1"><div className="truncate text-lg font-semibold">{meta.title || '视频总结'}</div></div>
            <span className="rounded-full px-2 py-1 text-xs" style={{ background: mutedBg, color: 'var(--ink)' }}>{getPlatformLabel(result)}</span>
            {savedItemId && (
              <DarkButton onClick={() => { copyText(window.location.origin + window.location.pathname + '#/item/' + savedItemId).then(() => onShowToast('链接已复制', 'ok')); }}><Copy className="w-4 h-4" />复制链接</DarkButton>
            )}
            <DarkButton variant="primary" onClick={() => setReRunKey((n) => n + 1)}><RefreshCw className="w-4 h-4" />重新总结</DarkButton>
          {result.type === 'bilibili' && result.video?.bvid && !result.video.bvid.startsWith('http') && (
            <DarkButton onClick={() => setDownloadTarget({ kind: 'bilibili', bvid: result.video!.bvid, title: result.video!.title })}><Download className="w-4 h-4" />下载视频</DarkButton>
          )}
          {result.type === 'xiaoyuzhou' && (result.podcast?.audioUrl || result.podcast?.id) && (
            <DarkButton onClick={() => setDownloadTarget({ kind: 'xiaoyuzhou', urlOrId: result.podcast?.id || result.podcast?.audioUrl || '', title: result.podcast?.title })}><Download className="w-4 h-4" />下载音频</DarkButton>
          )}
          {meta.link && <a href={meta.link} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm" style={darkSubtleStyle}><ExternalLink className="w-4 h-4" />查看原视频</a>}
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <aside className="lg:col-span-2">
            <div className="lg:sticky lg:top-20 space-y-4">
              <div className="rounded-lg overflow-hidden" style={darkCardStyle}>
                <div className="aspect-video overflow-hidden flex items-center justify-center" style={{ background: `var(--surface)` }}>
                  {result.video?.bvid && result.type === 'bilibili' && !result.video.bvid.startsWith('http') ? (
                    streamFailed ? (
                      <iframe
                        src={`https://player.bilibili.com/player.html?bvid=${result.video.bvid}&autoplay=0&high_quality=1`}
                        frameBorder={0}
                        allowFullScreen
                        className="w-full h-full"
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        controls
                        playsInline
                        className="w-full h-full"
                        src={`/api/stream/bilibili?bvid=${result.video.bvid}`}
                        onLoadedMetadata={(e) => {
                          const t = pendingSeekRef.current;
                          if (t != null) {
                            pendingSeekRef.current = null;
                            e.currentTarget.currentTime = t;
                            e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onTimeUpdate={(e) => setVideoCurrentTime(Math.floor(e.currentTarget.currentTime))}
                        onError={() => setStreamFailed(true)}
                      />
                    )
                  ) : result.type === 'youtube' && result.video?.link ? (
                    <div ref={youtubeContainerRef} className="w-full h-full" />
                  ) : result.video?.bvid?.startsWith('http') || result.podcast?.audioUrl ? (
                    <div className="w-full p-5 flex flex-col items-center gap-4">
                      {(result.video?.pic || result.podcast?.cover) && <img src={result.video?.pic || result.podcast?.cover} alt="封面" className="w-36 h-36 object-cover rounded-lg shadow-lg" />}
                      <audio controls className="w-full max-w-sm" src={`/api/proxy/audio?url=${encodeURIComponent(result.video?.bvid || result.podcast?.audioUrl || '')}`} />
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="mx-auto mb-3 size-16 rounded-lg flex items-center justify-center" style={{ background: `var(--primary)` }}><Sparkles className="w-8 h-8 text-white" /></div>
                      <div className="text-sm" style={{ color: muted }}>视频预览区域</div>
                    </div>
                  )}
                </div>
                <div className="p-5 space-y-3">
                  <div className="font-semibold text-sm">{meta.title}</div>
                  <div className="text-xs" style={{ color: muted }}>{getHost(meta.link)} · {formatDuration(meta.duration || 0)}</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full px-2 py-1 text-xs" style={{ background: 'rgba(5,150,105,.12)', color: '#047857' }}>✅ 已完成</span>
                    <span className="rounded-full px-2 py-1 text-xs" style={{ background: mutedBg, color: 'var(--steel)' }}>{chapters.length} 个章节</span>
                  </div>
                </div>
              </div>
              <DarkButton variant="primary" onClick={handleSave} disabled={saved}><Save className="w-4 h-4" />{saved ? '已收藏' : savedItemId ? '更新收藏' : '保存到收藏库'}</DarkButton>
            </div>
          </aside>

          <section className="lg:col-span-3 space-y-4">
            <TabBar active={activeTab} onChange={setActiveTab} />
            {activeTab === 'summary' && <SummaryTab notes={notes} copied={copiedNotes} setCopied={setCopiedNotes} rewritePlatform={rewritePlatform} setRewritePlatform={setRewritePlatform} rewriteText={rewriteText} onRewrite={handleRewrite} />}
            {activeTab === 'subtitles' && <SubtitlesTab segments={subtitles} duration={meta?.duration || 0} search={subtitleSearch} setSearch={setSubtitleSearch} highlightTime={highlightTime} language={language} setLanguage={setLanguage} translating={translating} translation={translation} view={subtitleView} setView={setSubtitleView} onAskSelected={askSelectedText} seek={seekVideo} currentTime={videoCurrentTime} onTranslate={handleTranslate} />}
            {activeTab === 'mindmap' && <MindMapTab node={mindMap} expanded={expanded} setExpanded={setExpanded} full={mindFull} setFull={setMindFull} view={mindView} setView={setMindView} />}
            {activeTab === 'chat' && <ChatTab messages={messages} streaming={streaming} input={chatInput} setInput={setChatInput} send={sendChat} jump={jumpToSubtitle} />}
          </section>
        </div>
      </div>
      {downloadTarget && (
        <DownloadModal
          open={!!downloadTarget}
          onClose={() => setDownloadTarget(null)}
          kind={downloadTarget.kind}
          bvid={downloadTarget.bvid}
          urlOrId={downloadTarget.urlOrId}
          title={downloadTarget.title}
          onShowToast={onShowToast}
        />
      )}
    </main>
  );
}

function LoadingState({ progress, onBack }: { progress: string; onBack: () => void }) {
  const current = progressToStep(progress);
  const totalSteps = PROCESS_STEPS.length;
  const stepNames = PROCESS_STEPS.map(function pickLabel(raw: string) {
    return raw.replace(/正在(.*?)\.{3}/, '$1').replace(/。*\.*$/, '');
  });
  const colors = ['var(--brand-green)', 'var(--brand-green-deep)', 'var(--brand-tag)', 'var(--brand-warn)', 'var(--brand-green)', 'var(--brand-green-deep)'];
  function isDone(i: number, cur: number) { return i < cur; }
  function isActive(i: number, cur: number) { return i === cur; }
  function stepPercent(cur: number) { return totalSteps ? Math.round(((cur + 0.5) / totalSteps) * 100) : 0; }
  return (
    <main className="min-h-full flex items-center justify-center p-6" style={{ background: pageBg, color: fg }}>
      <div className="w-full max-w-md rounded-lg p-8 text-center" style={darkCardStyle}>
        <Sparkles className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--brand-green)' }} />
        <h2 className="text-lg font-semibold">正在处理您的视频</h2>
        <p className="mt-2 text-sm" style={{ color: muted }}>{progress}</p>
        <div className="mt-6 mb-1">
          {/* HeroUI-style progress bar */}
          <div className="w-full rounded-full overflow-hidden" style={{ height: 10, background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${stepPercent(current)}%`,
                background: `linear-gradient(90deg,${colors[Math.max(0, current)]},${colors[Math.min(totalSteps - 1, current + 1)]})`,
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: muted }}>
          <span>{stepNames[0]}</span>
          <span className="font-mono">{current + 1} / {totalSteps}</span>
          <span>{stepNames[totalSteps - 1]}</span>
        </div>
        <div className="mt-5 space-y-2 text-left">
          {PROCESS_STEPS.map((s, i) => (
            <div
              key={s}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-300"
              style={{
                color: isDone(i, current) ? fg : isActive(i, current) ? fg : muted,
                background: isDone(i, current) ? 'rgba(0,212,164,0.08)' : isActive(i, current) ? 'var(--surface)' : 'transparent',
                border: isActive(i, current) ? '1px solid var(--hairline)' : '1px solid transparent',
              }}
            >
              {isDone(i, current) ? (
                <Check className="w-4 h-4" style={{ color: 'var(--brand-green)' }} />
              ) : isActive(i, current) ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ink)' }} />
              ) : (
                <Circle className="w-4 h-4 opacity-40" />
              )}
              {s}
            </div>
          ))}
        </div>
        <button onClick={onBack} className="mt-5 text-sm" style={{ color: muted }}>取消并返回</button>
      </div>
    </main>
  );
}

function ErrorState({ error, onBack, onRetry, onCopy }: { error: string; onBack: () => void; onRetry: () => void; onCopy: () => void }) {
  return <main className="min-h-full flex items-center justify-center p-6" style={{ background: pageBg, color: fg }}><div className="max-w-lg rounded-3xl p-8 text-center space-y-4" style={darkCardStyle}><h2 className="text-lg font-semibold">处理失败</h2><p className="text-sm" style={{ color: 'hsl(220 10% 65%)' }}>{error}</p><div className="flex flex-wrap justify-center gap-2"><DarkButton variant="primary" onClick={onRetry}><RefreshCw className="w-4 h-4" />重试</DarkButton><DarkButton onClick={onCopy}><Copy className="w-4 h-4" />复制错误</DarkButton><DarkButton onClick={onBack}>返回</DarkButton></div></div></main>;
}

function NoDataState({ onBack, link }: { onBack: () => void; link?: string }) {
  return <main className="min-h-full flex items-center justify-center p-6" style={{ background: pageBg, color: fg }}><div className="rounded-3xl p-8 text-center" style={darkCardStyle}><Sparkles className="w-12 h-12 mx-auto mb-4" /><h2 className="text-lg font-semibold">未获取到可展示内容</h2><div className="mt-5 flex gap-2 justify-center"><DarkButton onClick={onBack}>返回首页</DarkButton>{link && <a href={link} target="_blank" rel="noreferrer"><DarkButton>查看原视频</DarkButton></a>}</div></div></main>;
}

function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs = [
    ['summary', FileText, '总结'], ['subtitles', Subtitles, '字幕'], ['mindmap', GitBranch, '思维导图'], ['chat', MessageCircle, '对话'],
  ] as const;
  return <div className="grid grid-cols-4 rounded-lg p-1" style={darkSubtleStyle}>{tabs.map(([key, Icon, label]) => <button key={key} onClick={() => onChange(key)} className="flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm" style={{ background: active === key ? `${primary}2e` : 'transparent', color: active === key ? 'var(--ink)' : muted }}><Icon className="w-4 h-4" /><span className="hidden sm:inline">{label}</span></button>)}</div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-lg p-5" style={darkCardStyle}><h3 className="mb-4 text-base font-semibold">{title}</h3>{children}</div>; }

function SummaryTab({ notes, copied, setCopied, rewritePlatform, setRewritePlatform, rewriteText, onRewrite }: any) {
  async function copyNotes() { await copyText(notes); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return <div className="space-y-6"><div className="summary rounded-lg p-4 text-sm" style={{ background: 'var(--surface)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(notes) }} /><div className="mt-4 flex flex-wrap items-center gap-2"><DarkButton onClick={copyNotes}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? '已复制' : '复制笔记'}</DarkButton><DarkButton onClick={() => downloadText('summary.md', notes, 'text/markdown;charset=utf-8')}><Download className="w-4 h-4" />导出 Markdown</DarkButton><div className="ml-auto flex gap-2"><select value={rewritePlatform} onChange={(e) => setRewritePlatform(e.target.value)} className="rounded-lg px-2 py-2 text-sm" style={{ background: 'var(--canvas)', color: fg, border: `1px solid ${border}` }}><option>公众号</option><option>小红书</option><option>微博</option><option>博客</option></select><DarkButton variant="primary" onClick={onRewrite}>改写</DarkButton></div></div>{rewriteText && <div className="mt-4 rounded-lg p-4 text-sm whitespace-pre-wrap" style={darkSubtleStyle}>{rewriteText}</div>}</div>;
}

function SubtitlesTab({ segments, duration, language, setLanguage, translating, translation, onTranslate, seek, currentTime }: any) {
  const timed = ensureTimedSegments(segments, duration);
  const formatted = formatSubtitleSegments(timed);
  const txt = formattedSubtitleText(formatted);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRef = useRef(-1);
  let activeIdx = -1;
  if (currentTime != null) {
    for (let i = 0; i < formatted.length; i++) {
      if (currentTime >= formatted[i].from) activeIdx = i;
    }
  }
  useEffect(() => {
    if (activeIdx >= 0 && activeIdx !== lastActiveRef.current) {
      lastActiveRef.current = activeIdx;
      listRef.current?.querySelector('[data-idx="' + activeIdx + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx]);
  const markdown = `# 字幕\n\n${txt}`;
  return <Panel title="字幕"><div className="mb-4 flex flex-wrap gap-2"><DarkButton onClick={() => copyText(txt)}><Copy className="w-4 h-4" />复制全部</DarkButton><DarkButton onClick={() => downloadText('subtitles.srt', buildSrt(timed))}><Download className="w-4 h-4" />导出 SRT</DarkButton><DarkButton onClick={() => downloadText('subtitles.md', markdown, 'text/markdown;charset=utf-8')}><Download className="w-4 h-4" />导出 Markdown</DarkButton><select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg px-2 py-2 text-sm" style={{ background: 'var(--canvas)', color: fg, border: `1px solid ${border}` }}><option>English</option><option>日本語</option><option>한국어</option><option>繁體中文</option><option>Français</option><option>Deutsch</option><option>Español</option></select><DarkButton variant="primary" onClick={onTranslate} disabled={translating}>{translating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}开始翻译</DarkButton></div>{translation && <div className="mb-4 rounded-lg p-4 text-sm whitespace-pre-wrap" style={darkSubtleStyle}>{translation}</div>}<div ref={listRef} className="max-h-[500px] overflow-y-auto divide-y" style={{ borderColor: border }}>{formatted.map((line, i) => <div key={i} id={'subtitle-' + Math.floor(line.from)} data-idx={i} onClick={(e) => { const sel = window.getSelection(); if (sel && sel.rangeCount > 0 && !sel.isCollapsed) return; seek?.(line.from); }} className="flex items-start gap-4 px-4 py-3 cursor-pointer transition-colors" style={{ background: i === activeIdx ? 'rgba(0,212,164,0.12)' : undefined }}><span className="w-24 shrink-0 font-mono text-xs tabular-nums" style={{ color: muted }}>[{subtitleTimestamp(line.from)}]</span><span className="min-w-0 flex-1 text-sm leading-relaxed" style={{ color: fg }}>{line.text}</span></div>)}</div></Panel>;
}

function MindMapTab({ node, expanded, setExpanded, full, setFull }: any) {
  const collect = (n: MindNode): string[] => [n.label, ...(n.children || []).flatMap(collect)];
  const markdown = mindNodeToMarkdown(node);
  const box = (
    <Panel title="思维导图">
      <div className="mb-4 flex flex-wrap gap-2">
        <DarkButton onClick={() => setExpanded(new Set(collect(node)))}>全部展开</DarkButton>
        <DarkButton onClick={() => setExpanded(new Set())}>全部收起</DarkButton>
        <DarkButton onClick={() => copyText(outlineText(node))}>复制大纲</DarkButton>
        <DarkButton onClick={() => downloadText('mindmap.md', markdown, 'text/markdown;charset=utf-8')}><Download className="w-4 h-4" />导出 Markdown</DarkButton>
        <DarkButton variant="primary" onClick={() => setFull(!full)}><Fullscreen className="w-4 h-4" />{full ? '退出全屏' : '全屏'}</DarkButton>
      </div>
      <Suspense fallback={<div className="flex items-center justify-center" style={{ height: full ? 760 : 560, color: 'var(--steel)' }}>思维导图加载中…</div>}>
        <MarkmapMindMap node={node} height={full ? 760 : 560} />
      </Suspense>
    </Panel>
  );
  return full ? <div className="fixed inset-4 z-50 overflow-y-auto rounded-lg" style={{ background: pageBg }}>{box}</div> : box;
}

function ChatTab({ messages, streaming, input, setInput, send }: any) {
  const suggestions = ['这个视频的核心观点是什么？', '能帮我总结一下关键要点', '视频中提到了哪些具体案例？', '有什么值得进一步学习的资源？'];
  return <Panel title="对话"><div className="min-h-[420px] space-y-4">{messages.length === 0 && !streaming ? <div className="py-10 text-center"><div className="mx-auto mb-4 size-16 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}><Bot className="w-8 h-8" /></div><div className="grid gap-2 sm:grid-cols-2">{suggestions.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full p-3 text-left text-sm" style={darkSubtleStyle}>{q}</button>)}</div></div> : null}{messages.map((m: ChatMessage, i: number) => <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>{m.role === 'ai' && <Bot className="mt-1 w-6 h-6" />}<div className="max-w-[80%] rounded-lg px-4 py-2 text-sm" style={m.role === 'user' ? { background: 'var(--surface)', color: fg, border: '1px solid var(--hairline)', borderBottomRightRadius: 6 } : { background: 'var(--canvas)', color: fg, border: '1px solid var(--hairline)', borderBottomLeftRadius: 6 }}>{m.content}</div>{m.role === 'user' && <User className="mt-1 w-6 h-6" />}</div>)}{streaming && <div className="flex gap-2"><Sparkles className="mt-1 w-6 h-6 animate-pulse" /><div className="max-w-[80%] rounded-lg px-4 py-2 text-sm" style={darkSubtleStyle}>{streaming}<span className="animate-pulse">|</span></div></div>}</div><div className="mt-4 flex gap-2"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className="min-h-10 max-h-32 flex-1 resize-none rounded-full px-3 py-2 text-sm outline-none" style={{ background: 'var(--canvas)', color: fg, border: `1px solid ${border}` }} /><button onClick={() => send()} className="size-10 rounded-full flex items-center justify-center" style={{ background: 'var(--canvas)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}><Send className="w-4 h-4" /></button></div></Panel>;
}
