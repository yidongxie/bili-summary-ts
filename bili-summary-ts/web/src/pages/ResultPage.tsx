import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Save,
  RefreshCw,
  X as CloseIcon,
  CheckCircle2,
} from 'lucide-react';
import {
  createSummarizeTask,
  subscribeTask,
  saveLibrary,
  checkLibraryByBvid,
  suggestTags,
  type AppConfig,
  type SummaryResult,
  type SubtitleSegment,
} from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { formatDuration, formatTimelineTime, markdownToHtml, parseTagInput } from '@/lib/format';

type Phase = 'submitting' | 'progress' | 'success' | 'error';

interface ResultPageProps {
  url: string;
  mode: string;
  config: AppConfig;
  onBack: () => void;
  onSaved: () => void;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
  onRequireLogin: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(14,165,233,0.14)',
  backdropFilter: 'blur(16px)',
  boxShadow:
    '0 4px 24px rgba(14,165,233,0.07), inset 0 1px 0 rgba(255,255,255,0.85)',
};

// Group transcript segments into readable paragraphs. Same heuristic as
// public/index.legacy.html: break on a >=4s pause, ~90s of running text, or
// 12 segments per paragraph — whichever comes first.
function groupTranscript(segments: SubtitleSegment[] | undefined) {
  if (!segments || !segments.length) return [];
  const active = segments
    .filter((s) => s.content && s.content.trim())
    .sort((a, b) => Number(a.from || 0) - Number(b.from || 0));
  if (!active.length) return [];
  const paragraphs: { from: number; to: number; texts: string[] }[] = [];
  let cur = { from: active[0].from, to: active[0].to, texts: [active[0].content.trim()] };
  for (let i = 1; i < active.length; i++) {
    const s = active[i];
    const prev = active[i - 1];
    const gap = Number(s.from || 0) - Number(prev.to || prev.from || 0);
    const blockLength = Number(s.from || 0) - Number(cur.from || 0);
    if (gap >= 4 || blockLength >= 90 || cur.texts.length >= 12) {
      paragraphs.push(cur);
      cur = { from: s.from, to: s.to, texts: [s.content.trim()] };
    } else {
      cur.to = s.to;
      cur.texts.push(s.content.trim());
    }
  }
  paragraphs.push(cur);
  return paragraphs;
}

