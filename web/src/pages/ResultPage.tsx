import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  Circle,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Subtitles,
} from 'lucide-react';
import {
  createSummarizeTask,
  subscribeTask,
  saveLibrary,
  checkLibraryByBvid,
  getSimilarItems,
  type SummaryResult,
  type SubtitleSegment,
  type AppConfig,
  type LibraryItem,
  rewriteApi,
  articleApi,
  translateApi,
} from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { formatDuration, formatTimelineTime, markdownToHtml } from '@/lib/format';
import {
  progressToStep,
  plainMarkdown,
  buildChapters,
  parseTranscriptToSegments,
  buildSrt,
  subtitleTimestamp,
  ensureTimedSegments,
  formatSubtitleSegments,
  formattedSubtitleText,
  downloadText,
  extractYouTubeId,
  getPlatformLabel,
  getHost,
} from '@/lib/resultUtils';
import { DownloadModal } from '@/components/modals/DownloadModal';

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
type TabKey = 'summary' | 'subtitles' | 'article';

interface ResultPageProps {
  url: string;
  mode: string;
  config: AppConfig;
  initialResult?: SummaryResult;
  initialSaved?: boolean;
  initialSeek?: number;
  onOpenItem?: (item: LibraryItem) => void;
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

export function ResultPage({ url, mode, config, initialResult, initialSaved, initialSeek, onOpenItem, onBack, onSaved, onShowToast, onRequireLogin }: ResultPageProps) {
  const [phase, setPhase] = useState<Phase>(initialResult ? 'success' : 'submitting');
  const [progress, setProgress] = useState('正在提交任务…');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SummaryResult | null>(initialResult || null);
  const [saved, setSaved] = useState(!!initialSaved);
  const [downloadTarget, setDownloadTarget] = useState<{ kind: 'bilibili' | 'xiaoyuzhou'; bvid?: string; urlOrId?: string; title?: string } | null>(null);
  const [savedItemId, setSavedItemId] = useState(initialResult?.id || '');
  const [similarItems, setSimilarItems] = useState<LibraryItem[]>([]);
  const [runId, setRunId] = useState(0);
  const [reRunKey, setReRunKey] = useState(0);
  const closeRef = useRef<(() => void) | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [article, setArticle] = useState('');
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [rewritePlatform, setRewritePlatform] = useState('小红书');
  const [rewriteText, setRewriteText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState('');
  const [language, setLanguage] = useState('English');
  const [subtitleSearch, setSubtitleSearch] = useState('');
  const [highlightTime, setHighlightTime] = useState<number | null>(null);
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

  // Similar videos (recommendations) for the saved item.
  useEffect(() => {
    if (!savedItemId) { setSimilarItems([]); return; }
    let cancelled = false;
    getSimilarItems(savedItemId)
      .then((d) => { if (!cancelled) setSimilarItems(d.items || []); })
      .catch(() => { if (!cancelled) setSimilarItems([]); });
    return () => { cancelled = true; };
  }, [savedItemId]);

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
  const chapters = useMemo(() => {
    // Prefer LLM-generated chapters (real timestamps); fall back to heuristics.
    if (result?.chapters?.length) {
      return result.chapters.map((c) => ({
        timestamp: formatTimelineTime(c.from),
        from: c.from,
        title: c.title,
        detail: c.detail,
      }));
    }
    return buildChapters(result?.subtitle_segments, result?.summary || '');
  }, [result]);
  const notes = result?.summary || '';
  const subtitles = useMemo(() => {
    if (result?.subtitle_segments?.length) return result.subtitle_segments;
    // Fallback: parse transcript text into segments for display
    if (result?.transcript) {
      return parseTranscriptToSegments(result.transcript);
    }
    return [];
  }, [result]);

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
      chapters: result.chapters || [],
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
    if (data.duplicates?.length) {
      onShowToast('发现相似收藏：' + data.duplicates.map((d) => d.title).join('、'), 'info');
    }
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
        chapters: data.chapters || [],
        mode: data.mode || mode,
        category: config.default_category || '待整理',
        tags: data.suggested_tags || [],
        notes: '',
      });
      setSavedItemId(saved.item.id);
      setSaved(true);
      onSaved();
      onShowToast('已自动保存到收藏库', 'info');
      if (saved.duplicates?.length) {
        onShowToast('发现相似收藏：' + saved.duplicates.map((d) => d.title).join('、'), 'info');
      }
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

