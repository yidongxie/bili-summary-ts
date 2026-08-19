import { X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, message, confirmLabel = '确认', danger = false, onConfirm, onClose }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center px-4'
      style={{ background: 'rgba(10,10,10,0.42)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className='w-full max-w-sm rounded-lg p-6 flex flex-col gap-4'
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: 'rgba(0,0,0,0.12) 0px 24px 48px -8px' }}
      >
        <div className='flex items-start justify-between gap-3'>
          <h3 className='text-base font-bold' style={{ color: 'var(--ink)' }}>{title}</h3>
          <button type='button' onClick={onClose} className='rounded-full p-1 shrink-0' style={{ color: 'var(--steel)' }} aria-label='关闭'>
            <X className='w-4 h-4' />
          </button>
        </div>
        <p className='text-sm' style={{ color: 'var(--steel)', lineHeight: 1.6 }}>{message}</p>
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onClose} className='px-4 py-2 rounded-full text-sm font-medium' style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}>
            取消
          </button>
          <button
            type='button'
            onClick={() => { onConfirm(); onClose(); }}
            className='px-4 py-2 rounded-full text-sm font-medium'
            style={{ background: danger ? 'var(--brand-error)' : 'var(--primary)', color: danger ? '#fff' : 'var(--on-primary)', border: `1px solid ${danger ? 'var(--brand-error)' : 'var(--primary)'}` }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