export function ResultPage({
  url,
  mode,
  config,
  onBack,
  onSaved,
  onShowToast,
  onRequireLogin,
}: ResultPageProps) {
  const [phase, setPhase] = useState<Phase>('submitting');
  const [progress, setProgress] = useState('正在提交任务…');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SummaryResult | null>(null);

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [extraTags, setExtraTags] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState(config.default_category || '待整理');

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const closeRef = useRef<(() => void) | null>(null);

  // Kick off the summarize task once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const created = await createSummarizeTask({
          url,
          mode,
          api_key: config.api_key || '',
          model: config.deepseek_model || 'deepseek-chat',
          base_url: config.deepseek_base_url || 'https://api.deepseek.com/v1',
          whisper_api_key: config.whisper_api_key || '',
          whisper_base_url: config.whisper_base_url || '',
          whisper_model: config.whisper_model || '',
        });
        if (cancelled) return;
        if (!created.success || !created.task_id) {
          throw new Error(created.error || '提交失败');
        }
        setPhase('progress');
        setProgress('排队中…');

        closeRef.current = subscribeTask(created.task_id, (e) => {
          if (e.type === 'status') {
            setProgress(e.data?.progress || '处理中…');
          } else if (e.type === 'complete') {
            const data: SummaryResult = e.data;
            setResult(data);
            setSelectedTags(new Set(data.suggested_tags || []));
            setPhase('success');
            // Check if this video/podcast is already saved.
            const idToCheck = data.video?.bvid || data.podcast?.id;
            if (idToCheck) {
              checkLibraryByBvid(idToCheck)
                .then((r) => setSaved(!!r.saved))
                .catch(() => {});
            }
            const srcLabel = data.transcript_source === 'whisper' ? '语音转写' : '字幕';
            if (data.subtitle_count) {
              onShowToast(`完成。${srcLabel} ${data.subtitle_count} 条。`, 'ok');
            } else {
              onShowToast('已生成底座总结：未获取到字幕。', 'info');
            }
            closeRef.current?.();
            closeRef.current = null;
          } else if (e.type === 'error') {
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
        const msg = err.message || '提交失败';
        setError(msg);
        setPhase('error');
        if (/未登录|401/.test(msg)) onRequireLogin();
      }
    })();
    return () => {
      cancelled = true;
      closeRef.current?.();
      closeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTag(t: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function collectTags(): string[] {
    const merged = new Set<string>();
    selectedTags.forEach((t) => merged.add(t));
    parseTagInput(extraTags).forEach((t) => merged.add(t));
    return Array.from(merged);
  }

  async function handleRegenerateTags() {
    if (!result) return;
    setRegenerating(true);
    try {
      const meta = result.video || result.podcast;
      const data = await suggestTags({
        title: meta?.title || '',
        author: meta?.author || '',
        summary: result.summary || '',
      });
      setResult({ ...result, suggested_tags: data.tags || [] });
      setSelectedTags(new Set(data.tags || []));
    } catch (err: any) {
      onShowToast('生成标签失败：' + (err.message || ''), 'error');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopySummary() {
    if (!result) return;
    const copied = await copyText(result.summary || '');
    onShowToast(copied ? '总结已复制' : '复制失败，请手动选择文本复制', copied ? 'ok' : 'error');
  }

  async function handleCopyTranscript() {
    if (!result) return;
    const copied = await copyText(result.transcript || '');
    onShowToast(copied ? '视频文本已复制' : '复制失败，请手动选择文本复制', copied ? 'ok' : 'error');
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      const meta = result.video || {
        title: result.podcast?.title || '',
        author: result.podcast?.author || '',
        duration: result.podcast?.duration || 0,
        bvid: result.podcast?.audioUrl || result.podcast?.id || '',
        link: result.podcast?.link || '',
        pic: result.podcast?.cover || '',
      };
      const data = await saveLibrary({
        video: meta,
        summary: result.summary,
        transcript: result.transcript || '',
        subtitle_count: result.subtitle_count,
        mode: result.mode || mode,
        category: category.trim() || '待整理',
        tags: collectTags(),
        notes: notes.trim(),
      });
      setSaved(true);
      onSaved();
      onShowToast(`已保存：${data.item.title}`, 'ok');
    } catch (err: any) {
      onShowToast('保存失败：' + (err.message || ''), 'error');
    } finally {
      setSaving(false);
    }
  }

  // ---- render ------------------------------------------------------------

  if (phase === 'submitting' || phase === 'progress') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-6">
        <div
          className="rounded-2xl p-10 flex flex-col items-center gap-5 max-w-md"
          style={panelStyle}
        >
          <div className="bs-spinner" />
          <div className="text-center">
            <div className="text-base font-semibold" style={{ color: '#0d2d45' }}>
              {progress}
            </div>
            <div className="text-xs mt-2" style={{ color: '#7db8d4' }}>
              视频/播客较长时可能需要数分钟，处理过程会逐步显示进度。
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105"
            style={{
              background: 'rgba(255,255,255,0.6)',
              color: '#5b8fae',
              border: '1px solid rgba(14,165,233,0.18)',
            }}
          >
            <CloseIcon className="w-3 h-3 inline -mt-0.5 mr-1" />
            取消并返回
          </button>
        </div>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-6">
        <div
          className="rounded-2xl p-10 flex flex-col items-center gap-5 max-w-md"
          style={panelStyle}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.30)',
            }}
          >
            <CloseIcon className="w-6 h-6" style={{ color: '#dc2626' }} />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold" style={{ color: '#0d2d45' }}>
              总结失败
            </div>
            <div className="text-sm mt-2" style={{ color: '#b91c1c' }}>
              {error}
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm px-4 py-2 rounded-xl font-semibold transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(14,165,233,0.30)',
            }}
          >
            返回
          </button>
        </div>
      </main>
    );
  }

  if (!result) return null;

  const v = result.video || result.podcast;
  const isPodcast = result.type === 'xiaoyuzhou' || !!result.podcast;
  const isShortVideo = result.type === 'douyin' || result.type === 'xiaohongshu' || result.type === 'wechat';
  const paragraphs = groupTranscript(result.subtitle_segments);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6">
      {/* Header */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 mb-4"
        style={panelStyle}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl transition-all hover:scale-105"
          style={{
            background: 'rgba(255,255,255,0.6)',
            color: '#0369a1',
            border: '1px solid rgba(14,165,233,0.18)',
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回
        </button>
        <span
          className="flex-1 text-sm font-semibold truncate text-center"
          style={{ color: '#0d2d45' }}
          title={v.title}
        >
          {v.title || '视频总结'}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopySummary}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all hover:scale-105"
            style={{
              background: 'rgba(255,255,255,0.6)',
              color: '#0369a1',
              border: '1px solid rgba(14,165,233,0.18)',
            }}
          >
            <Copy className="w-3 h-3" />
            复制总结
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saved || saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold transition-all hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={
              saved
                ? {
                    background: 'rgba(5,150,105,0.10)',
                    color: '#047857',
                    border: '1px solid rgba(5,150,105,0.30)',
                  }
                : {
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                    color: '#fff',
                    boxShadow:
                      '0 4px 12px rgba(14,165,233,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
                  }
            }
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                已收藏
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                {saving ? '保存中…' : '保存'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        {/* Left: video + transcript */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl overflow-hidden" style={panelStyle}>
            <div className="px-4 py-3 grid grid-cols-[60px_1fr] gap-x-3 gap-y-1 text-xs">
              <span style={{ color: '#7db8d4' }}>标题</span>
              <span style={{ color: '#0d2d45', fontWeight: 700 }}>{v.title}</span>
              <span style={{ color: '#7db8d4' }}>{isPodcast ? '主播' : 'UP主'}</span>
              <span style={{ color: '#0d2d45' }}>{v.author}</span>
              {isPodcast && (result.podcast?.podcastName) && (
                <>
                  <span style={{ color: '#7db8d4' }}>播客</span>
                  <span style={{ color: '#0d2d45' }}>{result.podcast.podcastName}</span>
                </>
              )}
              <span style={{ color: '#7db8d4' }}>时长</span>
              <span style={{ color: '#0d2d45' }}>{formatDuration(v.duration)}</span>
              <span style={{ color: '#7db8d4' }}>链接</span>
              <a
                href={v.link}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0284c7', wordBreak: 'break-all' }}
              >
                {v.link}
              </a>
            </div>
            {v.bvid && !isPodcast && !isShortVideo && (
              <div
                className="relative w-full"
                style={{ paddingBottom: '56.25%', background: '#05070d' }}
              >
                <iframe
                  src={`https://player.bilibili.com/player.html?bvid=${v.bvid}&autoplay=0&high_quality=1`}
                  frameBorder={0}
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            )}
            {isPodcast && result.podcast?.cover && (
              <div className="flex flex-col items-center gap-4 p-4" style={{ background: 'linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%)' }}>
                <img
                  src={result.podcast.cover}
                  alt="播客封面"
                  className="w-40 h-40 object-cover rounded-xl shadow-lg"
                />
                {result.podcast.audioUrl && (
                  <audio
                    controls
                    className="w-full max-w-md"
                    style={{ borderRadius: '8px' }}
                    src={`/api/proxy/audio?url=${encodeURIComponent(result.podcast.audioUrl)}`}
                    preload="metadata"
                    crossOrigin="anonymous"
                  />
                )}
              </div>
            )}
            {isShortVideo && result.video?.pic && (
              <div className="flex flex-col items-center gap-4 p-4" style={{ background: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)' }}>
                <img
                  src={result.video.pic}
                  alt="视频封面"
                  className="w-40 h-40 object-cover rounded-xl shadow-lg"
                />
                {result.video.bvid && (
                  <audio
                    controls
                    className="w-full max-w-md"
                    style={{ borderRadius: '8px' }}
                    src={`/api/proxy/audio?url=${encodeURIComponent(result.video.bvid)}`}
                    preload="metadata"
                    crossOrigin="anonymous"
                  />
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-5 flex flex-col gap-3" style={panelStyle}>
            <div
              className="flex items-center justify-between pb-2 border-b"
              style={{ borderColor: 'rgba(14,165,233,0.10)' }}
            >
              <span className="text-sm font-bold" style={{ color: '#0d2d45' }}>
                {isPodcast ? '音频文本' : '视频文本'}
              </span>
              <button
                type="button"
                onClick={handleCopyTranscript}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  color: '#0369a1',
                  border: '1px solid rgba(14,165,233,0.18)',
                }}
              >
                <Copy className="w-3 h-3" />
                复制文本
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto -mr-2 pr-2">
              {!paragraphs.length ? (
                <div
                  className="text-sm text-center py-10"
                  style={{ color: '#7db8d4' }}
                >
                  未获取到视频文本。
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {paragraphs.map((p, idx) => (
                    <div
                      key={idx}
                      className="grid gap-3 py-2 border-b last:border-0"
                      style={{
                        gridTemplateColumns: '88px 1fr',
                        borderColor: '#eef0f4',
                      }}
                    >
                      <span
                        className="text-xs pt-0.5 text-right whitespace-nowrap"
                        style={{
                          color: '#b7791f',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}
                      >
                        {formatTimelineTime(p.from)} - {formatTimelineTime(p.to || p.from)}
                      </span>
                      <span
                        className="text-sm whitespace-pre-wrap"
                        style={{ color: '#263244', lineHeight: 1.7 }}
                      >
                        {p.texts.join('\n')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: AI summary + tags + notes */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl p-5" style={panelStyle}>
            <div
              className="flex items-center justify-between pb-2 mb-3 border-b"
              style={{ borderColor: 'rgba(14,165,233,0.10)' }}
            >
              <span className="text-sm font-bold" style={{ color: '#0d2d45' }}>
                AI 总结
              </span>
            </div>
            <div
              className="summary max-h-[42vh] overflow-y-auto -mr-2 pr-2"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(result.summary) }}
            />
          </div>

          {/* Tags + notes + category */}
          <div className="rounded-2xl p-5 flex flex-col gap-4" style={panelStyle}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs" style={{ color: '#5b8fae' }}>
                  标签
                </label>
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={handleRegenerateTags}
                  className="flex items-center gap-1 text-xs disabled:opacity-50"
                  style={{ color: '#0284c7', fontWeight: 700 }}
                >
                  <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? '生成中…' : '重新生成'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(result.suggested_tags || []).length === 0 ? (
                  <span className="text-xs" style={{ color: '#7db8d4' }}>
                    AI 没给出标签建议，你可以手动填写。
                  </span>
                ) : (
                  (result.suggested_tags || []).map((t) => {
                    const isSel = selectedTags.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className="text-xs px-2 py-0.5 rounded-full transition-colors"
                        style={
                          isSel
                            ? {
                                background: 'rgba(14,165,233,0.15)',
                                color: '#0369a1',
                                border: '1px solid rgba(14,165,233,0.40)',
                                fontWeight: 700,
                              }
                            : {
                                background: 'rgba(255,255,255,0.6)',
                                color: '#5b8fae',
                                border: '1px solid rgba(14,165,233,0.15)',
                              }
                        }
                      >
                        {isSel ? '✓ ' : ''}
                        {t}
                      </button>
                    );
                  })
                )}
              </div>
              <input
                type="text"
                value={extraTags}
                onChange={(e) => setExtraTags(e.target.value)}
                placeholder="自定义标签，用逗号或空格分隔"
                className="w-full text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(14,165,233,0.18)',
                  color: '#0d2d45',
                  borderRadius: '0.625rem',
                  padding: '0.5rem 0.75rem',
                }}
              />
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: '#5b8fae' }}>
                保存分类
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(14,165,233,0.18)',
                  color: '#0d2d45',
                  borderRadius: '0.625rem',
                  padding: '0.5rem 0.75rem',
                }}
              />
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: '#5b8fae' }}>
                我的笔记
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="写下自己的理解、问题或行动项"
                className="w-full text-sm outline-none resize-y"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(14,165,233,0.18)',
                  color: '#0d2d45',
                  borderRadius: '0.625rem',
                  padding: '0.5rem 0.75rem',
                  minHeight: 90,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
