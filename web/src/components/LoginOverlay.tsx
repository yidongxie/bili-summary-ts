import { useEffect, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';
import { LogoMark } from './AmbientBackdrop';
import { login as apiLogin, register as apiRegister } from '@/lib/api';

interface LoginOverlayProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const overlayCard: React.CSSProperties = {
  background: 'var(--canvas)',
  border: '1px solid var(--hairline)',
  boxShadow: 'rgba(0,0,0,0.12) 0px 24px 48px -8px',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--canvas)',
  border: '1px solid var(--hairline)',
  color: 'var(--ink)',
  borderRadius: 8,
  padding: '0.7rem 0.875rem',
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
      const data = mode === 'login' ? await apiLogin(email, password) : await apiRegister(email, password, displayName.trim() || undefined);
      if (!data.success) throw new Error(data.error || (mode === 'login' ? '登录失败' : '注册失败'));
      onSuccess();
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,10,10,0.42)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg p-7" onClick={(e) => e.stopPropagation()} style={overlayCard}>
        <div className="flex justify-end -mt-2 -mr-2">
          <button type="button" onClick={onClose} title="关闭"><CloseIcon className="w-4 h-4" style={{ color: 'var(--steel)' }} /></button>
        </div>
        <div className="text-center mb-6">
          <div className="inline-flex"><LogoMark size={48} /></div>
          <h2 className="mt-3 text-lg font-semibold" style={{ color: 'var(--ink)' }}>BiliStudy</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--steel)' }}>{mode === 'login' ? '登录以使用视频总结与学习库' : '注册一个新账号'}</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--steel)' }}>邮箱</label>
            <input autoFocus type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
          </div>
          {mode === 'register' && (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--steel)' }}>显示名称（可选）</label>
              <input type="text" style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="默认使用邮箱前缀" />
            </div>
          )}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--steel)' }}>密码</label>
            <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? '至少 6 位' : ''} />
          </div>
          {error && <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(212,86,86,0.08)', border: '1px solid rgba(212,86,86,0.28)', color: 'var(--brand-error)' }}>{error}</div>}
          <button type="submit" disabled={submitting} className="mt-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: 'var(--primary)', color: 'var(--on-primary)', border: '1px solid var(--primary)' }}>
            {submitting ? '提交中…' : mode === 'login' ? '登录' : '注册'}
          </button>
          <p className="text-center text-xs mt-1" style={{ color: 'var(--steel)' }}>
            {mode === 'login' ? '还没有账号？' : '已有账号？'}{' '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {mode === 'login' ? '注册' : '登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
