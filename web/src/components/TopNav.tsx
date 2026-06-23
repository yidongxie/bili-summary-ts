import { Plus, Search, User, LogOut } from 'lucide-react';
import type { CurrentUser } from '@/lib/api';

interface TopNavProps {
  onNewSummary: () => void;
  onOpenSearch: () => void;
  user: CurrentUser | null;
  onLogin: () => void;
  onLogout: () => void;
}

export function TopNav({ onNewSummary, onOpenSearch, user, onLogin, onLogout }: TopNavProps) {
  return (
    <nav
      className="flex items-center px-6 py-3 border-b shrink-0"
      style={{
        background: 'rgba(255,255,255,0.40)',
        backdropFilter: 'blur(20px)',
        borderColor: 'rgba(14,165,233,0.12)',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.6), 0 2px 16px rgba(14,165,233,0.06)',
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewSummary}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm cursor-pointer transition-all duration-150 hover:bg-white/40"
          style={{ color: '#0d2d45' }}
        >
          <Plus className="w-4 h-4" style={{ color: '#0ea5e9' }} />
          <span className="font-semibold">新总结</span>
        </button>
        <div className="w-px h-4" style={{ background: 'rgba(14,165,233,0.2)' }} />
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm cursor-pointer transition-all duration-150 hover:bg-white/40"
          style={{ color: '#5b8fae' }}
        >
          <Search className="w-3.5 h-3.5" />
          <span>全局搜索</span>
          <span
            className="px-1.5 py-0.5 rounded-lg text-[10px] font-mono"
            style={{ background: 'rgba(14,165,233,0.10)', color: '#0ea5e9' }}
          >
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex-1" />

      {user ? (
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold px-3 py-1 rounded-xl"
            style={{ color: '#0369a1', background: 'rgba(255,255,255,0.55)' }}
          >
            {user.display_name || user.email}
          </span>
          <button
            type="button"
            onClick={onLogout}
            title="退出登录"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.80), rgba(186,230,255,0.60))',
              color: '#0369a1',
              border: '1px solid rgba(14,165,233,0.25)',
              boxShadow:
                '0 2px 12px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            退出
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onLogin}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.80), rgba(186,230,255,0.60))',
            color: '#0369a1',
            border: '1px solid rgba(14,165,233,0.25)',
            boxShadow:
              '0 2px 12px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          <User className="w-3.5 h-3.5" />
          注册 / 登录
        </button>
      )}
    </nav>
  );
}
