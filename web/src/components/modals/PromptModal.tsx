import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface PromptModalProps {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptModal({ open, title, label, defaultValue = '', placeholder, confirmLabel = '确认', onConfirm, onClose }: PromptModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  function submit() {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
    onClose();
  }

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
        {label && <label className='text-xs' style={{ color: 'var(--steel)' }}>{label}</label>}
        <input
          ref={inputRef}
          type='text'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={placeholder}
          className='w-full rounded-md px-3 py-2 text-sm outline-none'
          style={{ background: 'var(--canvas)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}
        />
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onClose} className='px-4 py-2 rounded-full text-sm font-medium' style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}>
            取消
          </button>
          <button type='button' onClick={submit} className='px-4 py-2 rounded-full text-sm font-medium' style={{ background: 'var(--primary)', color: 'var(--on-primary)', border: '1px solid var(--primary)' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
