import { useEffect, useState, useCallback, useMemo } from 'react';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { Library, FileText, Settings, User, GraduationCap, Sun, Moon } from 'lucide-react';
import { ThemeProvider, useTheme } from './lib/theme';
import { Sidebar, type NavKey } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { GlobalSearch } from './components/GlobalSearch';
import { LoginOverlay } from './components/LoginOverlay';
import { Toast, type ToastState } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage, type SummaryMode } from './pages/HomePage';
import { ResultPage } from './pages/ResultPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { LearningPage } from './pages/LearningPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  getMe,
  getConfig,
  logout as apiLogout,
  type AppConfig,
  type CurrentUser,
  type LibraryItem,
  type SummaryResult,
  type SubtitleSegment,
} from './lib/api';

type View =
  | { kind: 'home' }
  | { kind: 'result'; url: string; mode: string; initialResult?: SummaryResult; initialSaved?: boolean }
  | { kind: 'library'; openId?: string }
  | { kind: 'learning' }
  | { kind: 'admin' }
  | { kind: 'settings' };


function libraryItemToSummaryResult(item: LibraryItem): SummaryResult {
  // Parse stored transcript text into subtitle segments for display.
  // Stored transcripts are plain text (possibly with [MM:SS] or [seconds] markers).
  const transcriptText = item.transcript || '';
  let subtitleSegments: SubtitleSegment[] | undefined;
  if (transcriptText) {
    subtitleSegments = parseTranscriptToSegments(transcriptText);
  }

  return {
    type: item.bvid?.startsWith('http') ? 'xiaoyuzhou' : 'bilibili',
    video: {
      title: item.title,
      author: item.author,
      duration: item.duration || 0,
      bvid: item.bvid || '',
      link: item.link || '',
      pic: item.pic || '',
    },
    summary: item.summary || '',
    transcript: transcriptText,
    subtitle_count: item.subtitle_count || subtitleSegments?.length || 0,
    subtitle_segments: subtitleSegments,
    mode: item.mode || 'brief',
    suggested_tags: item.tags || [],
    transcript_source: 'whisper',
  };
}

