import { useEffect, useState } from 'react';
import { Sparkles, X, Zap, Clock, ChevronRight } from 'lucide-react';
import type { AppConfig, LibraryItem } from '@/lib/api';
import { getLibrary } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { Chip, GlassCard } from '@/components/ui';

const PLATFORMS = [
  {
    name: 'Bilibili',
    color: '#e91e8c',
    bg: 'rgba(233,30,140,0.08)',
    border: 'rgba(233,30,140,0.20)',
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" />
      </svg>
    ),
  },
  {
    name: '小宇宙',
    color: '#ff6b35',
    bg: 'rgba(255,107,53,0.08)',
    border: 'rgba(255,107,53,0.20)',
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5c-.55 0-1-.45-1-1v-5c0-.55.45-1 1-1s1 .45 1 1v5c0 .55-.45 1-1 1zm4 0c-.55 0-1-.45-1-1v-5c0-.55.45-1 1-1s1 .45 1 1v5c0 .55-.45 1-1 1zm-8 0c-.55 0-1-.45-1-1v-5c0-.55.45-1 1-1s1 .45 1 1v5c0 .55-.45 1-1 1z" />
      </svg>
    ),
  },
  {
    name: '小红书',
    color: '#ff2442',
    bg: 'rgba(255,36,66,0.08)',
    border: 'rgba(255,36,66,0.20)',
    enabled: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.16 8.4h-2.64v.96h2.64v.96h-2.64v.96h2.64V14.4c0 .528-.432.96-.96.96h-3.84a.96.96 0 0 1-.96-.96v-3.12H9v-.96h1.44v-.96H9v-.96h1.44V7.44h5.76c.528 0 .96.432.96.96V8.4z" />
      </svg>
    ),
  },
  {
    name: '抖音',
    color: '#1c1c1e',
    bg: 'rgba(28,28,30,0.07)',
    border: 'rgba(28,28,30,0.18)',
    enabled: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
      </svg>
    ),
  },
];

const QUICK_TAGS = [
  { label: '🏄 刷刷热门', sample: 'https://www.bilibili.com/video/BV1Pr4y1z7Yi' },
  { label: '📚 学术论文', sample: 'https://www.bilibili.com/video/BV1uv411q7Mv' },
  { label: '🎙️ 播客摘要', sample: '' },
  { label: '批量总结', sample: '' },
];

interface HomePageProps {
  config: AppConfig;
  isLoggedIn: boolean;
  onSubmit: (url: string, mode: SummaryMode) => void;
  onOpenItem: (item: LibraryItem) => void;
  refreshKey: number;
}

export type SummaryMode = 'brief' | 'detailed' | 'timeline' | 'knowledge';

const SUMMARY_MODES: { value: SummaryMode; label: string }[] = [
  { value: 'brief', label: '简洁总结' },
  { value: 'detailed', label: '详细笔记' },
  { value: 'timeline', label: '时间线' },
  { value: 'knowledge', label: '知识卡片' },
];

