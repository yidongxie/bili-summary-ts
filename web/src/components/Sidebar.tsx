import { Library, FileText, Settings, User, Zap, GraduationCap } from 'lucide-react';
import type { CurrentUser } from '@/lib/api';
import { LogoMark } from './AmbientBackdrop';

export type NavKey = 'home' | 'library' | 'learning' | 'admin' | 'settings';

const ADMIN_EMAIL = '444925817@qq.com';

const BASE_ITEMS: Array<{ key: NavKey; icon: typeof Library; label: string; sub?: string }> = [
  { key: 'home', icon: Library, label: '知', sub: '总结' },
  { key: 'library', icon: FileText, label: '行', sub: '收藏' },
  { key: 'learning', icon: GraduationCap, label: '学', sub: '复习' },
  { key: 'settings', icon: Settings, label: '设置' },
];

interface SidebarProps {
  active: NavKey;
  onChange: (key: NavKey) => void;
  user: CurrentUser | null;
  onUserClick: () => void;
}

export function Sidebar({ active, onChange, user, onUserClick }: SidebarProps) {
  const isAdmin = (user?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
  const items = isAdmin
    ? [
        ...BASE_ITEMS.slice(0, 3),
        { key: 'admin' as NavKey, icon: Settings, label: '管理', sub: '后台' },
        BASE_ITEMS[3],
      ]
    : BASE_ITEMS;
  return (
    <aside
      className="flex flex-col items-center py-5 gap-1 border-r shrink-0"
      style={{
        width: 100,
        background: 'rgba(255,255,255,0.35)',
        backdropFilter: 'blur(20px)',
        borderColor: 'rgba(14,165,233,0.15)',
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.6)',
      }}
    >
      <button
        type="button"
        className="mb-4 flex flex-col items-center"
        onClick={() => onChange('home')}
        title="BiliStudy"
      >
        <LogoMark />
      </button>

      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="flex flex-col items-center gap-1.5 w-20 py-3 rounded-2xl transition-all duration-200"
            style={{
              background: isActive ? 'rgba(14,165,233,0.15)' : 'transparent',
              boxShadow: isActive
                ? 'inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 8px rgba(14,165,233,0.10)'
                : 'none',
            }}
          >
            <Icon
              className="w-6 h-6 transition-colors"
              style={{
                color: isActive ? 'var(--sidebar-primary)' : 'var(--muted-foreground)',
              }}
            />
            <span
              className="text-sm font-semibold leading-tight"
              style={{
                color: isActive ? 'var(--sidebar-primary)' : 'var(--muted-foreground)',
              }}
            >
              {item.label}
            </span>
            {item.sub && (
              <span
                className="text-xs leading-tight"
                style={{
                  color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                  opacity: 0.8,
                }}
              >
                {item.sub}
              </span>
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onUserClick}
        className="w-9 h-9 rounded-full flex items-center justify-center"
        title={user ? user.display_name || user.email : '登录'}
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(186,230,255,0.5))',
          border: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(14,165,233,0.12)',
        }}
      >
        {user ? (
          <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 12 }}>
            {(user.display_name || user.email).slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <User className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        )}
      </button>
    </aside>
  );
}

// Re-export for convenience
export { Zap };