  async function handleGenerateArticle() {
    const raw = (result?.transcript || subtitles.map((s) => s.content).join('\n')).trim();
    if (!raw) { onShowToast('没有字幕内容可生成文章', 'info'); return; }
    setGeneratingArticle(true);
    setArticle('');
    try {
      const data = await articleApi({ text: raw });
      setArticle(data.article || '');
    } catch (e: any) {
      onShowToast('生成失败：' + (e?.message || ''), 'error');
    } finally {
      setGeneratingArticle(false);
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
              {chapters.length > 0 && (
                <div className="rounded-lg p-4 space-y-2" style={darkCardStyle}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>章节</div>
                  <div className="space-y-1 max-h-[320px] overflow-y-auto">
                    {chapters.map((ch, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => seekVideo(ch.from)}
                        className="w-full text-left px-2.5 py-1.5 rounded-md transition-colors hover:brightness-110"
                        style={{ color: 'var(--steel)', background: 'var(--surface)' }}
                      >
                        <span className="block font-mono text-xs tabular-nums" style={{ color: muted }}>{ch.timestamp}</span>
                        <span className="block truncate text-xs font-medium" style={{ color: 'var(--ink)' }}>{ch.title}</span>
                        {ch.detail && <span className="block truncate text-[11px]" style={{ color: 'var(--steel)' }}>{ch.detail}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <DarkButton variant="primary" onClick={handleSave} disabled={saved}><Save className="w-4 h-4" />{saved ? '已收藏' : savedItemId ? '更新收藏' : '保存到收藏库'}</DarkButton>

              {onOpenItem && similarItems.length > 0 && (
                <div className="rounded-lg p-4 space-y-1.5" style={darkCardStyle}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>相关视频</div>
                  {similarItems.map((it) => (
                    <button key={it.id} type="button" onClick={() => onOpenItem(it)} className="w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors" style={{ color: 'var(--steel)', background: 'var(--surface)' }}>
                      <span className="block truncate">{it.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="lg:col-span-3 space-y-4">
            <TabBar active={activeTab} onChange={setActiveTab} />
            {activeTab === 'summary' && <SummaryTab notes={notes} copied={copiedNotes} setCopied={setCopiedNotes} rewritePlatform={rewritePlatform} setRewritePlatform={setRewritePlatform} rewriteText={rewriteText} onRewrite={handleRewrite} />}
            {activeTab === 'subtitles' && <SubtitlesTab segments={subtitles} duration={meta?.duration || 0} search={subtitleSearch} setSearch={setSubtitleSearch} highlightTime={highlightTime} language={language} setLanguage={setLanguage} translating={translating} translation={translation} view={subtitleView} setView={setSubtitleView} seek={seekVideo} currentTime={videoCurrentTime} onTranslate={handleTranslate} />}
            {activeTab === 'article' && <ArticleTab article={article} generating={generatingArticle} onGenerate={handleGenerateArticle} />}
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
    ['summary', FileText, '总结'], ['subtitles', Subtitles, '字幕'], ['article', FileText, '文章'],
  ] as const;
  return <div className="grid grid-cols-3 rounded-lg p-1" style={darkSubtleStyle}>{tabs.map(([key, Icon, label]) => <button key={key} onClick={() => onChange(key)} className="flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm" style={{ background: active === key ? `${primary}2e` : 'transparent', color: active === key ? 'var(--ink)' : muted }}><Icon className="w-4 h-4" /><span className="hidden sm:inline">{label}</span></button>)}</div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-lg p-5" style={darkCardStyle}><h3 className="mb-4 text-base font-semibold">{title}</h3>{children}</div>; }

function SummaryTab({ notes, copied, setCopied, rewritePlatform, setRewritePlatform, rewriteText, onRewrite }: any) {
  async function copyNotes() { await copyText(notes); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return <div className="space-y-6"><div className="summary rounded-lg p-4 text-sm" style={{ background: 'var(--surface)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(notes) }} /><div className="mt-4 flex flex-wrap items-center gap-2"><DarkButton onClick={copyNotes}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? '已复制' : '复制笔记'}</DarkButton><DarkButton onClick={() => downloadText('summary.md', notes, 'text/markdown;charset=utf-8')}><Download className="w-4 h-4" />导出 Markdown</DarkButton><div className="ml-auto flex gap-2"><select value={rewritePlatform} onChange={(e) => setRewritePlatform(e.target.value)} className="rounded-lg px-2 py-2 text-sm" style={{ background: 'var(--canvas)', color: fg, border: `1px solid ${border}` }}><option>公众号</option><option>小红书</option><option>微博</option><option>博客</option></select><DarkButton variant="primary" onClick={onRewrite}>改写</DarkButton></div></div>{rewriteText && <div className="mt-4 rounded-lg p-4 text-sm whitespace-pre-wrap" style={darkSubtleStyle}>{rewriteText}</div>}</div>;
}

function ArticleTab({ article, generating, onGenerate }: { article: string; generating: boolean; onGenerate: () => void }) {
  return (
    <Panel title="文章">
      <div className="mb-4 flex flex-wrap gap-2">
        <DarkButton variant="primary" onClick={onGenerate} disabled={generating}>
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? '生成中…' : article ? '重新生成文章' : '生成文章'}
        </DarkButton>
        {article && <DarkButton onClick={() => copyText(article)}><Copy className="w-4 h-4" />复制</DarkButton>}
        {article && <DarkButton onClick={() => downloadText('article.md', article, 'text/markdown;charset=utf-8')}><Download className="w-4 h-4" />导出 Markdown</DarkButton>}
      </div>
      {article ? (
        <div className="summary rounded-lg p-4 text-sm" style={{ background: 'var(--surface)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(article) }} />
      ) : (
        <div className="text-sm py-8 text-center" style={{ color: 'var(--steel)' }}>点击「生成文章」，把视频字幕改写成一篇通顺的文章。</div>
      )}
    </Panel>
  );
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

