import React, { useEffect } from 'react';

export type ToastState = {
  id: number;
  msg: string;
  type: 'ok' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
} | null;

interface ToastProps {
  toast: ToastState;
  onClose: () => void;
}

export const Toast = React.memo(function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.type === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const tone =
    toast.type === 'ok'
      ? { color: 'var(--primary)', border: 'var(--brand-green)', marker: 'var(--brand-green)' }
      : toast.type === 'error'
        ? { color: 'var(--brand-error)', border: 'rgba(212,86,86,0.35)', marker: 'var(--brand-error)' }
        : { color: 'var(--ink)', border: 'var(--hairline)', marker: 'var(--brand-tag)' };

  return (
    <div
      className="fixed top-5 right-5 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium"
      style={{ background: 'var(--canvas)', color: tone.color, border: `1px solid ${tone.border}`, boxShadow: 'rgba(0,0,0,0.08) 0px 4px 12px' }}
      onClick={onClose}
      role="status"
    >
      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: tone.marker }} />
      <span>{toast.msg}</span>
      {toast.action && (
        <button
          type="button"
          className="ml-3 underline underline-offset-2 font-semibold"
          onClick={(e) => {
            e.stopPropagation();
            toast.action?.onClick();
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
});
