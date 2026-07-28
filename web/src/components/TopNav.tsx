import React from 'react';
import { Plus, Search, User, LogOut } from 'lucide-react';
import type { CurrentUser } from '@/lib/api';

interface TopNavProps {
  onNewSummary: () => void;
  onOpenSearch: () => void;
  user: CurrentUser | null;
  onLogin: () => void;
  onLogout: () => void;
}

export const TopNav = React.memo(function TopNav({ onNewSummary, onOpenSearch, user, onLogin, onLogout }: TopNavProps) {
  return (
    <nav
      className="flex items-center px-3 sm:px-6 py-3 border-b shrink-0"
      style={{ background: 'var(--canvas)', borderColor: 'var(--hairline)' }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNewSummary}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors"
          style={{ color: 'var(--ink)', border: '1px solid var(--hairline)', background: 'transparent' }}
        >
          <Plus className="w-4 h-4" style={{ color: 'var(--ink)' }} />
          <span className="font-medium hidden sm:inline">新总结</span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors"
          style={{ color: 'var(--steel)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">全局搜索</span>
          <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-mono" style={{ background: 'var(--canvas)', color: 'var(--stone)', border: '1px solid var(--hairline)' }}>
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex-1" />

      {user ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
            <span className="hidden sm:inline">{user.display_name || user.email}</span>
            <span className="sm:hidden">{(user.display_name || user.email).slice(0, 1).toUpperCase()}</span>
          </span>
          <button type="button" onClick={onLogout} title="退出登录" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors" style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--hairline)' }}>
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">退出</span>
          </button>
        </div>
      ) : (
        <button type="button" onClick={onLogin} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors" style={{ background: 'var(--primary)', color: 'var(--on-primary)', border: '1px solid var(--primary)' }}>
          <User className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">注册 / 登录</span>
          <span className="sm:hidden">登录</span>
        </button>
      )}
    </nav>
  );
});
