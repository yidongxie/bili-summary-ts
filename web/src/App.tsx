import { useEffect, useState, useCallback, useMemo } from 'react';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { Library, FileText, Settings, User, GraduationCap, MessageCircle } from 'lucide-react';
import { ThemeProvider } from './lib/theme';
import { Sidebar, type NavKey } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { GlobalSearch } from './components/GlobalSearch';
import { LoginOverlay } from './components/LoginOverlay';
import { Toast, type ToastState } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage, type SummaryMode } from './pages/HomePage';
import { ResultPage } from './pages/ResultPage';
import { AskPage } from './pages/AskPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { LearningPage } from './pages/LearningPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  getMe,
  getConfig,
  getLibraryItem,
  logout as apiLogout,
  type AppConfig,
  type CurrentUser,
  type LibraryItem,
  type SummaryResult,
  type SubtitleSegment,
  type AskCitation,
} from './lib/api';

type View =
  | { kind: 'home' }
  | { kind: 'result'; url: string; mode: string; initialResult?: SummaryResult; initialSaved?: boolean; seekTo?: number }
  | { kind: 'library'; openId?: string }
  | { kind: 'ask' }
  | { kind: 'learning' }
  | { kind: 'admin' }
  | { kind: 'settings' };

/** Serialize a navigable view to a URL hash. Transient views (result) map to null. */
function viewToHash(view: View): string | null {
  switch (view.kind) {
    case 'home': return '#/';
    case 'library': return view.openId ? '#/item/' + encodeURIComponent(view.openId) : '#/library';
    case 'ask': return '#/ask';
    case 'learning': return '#/learning';
    case 'admin': return '#/admin';
    case 'settings': return '#/settings';
    case 'result': return null;
  }
}

/** Parse a URL hash back into a view (used on load + hashchange for back/forward). */
function hashToView(hash: string): View | null {
  const path = (hash || '').replace(/^#/, '').split('?')[0];
  const itemMatch = path.match(/^\/item\/(.+)$/);
  if (itemMatch) return { kind: 'library', openId: decodeURIComponent(itemMatch[1]) };
  switch (path) {
    case '': case '/': return { kind: 'home' };
    case '/library': return { kind: 'library' };
    case '/ask': return { kind: 'ask' };
    case '/learning': return { kind: 'learning' };
    case '/admin': return { kind: 'admin' };
    case '/settings': return { kind: 'settings' };
    default: return null;
  }
}

function libraryItemToSummaryResult(item: LibraryItem): SummaryResult {
  // Prefer the real subtitle segments persisted at save time; fall back to
  // parsing the stored transcript (plain text) into estimated timestamps.
  const transcriptText = item.transcript || '';
  let subtitleSegments: SubtitleSegment[] | undefined;
  if (item.subtitle_segments?.length) {
    subtitleSegments = item.subtitle_segments;
  } else if (transcriptText) {
    subtitleSegments = parseTranscriptToSegments(transcriptText);
  }

  return {
    id: item.id,
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
  const [view, setView] = useState<View>(() => hashToView(window.location.hash) || { kind: 'home' });
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

  // Keep the URL hash in sync with the current view so refresh / back / forward
  // work for the main pages (result is transient and intentionally not persisted).
  useEffect(() => {
    const h = viewToHash(view);
    if (h == null) return;
    if (window.location.hash !== h) {
      if (!window.location.hash) window.history.replaceState(null, '', h);
      else window.location.hash = h;
    }
  }, [view]);

  useEffect(() => {
    const onHash = () => {
      const v = hashToView(window.location.hash);
      if (v) setView(v);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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
    else if (key === 'ask') setView({ kind: 'ask' });
    else if (key === 'learning') setView({ kind: 'learning' });
    else if (key === 'admin') setView({ kind: 'admin' });
    else if (key === 'settings') setView({ kind: 'settings' });
  }

  const navActive: NavKey = useMemo(() =>
    view.kind === 'library'
      ? 'library'
      : view.kind === 'ask'
        ? 'ask'
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

  const openLibraryItem = useCallback((item: LibraryItem, seekTo?: number) => {
    setView({
      kind: 'result',
      url: item.link || item.bvid || '',
      mode: item.mode || 'brief',
      initialResult: libraryItemToSummaryResult(item),
      initialSaved: true,
      seekTo,
    });
  }, []);

  const handleOpenCitation = useCallback(async (c: AskCitation) => {
    try {
      const data = await getLibraryItem(c.itemId);
      if (data?.item) openLibraryItem(data.item, c.time);
    } catch {
      // ignore — user can still find it in the library
    }
  }, [openLibraryItem]);

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
                isLoggedIn={!!user}
                refreshKey={refreshKey}
                onSubmit={handleSubmitSummary}
                onOpenItem={openLibraryItem}
                onShowToast={showToast}
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
                initialSeek={view.seekTo}
                onOpenItem={openLibraryItem}
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

          {view.kind === 'ask' && (
            <ErrorBoundary onReset={() => setView({ kind: 'home' })}>
              <AskPage
                onOpenCitation={handleOpenCitation}
                onShowToast={showToast}
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
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 grid grid-cols-5 gap-1 rounded-lg p-1"
        style={{
          background: 'var(--canvas)',
          border: '1px solid var(--hairline)',
        }}
      >
        {[
          { key: 'home' as NavKey, label: '首页', icon: Library },
          { key: 'library' as NavKey, label: '收藏', icon: FileText },
          { key: 'ask' as NavKey, label: '问库', icon: MessageCircle },
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