/** Parse plain transcript text into timestamped segments for the subtitles tab. */
function parseTranscriptToSegments(text: string): SubtitleSegment[] | undefined {
  // Match lines with optional timestamps like "[12:34]" or "[123.4]" or bare text
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
      // Bare text — estimate 3 seconds per line
      segments.push({ from: timeOffset, to: timeOffset + 3, content: line.trim() });
      timeOffset += 3;
    }
  }

  return segments.length ? segments : undefined;
}

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [config, setConfig] = useState<AppConfig>({});
  const [view, setView] = useState<View>({ kind: 'home' });
  const [loginOpen, setLoginOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [refreshKey, setRefreshKey] = useState(0); // bumps to force HomePage / FavoritesPage to reload

  const showToast = useCallback((msg: string, type: 'ok' | 'error' | 'info') => {
    setToast({ id: Date.now(), msg, type });
  }, []);

  // Initial bootstrap.
  useEffect(() => {
    getMe().then(setUser);
    getConfig().then(setConfig);
  }, []);

  // ⌘K / Ctrl+K opens global search anywhere in the app.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function navTo(key: NavKey) {
    if (key === 'home') setView({ kind: 'home' });
    else if (key === 'library') setView({ kind: 'library' });
    else if (key === 'learning') setView({ kind: 'learning' });
    else if (key === 'admin') setView({ kind: 'admin' });
    else if (key === 'settings') setView({ kind: 'settings' });
  }

  const navActive: NavKey = useMemo(() =>
    view.kind === 'library'
      ? 'library'
      : view.kind === 'learning'
        ? 'learning'
        : view.kind === 'admin'
          ? 'admin'
          : view.kind === 'settings'
            ? 'settings'
            : 'home',
  [view.kind]);

  const handleSubmitSummary = useCallback((url: string, mode: SummaryMode) => {
    if (!user) {
      showToast('请先登录', 'error');
      setLoginOpen(true);
      return;
    }
    if (!config.api_key_set && !config.api_key) {
      showToast('请先在设置中填写 DeepSeek API Key', 'error');
      setView({ kind: 'settings' });
      return;
    }
    setView({ kind: 'result', url, mode });
  }, [user, config.api_key_set, config.api_key, showToast]);

  const openLibraryItem = useCallback((item: LibraryItem) => {
    setView({
      kind: 'result',
      url: item.link || item.bvid || '',
      mode: item.mode || 'brief',
      initialResult: libraryItemToSummaryResult(item),
      initialSaved: true,
    });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore
    }
    setUser(null);
    setView({ kind: 'home' });
    showToast('已退出登录', 'info');
  }, [showToast]);

  const handleLoginSuccess = useCallback(async () => {
    setLoginOpen(false);
    const [u, c] = await Promise.all([getMe(), getConfig()]);
    setUser(u);
    setConfig(c);
    showToast('登录成功', 'ok');
  }, [showToast]);

  return (
    <ThemeProvider>
    <div
      className="size-full flex flex-col overflow-hidden h-full"
      style={{
        background: 'var(--canvas)',
        fontFamily: "var(--font-sans)",
      }}
    >
      <AmbientBackdrop />

      <div className="relative flex flex-1 overflow-hidden">
        <div className="hidden md:block shrink-0">
          <Sidebar
            active={navActive}
            onChange={navTo}
            user={user}
            onUserClick={() => (user ? handleLogout() : setLoginOpen(true))}
          />
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto min-w-0 pb-20 md:pb-0">
          <TopNav
            onNewSummary={() => setView({ kind: 'home' })}
            onOpenSearch={() => setSearchOpen(true)}
            user={user}
            onLogin={() => setLoginOpen(true)}
            onLogout={handleLogout}
          />

          {view.kind === 'home' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <HomePage
                config={config}
                isLoggedIn={!!user}
                refreshKey={refreshKey}
                onSubmit={handleSubmitSummary}
                onOpenItem={openLibraryItem}
              />
            </ErrorBoundary>
          )}

          {view.kind === 'result' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <ResultPage
                url={view.url}
                mode={view.mode}
                config={config}
                initialResult={view.initialResult}
                initialSaved={view.initialSaved}
                onBack={() => setView({ kind: 'home' })}
                onSaved={() => setRefreshKey((n) => n + 1)}
                onShowToast={showToast}
                onRequireLogin={() => setLoginOpen(true)}
              />
            </ErrorBoundary>
          )}

          {view.kind === 'library' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <FavoritesPage
                isLoggedIn={!!user}
                config={config}
                refreshKey={refreshKey}
                bumpRefreshKey={() => setRefreshKey((n) => n + 1)}
                initialOpenId={view.openId}
                onConsumedInitialOpen={() =>
                  setView((v) => (v.kind === 'library' ? { kind: 'library' } : v))
                }
                onShowToast={showToast}
                onOpenItem={openLibraryItem}
              />
            </ErrorBoundary>
          )}

          {view.kind === 'learning' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <LearningPage
                isLoggedIn={!!user}
                onShowToast={showToast}
              />
            </ErrorBoundary>
          )}

          {view.kind === 'admin' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <AdminPage onShowToast={showToast} />
            </ErrorBoundary>
          )}

          {view.kind === 'settings' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <SettingsPage
                isLoggedIn={!!user}
                onConfigSaved={(c) => setConfig(c)}
                onRequireLogin={() => setLoginOpen(true)}
              />
            </ErrorBoundary>
          )}

          <footer className="relative z-10 px-6 py-4 text-center text-xs" style={{ color: 'var(--stone)' }}>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-sky-700"
            >
              粤ICP备2026080744号
            </a>
          </footer>
        </div>
      </div>
      <nav
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 grid grid-cols-4 gap-1 rounded-lg p-1"
        style={{
          background: 'var(--canvas)',
          border: '1px solid var(--hairline)',
        }}
      >
        {[
          { key: 'home' as NavKey, label: '首页', icon: Library },
          { key: 'library' as NavKey, label: '收藏', icon: FileText },
          { key: 'learning' as NavKey, label: '学习', icon: GraduationCap },
          ...(user?.email === '444925817@qq.com' ? [{ key: 'admin' as any, label: '管理', icon: Settings }] : []),
          { key: 'settings' as NavKey, label: '设置', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          const active = navActive === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => item.key === 'admin' ? setView({ kind: 'admin' }) : navTo(item.key)}
              className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold"
              style={{ color: active ? 'var(--ink)' : 'var(--steel)', background: active ? 'var(--surface)' : 'transparent' }}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => (user ? handleLogout() : setLoginOpen(true))}
          className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold"
          style={{ color: user ? 'var(--ink)' : 'var(--steel)' }}
        >
          <User className="w-4 h-4" />
          {user ? '我的' : '登录'}
        </button>
      </nav>

      <LoginOverlay
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={(item) => openLibraryItem(item)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
    </ThemeProvider>
  );
}
