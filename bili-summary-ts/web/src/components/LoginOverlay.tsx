import { useState } from 'react';
import { X as CloseIcon } from 'lucide-react';
import { LogoMark } from './AmbientBackdrop';
import { login as apiLogin, register as apiRegister } from '@/lib/api';

interface LoginOverlayProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const overlayCard = {
  background: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(14,165,233,0.25)',
  boxShadow:
    '0 24px 64px rgba(14,165,233,0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
  backdropFilter: 'blur(24px)',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(14,165,233,0.18)',
  color: '#0d2d45',
  borderRadius: '0.75rem',
  padding: '0.6rem 0.85rem',
  fontSize: 14,
  width: '100%',
  outline: 'none',
};

export function LoginOverlay({ open, onClose, onSuccess }: LoginOverlayProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    setSubmitting(true);
    try {
      const data =
        mode === 'login'
          ? await apiLogin(email, password)
          : await apiRegister(email, password, displayName.trim() || undefined);
      if (!data.success) throw new Error(data.error || (mode === 'login' ? '登录失败' : '注册失败'));
      onSuccess();
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(13,45,69,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-7"
        onClick={(e) => e.stopPropagation()}
        style={overlayCard}
      >
        <div className="flex justify-end -mt-2 -mr-2">
          <button
            type="button"
            onClick={onClose}
            className="opacity-50 hover:opacity-100"
            title="关闭"
          >
            <CloseIcon className="w-4 h-4" style={{ color: '#0d2d45' }} />
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="inline-flex"><LogoMark size={48} /></div>
          <h2 className="mt-3 text-lg font-bold" style={{ color: '#0d2d45' }}>
            BiliStudy
          </h2>
          <p className="text-xs mt-1" style={{ color: '#7db8d4' }}>
            {mode === 'login' ? '登录以使用视频总结与学习库' : '注册一个新账号'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#5b8fae' }}>
              邮箱
            </label>
            <input
              autoFocus
              type="email"
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: '#5b8fae' }}>
                显示名称（可选）
              </label>
              <input
                type="text"
                style={inputStyle}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="默认使用邮箱前缀"
              />
            </div>
          )}

          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#5b8fae' }}>
              密码
            </label>
            <input
              type="password"
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : ''}
            />
          </div>

          {error && (
            <div
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#b91c1c',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              color: '#fff',
              boxShadow:
                '0 4px 16px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            {submitting ? '提交中…' : mode === 'login' ? '登录' : '注册'}
          </button>

          <p className="text-center text-xs mt-1" style={{ color: '#7db8d4' }}>
            {mode === 'login' ? '还没有账号？' : '已有账号？'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              style={{ color: '#0284c7', fontWeight: 700 }}
            >
              {mode === 'login' ? '注册' : '登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
