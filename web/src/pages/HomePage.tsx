import { useEffect, useState } from 'react';
import { Sparkles, X, Zap, Download, Clock, ChevronRight, Users } from 'lucide-react';
import type { LibraryItem } from '@/lib/api';
import { getLibrary, downloadBiliVideo, downloadXiaoyuzhou, listUploaderVideos } from '@/lib/api';
import { relativeTime } from '@/lib/format';

const PLATFORMS = [
  {
    name: 'Bilibili',
    color: '#e91e8c',
    bg: 'rgba(233,30,140,0.08)',
    border: 'rgba(233,30,140,0.22)',
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" />
      </svg>
    ),
  },
  {
    name: '小宇宙', color: '#ff6b35', bg: 'rgba(255,107,53,0.08)', border: 'rgba(255,107,53,0.22)', enabled: true,
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5c-.55 0-1-.45-1-1v-5c0-.55.45-1 1-1s1 .45 1 1v5c0 .55-.45 1-1 1zm4 0c-.55 0-1-.45-1-1v-5c0-.55.45-1 1-1s1 .45 1 1v5c0 .55-.45 1-1 1zm-8 0c-.55 0-1-.45-1-1v-5c0-.55.45-1 1-1s1 .45 1 1v5c0 .55-.45 1-1 1z" /></svg>,
  },
  {
    name: '小红书', color: '#ff2442', bg: 'rgba(255,36,66,0.08)', border: 'rgba(255,36,66,0.22)', enabled: false,
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.16 8.4h-2.64v.96h2.64v.96h-2.64v.96h2.64V14.4c0 .528-.432.96-.96.96h-3.84a.96.96 0 0 1-.96-.96v-3.12H9v-.96h1.44v-.96H9v-.96h1.44V7.44h5.76c.528 0 .96.432.96.96V8.4z" /></svg>,
  },
  {
    name: '抖音', color: '#1c1c1e', bg: 'rgba(28,28,30,0.07)', border: 'rgba(28,28,30,0.18)', enabled: false,
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" /></svg>,
  },
];

const QUICK_TAGS = [
  { label: '🏄 刷刷热门', sample: 'https://www.bilibili.com/video/BV1Pr4y1z7Yi' },
  { label: '📚 学术论文', sample: 'https://www.bilibili.com/video/BV1uv411q7Mv' },
  { label: '🎙️ 播客摘要', sample: '' },
  { label: '批量总结', sample: '' },
];

interface HomePageProps {
  isLoggedIn: boolean;
  onSubmit: (url: string, mode: SummaryMode) => void;
  onOpenItem: (item: LibraryItem) => void;
  refreshKey: number;
  onShowToast: (msg: string, type: 'ok' | 'error' | 'info') => void;
}

export type SummaryMode = 'brief' | 'detailed' | 'timeline' | 'knowledge';

const SUMMARY_MODES: { value: SummaryMode; label: string }[] = [
  { value: 'brief', label: '简洁' },
  { value: 'detailed', label: '详细' },
  { value: 'timeline', label: '时间线' },
  { value: 'knowledge', label: '卡片' },
];