export function HomePage({
  config,
  isLoggedIn,
  onSubmit,
  onOpenItem,
  refreshKey,
}: HomePageProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recent, setRecent] = useState<LibraryItem[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<SummaryMode>('brief');

  // Pull the 3 most recent saved summaries to show under the composer.
  // The library API already returns items sorted by created_at desc.
  useEffect(() => {
    if (!isLoggedIn) {
      setRecent([]);
      return;
    }
    let cancelled = false;
    getLibrary({})
      .then((data) => {
        if (!cancelled) setRecent((data.items || []).slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, refreshKey]);

  function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed) {
      setHint('请输入视频或播客链接');
      return;
    }
    setHint(null);
    onSubmit(trimmed, mode);
  }

  return (
    <main
      className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-10 gap-7"
      style={{ justifyContent: 'safe center' }}
    >
      {/* Headline */}
      <div className="text-center space-y-3">
        <img src="/brand-icon.svg" alt="BiliStudy" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1
          className="text-2xl sm:text-4xl tracking-tight"
          style={{ color: 'var(--ink)', fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          <span
            style={{
              background: 'linear-gradient(90deg, var(--ink), var(--brand-green), #06b6d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            BiliStudy
          </span>{' '}
          把视频变成可复习的学习笔记
        </h1>
        <p className="text-base font-medium" style={{ color: 'var(--ink)' }}>
          把每一次观看，沉淀成长期学习。
        </p>
        <p className="text-sm" style={{ color: 'var(--steel)' }}>
          粘贴 B 站视频或小宇宙播客链接，一键生成可复习、可导出的学习笔记
        </p>
      </div>

      {/* Platform badges */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {PLATFORMS.map((p) => (
          <button
            key={p.name}
            type="button"
            disabled={!p.enabled}
            onClick={() => {
              if (!p.enabled) setHint(`${p.name} 接入即将上线，目前仅支持 Bilibili 链接`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200  disabled:hover:scale-100 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, var(--canvas), ${p.bg})`,
              color: p.color,
              border: `1px solid ${p.border}`,
              
            }}
          >
            <span>{p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>

      {/* Main input card */}
      <div className="w-full max-w-3xl">
        <div
          className="relative rounded-lg transition-all duration-300"
          style={{
            background: isFocused ? 'var(--canvas)' : 'var(--canvas)',
            border: `1px solid ${
              isFocused ? 'var(--brand-green)' : 'var(--hairline)'
            }`,
            boxShadow: isFocused
              ? '0 0 0 4px var(--hairline-soft), 0 8px 40px var(--hairline), inset 0 1px 0 rgba(255,255,255,0.9)'
              : '0 4px 24px rgba(55,114,207,0.15), inset 0 1px 0 rgba(255,255,255,0.9)',
            
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div
              className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
              style={{
                background: isFocused
                  ? 'linear-gradient(135deg, var(--hairline), rgba(56,189,248,0.15))'
                  : 'var(--surface)',
                border: '1px solid var(--hairline)',
              }}
            >
              <Sparkles
                className="w-4 h-4 transition-colors"
                style={{ color: isFocused ? 'var(--ink)' : 'var(--stone)' }}
              />
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="快速体验：粘贴 B 站视频或小宇宙播客链接..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--ink)', caretColor: 'var(--primary)' }}
            />

            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 opacity-40 hover:opacity-70 transition-opacity"
                title="清空"
              >
                <X className="w-4 h-4" style={{ color: 'var(--ink)' }} />
              </button>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200  "
              style={{
                background: 'var(--primary)',
                color: 'var(--on-primary)',
              }}
            >
              <Zap className="w-4 h-4" />
              一键总结
            </button>
          </div>
        </div>

        {hint && (
          <div
            className="mt-2 px-3 py-2 rounded-md text-xs"
            style={{
              background: 'rgba(255,237,213,0.7)',
              border: '1px solid rgba(251,146,60,0.35)',
              color: '#9a3412',
              
            }}
          >
            {hint}
          </div>
        )}

        {/* Quick tags */}
        <div className="flex items-center gap-2 mt-3 px-1 flex-wrap">
          <span style={{ color: 'var(--stone)', fontSize: 12 }}>快捷：</span>
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={() => {
                if (tag.sample) {
                  setQuery(tag.sample);
                } else {
                  setHint(
                    tag.label === '批量总结'
                      ? '一行一个链接，按 Enter 顺序提交即可。批量队列后续上线。'
                      : '该入口暂未上线，先用粘贴链接的方式总结一个吧。',
                  );
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all duration-150 "
              style={{
                background: 'var(--canvas)',
                color: 'var(--steel)',
                border: '1px solid var(--hairline)',
              }}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* Summary mode picker */}
        <div className="flex items-center gap-2 mt-2 px-1 flex-wrap">
          <span style={{ color: 'var(--stone)', fontSize: 12 }}>模式：</span>
          {SUMMARY_MODES.map((m) => {
            const active = m.value === mode;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className="px-2.5 py-1 rounded-lg text-xs transition-all duration-150 "
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(135deg, var(--hairline), rgba(56,189,248,0.14))',
                        color: 'var(--brand-tag)',
                        border: '1px solid var(--primary)',
                        fontWeight: 700,
                        boxShadow:
                          'inset 0 1px 0 var(--canvas), 0 2px 8px var(--hairline-soft)',
                      }
                    : {
                        background: 'var(--canvas)',
                        color: 'var(--steel)',
                        border: '1px solid var(--hairline)',
                      }
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent summaries */}
      {recent.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--stone)' }} />
            <span style={{ color: 'var(--stone)', fontSize: 12 }}>最近总结</span>
          </div>
          <div className="flex flex-col gap-2">
            {recent.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenItem(s)}
                className="flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer transition-all duration-200 group text-left"
                style={{
                  background: 'var(--canvas)',
                  border: '1px solid var(--hairline-soft)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--canvas)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    'var(--hairline)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    '0 4px 16px rgba(55,114,207,0.15), inset 0 1px 0 rgba(255,255,255,0.9)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--canvas)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    'var(--hairline-soft)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    'inset 0 1px 0 rgba(255,255,255,0.8)';
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: '#e91e8c' }}
                />
                <span
                  className="flex-1 text-sm truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {s.title}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background: 'rgba(55,114,207,0.15)',
                    color: 'var(--brand-tag)',
                    border: '1px solid var(--hairline)',
                  }}
                >
                  {s.category || 'B站'}
                </span>
                <span className="text-xs shrink-0" style={{ color: 'var(--stone)' }}>
                  {relativeTime(s.created_at)}
                </span>
                <ChevronRight
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity"
                  style={{ color: 'var(--primary)' }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
