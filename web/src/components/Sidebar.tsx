import { Library, FileText, Settings, User, Zap, GraduationCap } from 'lucide-react';
import type { CurrentUser } from '@/lib/api';
import { LogoMark } from './AmbientBackdrop';

export type NavKey = 'home' | 'library' | 'learning' | 'admin' | 'settings';

const ADMIN_EMAIL = '444925817@qq.com';

const BASE_ITEMS: Array<{ key: NavKey; icon: typeof Library; label: string; sub?: string }> = [
  { key: 'home', icon: Library, label: '总结', sub: 'Home' },
  { key: 'library', icon: FileText, label: '收藏库', sub: 'Library' },
  { key: 'learning', icon: GraduationCap, label: '学习中心', sub: 'Learn' },
  { key: 'settings', icon: Settings, label: '设置', sub: 'Settings' },
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
        { key: 'admin' as NavKey, icon: Settings, label: '管理后台', sub: 'Admin' },
        BASE_ITEMS[3],
      ]
    : BASE_ITEMS;
  return (
    <aside
      className="flex flex-col py-5 px-3 gap-1 border-r shrink-0"
      style={{
        width: 224,
        background: 'var(--canvas)',
        borderColor: 'var(--hairline)',
      }}
    >
      <button
        type="button"
        className="mb-5 flex items-center gap-3 px-2 text-left"
        onClick={() => onChange('home')}
        title="BiliStudy"
      >
        <LogoMark size={38} />
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>BiliStudy</div>
          <div className="text-xs font-mono" style={{ color: 'var(--stone)' }}>AI learning docs</div>
        </div>
      </button>

      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="relative flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors duration-150 text-left"
            style={{
              background: isActive ? 'var(--surface)' : 'transparent',
              border: `1px solid ${isActive ? 'var(--hairline)' : 'transparent'}`,
            }}
          >
            {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ background: 'var(--brand-green)' }} />}
            <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? 'var(--ink)' : 'var(--steel)' }} />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight" style={{ color: isActive ? 'var(--ink)' : 'var(--steel)' }}>{item.label}</span>
              {item.sub && <span className="block text-[11px] font-mono leading-tight" style={{ color: 'var(--stone)' }}>{item.sub}</span>}
            </span>
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onUserClick}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-left"
        title={user ? user.display_name || user.email : '登录'}
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}>
          {user ? <span className="text-xs font-semibold">{(user.display_name || user.email).slice(0, 1).toUpperCase()}</span> : <User className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>{user ? user.display_name || user.email : '注册 / 登录'}</div>
          <div className="text-[11px]" style={{ color: 'var(--stone)' }}>{user ? '点击退出' : '点击登录'}</div>
        </div>
      </button>
    </aside>
  );
}

export { Zap };
