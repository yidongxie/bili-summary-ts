import { useEffect } from 'react';

export type ToastState = { id: number; msg: string; type: 'ok' | 'error' | 'info' } | null;

interface ToastProps {
  toast: ToastState;
  onClose: () => void;
}

// Single ephemeral toast, top-right. Replaces the legacy `.status` div.
export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.type === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const tone =
    toast.type === 'ok'
      ? { bg: 'rgba(5,150,105,0.10)', color: '#047857', border: 'rgba(5,150,105,0.30)' }
      : toast.type === 'error'
        ? { bg: 'rgba(239,68,68,0.10)', color: '#b91c1c', border: 'rgba(239,68,68,0.30)' }
        : { bg: 'rgba(14,165,233,0.12)', color: '#0369a1', border: 'rgba(14,165,233,0.30)' };

  return (
    <div
      className="fixed top-5 right-5 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
      style={{
        background: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(14,165,233,0.15)',
      }}
      onClick={onClose}
      role="status"
    >
      {toast.msg}
    </div>
  );
}
