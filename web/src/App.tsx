import { useEffect, useState, useCallback } from 'react';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { Library, FileText, Settings, User } from 'lucide-react';
import { Sidebar, type NavKey } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { GlobalSearch } from './components/GlobalSearch';
import { LoginOverlay } from './components/LoginOverlay';
import { Toast, type ToastState } from './components/Toast';
import { HomePage, type SummaryMode } from './pages/HomePage';
import { ResultPage } from './pages/ResultPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  getMe,
  getConfig,
  logout as apiLogout,
  type AppConfig,
  type CurrentUser,
  type LibraryItem,
} from './lib/api';

type View =
  | { kind: 'home' }
  | { kind: 'result'; url: string; mode: string }
  | { kind: 'library'; openId?: string }
  | { kind: 'settings' };

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
    else if (key === 'settings') setView({ kind: 'settings' });
    else if (key === 'summarizer') setView({ kind: 'summarizer' });
  }

  const navActive: NavKey =
    view.kind === 'library'
      ? 'library'
      : view.kind === 'settings'
        ? 'settings'
        : view.kind === 'summarizer'
          ? 'summarizer'
          : 'home';

  function handleSubmitSummary(url: string, mode: SummaryMode) {
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
  }

  function openLibraryItem(item: LibraryItem) {
    setView({ kind: 'library', openId: item.id });
  }

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // ignore — we'll force a refetch anyway
    }
    setUser(null);
    setView({ kind: 'home' });
    showToast('已退出登录', 'info');
  }

  async function handleLoginSuccess() {
    setLoginOpen(false);
    const [u, c] = await Promise.all([getMe(), getConfig()]);
    setUser(u);
    setConfig(c);
    showToast('登录成功', 'ok');
  }

  return (
    <div
      className="size-full flex flex-col overflow-hidden h-full"
      style={{
        background:
          'linear-gradient(135deg, #c8e8f8 0%, #ddf4ff 40%, #e8f5fe 70%, #cce8f7 100%)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
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
            <HomePage
              config={config}
              isLoggedIn={!!user}
              refreshKey={refreshKey}
              onSubmit={handleSubmitSummary}
              onOpenItem={openLibraryItem}
            />
          )}

          {view.kind === 'result' && (
            <ResultPage
              url={view.url}
              mode={view.mode}
              config={config}
              onBack={() => setView({ kind: 'home' })}
              onSaved={() => setRefreshKey((n) => n + 1)}
              onShowToast={showToast}
              onRequireLogin={() => setLoginOpen(true)}
            />
          )}

          {view.kind === 'library' && (
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
            />
          )}

          {view.kind === 'settings' && (
            <SettingsPage
              isLoggedIn={!!user}
              onConfigSaved={(c) => setConfig(c)}
              onRequireLogin={() => setLoginOpen(true)}
            />
          )}

          <footer className="relative z-10 px-6 py-4 text-center text-xs" style={{ color: '#5b8fae' }}>
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
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 grid grid-cols-4 gap-1 rounded-2xl p-1"
        style={{
          background: 'rgba(255,255,255,0.78)',
          border: '1px solid rgba(14,165,233,0.18)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 8px 30px rgba(14,165,233,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
      >
        {[
          { key: 'home' as NavKey, label: '首页', icon: Library },
          { key: 'library' as NavKey, label: '收藏', icon: FileText },
          { key: 'settings' as NavKey, label: '设置', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          const active = navActive === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navTo(item.key)}
              className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold"
              style={{ color: active ? '#0284c7' : '#5b8fae', background: active ? 'rgba(14,165,233,0.12)' : 'transparent' }}
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
          style={{ color: user ? '#0284c7' : '#5b8fae' }}
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
  );
}