export function HomePage({ isLoggedIn, onSubmit, onOpenItem, refreshKey, onShowToast }: HomePageProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recent, setRecent] = useState<LibraryItem[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<SummaryMode>('brief');
  const [uploaderLoading, setUploaderLoading] = useState(false);
  const [uploaderError, setUploaderError] = useState<string | null>(null);
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderVideos, setUploaderVideos] = useState<Array<{ title: string; bvid: string; duration?: number }>>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { setRecent([]); return; }
    let cancelled = false;
    getLibrary({}).then((data) => {
      if (!cancelled) setRecent((data.items || []).slice(0, 4));
    }).catch(() => { if (!cancelled) setRecent([]); });
    return () => { cancelled = true; };
  }, [isLoggedIn, refreshKey]);

  function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed) { setHint('请输入视频或播客链接'); return; }
    setHint(null);
    onSubmit(trimmed, mode);
  }

  async function handleDownload() {
    const trimmed = query.trim();
    if (!trimmed) { setHint('请输入 B 站视频链接'); return; }
    if (!isLoggedIn) { setHint('请先登录后下载视频'); return; }
    setHint(null);
    const isBili = /BV[a-zA-Z0-9]{10,}/.test(trimmed) || /bilibili\.com|b23\.tv/i.test(trimmed);
    const isXyz = /xiaoyuzhoufm|xiaoyuzhou\.fm|xyz\.fm/i.test(trimmed);
    if (!isBili && !isXyz) { setHint('仅支持 B 站视频链接或 BV 号'); return; }
    try {
      setHint(isBili ? '正在下载视频…' : '正在下载音频…');
      if (isBili) await downloadBiliVideo(trimmed);
      else await downloadXiaoyuzhou(trimmed);
      setHint(null);
      onShowToast('下载完成', 'ok');
    } catch (err: any) {
      setHint('下载失败：' + (err.message || ''));
      onShowToast('下载失败：' + (err.message || ''), 'error');
    }
  }

  async function handleFetchUploader() {
    const trimmed = query.trim();
    if (!trimmed) { setHint('请输入博主空间链接'); return; }
    if (!isLoggedIn) { setHint('请先登录后使用批量下载'); return; }
    const uidMatch = trimmed.match(/(?:space\.bilibili\.com\/)(\d+)/);
    if (!uidMatch && !/space\.bilibili\.com/i.test(trimmed)) {
      setHint('请输入博主空间链接（如 https://space.bilibili.com/123456）');
      return;
    }
    setHint(null);
    setUploaderLoading(true);
    setUploaderError(null);
    try {
      const data = await listUploaderVideos(trimmed);
      if (!data.success || !data.videos?.length) throw new Error(data.error || '未获取到视频');
      setUploaderName(data.uploader || '');
      setUploaderVideos(data.videos);
      setSelectedVideos(new Set(data.videos.map((v) => v.bvid)));
    } catch (err: any) {
      setUploaderError(err.message || '获取失败');
      setUploaderVideos([]);
    } finally {
      setUploaderLoading(false);
    }
  }

  async function handleBatchDownload() {
    const targets = uploaderVideos.filter((v) => selectedVideos.has(v.bvid));
    if (!targets.length) return;
    setBatchDownloading(true);
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      const v = targets[i];
      setBatchProgress('正在下载 ' + (i + 1) + '/' + targets.length + '：' + v.title);
      try {
        await downloadBiliVideo(v.bvid);
        ok++;
      } catch (err: any) {
        onShowToast('下载失败（' + v.title + '）：' + (err.message || ''), 'error');
      }
    }
    setBatchDownloading(false);
    setBatchProgress('');
    onShowToast('批量下载完成：成功 ' + ok + '/' + targets.length, ok === targets.length ? 'ok' : 'info');
  }

  return (
    <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12 gap-8" style={{ justifyContent: 'safe center' }}>
      {/* Brand */}
      <div className="text-center space-y-3 max-w-xl">
        <img src="/brand-icon.svg" alt="BiliStudy" className="mx-auto h-16 w-16 rounded-xl" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}>
          把视频变成
          <span style={{ background: 'linear-gradient(135deg, var(--brand-green), #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>可复习的学习笔记</span>
        </h1>
        <p className="text-sm" style={{ color: 'var(--steel)', lineHeight: 1.6 }}>
          粘贴 B 站视频或小宇宙播客链接，AI 自动转写 + 结构化总结，支持导出 Markdown / PDF / Obsidian
        </p>
      </div>

      {/* Platform badges */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {PLATFORMS.map((p) => (
          <button
            key={p.name}
            type="button"
            disabled={!p.enabled}
            onClick={() => { if (!p.enabled) setHint(`${p.name} 接入即将上线，目前仅支持 Bilibili 链接`); }}
            className="platform-btn"
            style={{ color: p.color, background: p.bg, border: `1px solid ${p.border}` }}
          >
            <span>{p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>

      {/* Main composer */}
      <div className="w-full max-w-2xl">
        <div className="input-glow" style={isFocused ? { borderColor: 'var(--brand-green)', boxShadow: '0 0 0 4px rgba(0,212,164,0.12), 0 4px 24px rgba(55,114,207,0.12)' } : undefined}>
          <div className="flex items-center gap-3 px-5 py-3">
            <Sparkles className="w-5 h-5 shrink-0 transition-colors" style={{ color: isFocused ? 'var(--brand-green)' : 'var(--muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder="粘贴 B 站视频或小宇宙播客链接..."
              className="flex-1 bg-transparent outline-none text-[15px]"
              style={{ color: 'var(--ink)' }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="shrink-0 opacity-40 hover:opacity-70 transition-opacity">
                <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
              </button>
            )}
            <button type="button" onClick={handleDownload} className="btn-secondary shrink-0 flex items-center gap-2">
              <Download className="w-4 h-4" /> 一键下载
            </button>
            <button type="button" onClick={handleSubmit} className="btn-primary shrink-0 flex items-center gap-2">
              <Zap className="w-4 h-4" /> 一键总结
            </button>
            <button type="button" onClick={handleFetchUploader} className="btn-secondary shrink-0 flex items-center gap-2">
              <Users className="w-4 h-4" /> 博主合集
            </button>
          </div>
        </div>

        {hint && (
          <div className="mt-3 px-4 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.28)', color: '#b45309' }}>
            {hint}
          </div>
        )}

        {/* Quick tags */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="section-label">快捷</span>
          {QUICK_TAGS.map((tag) => (
            <button key={tag.label} type="button" onClick={() => { if (tag.sample) { setQuery(tag.sample); } else { setHint(tag.label === '批量总结' ? '一行一个链接，按 Enter 顺序提交。批量队列后续上线。' : '该入口暂未上线，先用粘贴链接的方式总结一个吧。'); } }}
              className="btn-secondary text-xs px-3 py-1.5">
              {tag.label}
            </button>
          ))}
        </div>

        {/* Mode picker */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="section-label">模式</span>
          {SUMMARY_MODES.map((m) => (
            <button key={m.value} type="button" onClick={() => setMode(m.value)} className={`mode-chip${m.value === mode ? ' active' : ''}`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Uploader batch download */}
        {(uploaderLoading || uploaderError || uploaderVideos.length > 0) && (
          <div className="mt-3 rounded-lg p-4" style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)' }}>
            {uploaderLoading && (
              <div className="text-xs" style={{ color: 'var(--steel)' }}>正在获取博主视频列表…</div>
            )}
            {uploaderError && (
              <div className="text-xs" style={{ color: 'var(--brand-error)' }}>{uploaderError}</div>
            )}
            {!uploaderLoading && !uploaderError && uploaderVideos.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {uploaderName ? `${uploaderName} 的视频` : '博主视频'}（共 {uploaderVideos.length} 个）
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--steel)' }}>已选 {selectedVideos.size}</span>
                    <button type="button" onClick={() => setSelectedVideos(new Set(uploaderVideos.map((v) => v.bvid)))} className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: 'var(--brand-tag)', background: 'rgba(55,114,207,0.10)', border: '1px solid rgba(55,114,207,0.22)' }}>全选</button>
                    <button type="button" onClick={() => setSelectedVideos(new Set())} className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: 'var(--steel)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>清空</button>
                    <button
                      type="button"
                      onClick={handleBatchDownload}
                      disabled={batchDownloading}
                      className="text-xs px-3 py-1.5 rounded-full font-semibold"
                      style={{ background: 'var(--primary)', color: 'var(--on-primary)', opacity: batchDownloading ? 0.6 : 1 }}
                    >
                      {batchDownloading ? (batchProgress || '下载中…') : '下载所选（' + selectedVideos.size + '）'}
                    </button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: 'var(--hairline-soft)' }}>
                  {uploaderVideos.map((v, idx) => (
                    <label key={v.bvid} className="flex items-start gap-2 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedVideos.has(v.bvid)}
                        onChange={(e) => {
                          setSelectedVideos((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(v.bvid); else next.delete(v.bvid);
                            return next;
                          });
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1 text-xs leading-snug" style={{ color: 'var(--ink)' }}>
                        <span className="mr-1.5 opacity-50">{idx + 1}.</span>{v.title}
                      </span>
                      {v.duration ? (
                        <span className="text-[11px] shrink-0 font-mono" style={{ color: 'var(--muted)' }}>
                          {Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, '0')}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Recent summaries */}
      {recent.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <span className="section-label">最近总结</span>
          </div>
          <div className="flex flex-col gap-2">
            {recent.map((s) => (
              <button key={s.id} type="button" onClick={() => onOpenItem(s)} className="recent-item text-left">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#e91e8c' }} />
                <span className="flex-1 text-sm truncate font-medium" style={{ color: 'var(--ink)' }}>{s.title}</span>
                <span className="tag-pill shrink-0">{s.category || 'B站'}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{relativeTime(s.created_at)}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" style={{ color: 'var(--steel)' }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
