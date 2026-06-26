import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ChipTone = 'blue' | 'green' | 'red' | 'gray';

interface ChipProps extends PropsWithChildren, ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: ChipTone;
}

const tones: Record<ChipTone, { color: string; bg: string; border: string; activeBg: string; activeBorder: string }> = {
  blue: { color: 'var(--brand-tag)', bg: 'rgba(55,114,207,0.15)', border: 'rgba(55,114,207,0.18)', activeBg: 'var(--primary)', activeBorder: 'var(--primary)' },
  green: { color: 'var(--primary)', bg: 'var(--brand-green)', border: 'var(--brand-green)', activeBg: 'var(--brand-green)', activeBorder: 'var(--brand-green)' },
  red: { color: 'var(--brand-error)', bg: 'rgba(212,86,86,0.08)', border: 'rgba(212,86,86,0.24)', activeBg: 'var(--brand-error)', activeBorder: 'var(--brand-error)' },
  gray: { color: 'var(--steel)', bg: 'var(--surface)', border: 'var(--hairline)', activeBg: 'var(--primary)', activeBorder: 'var(--primary)' },
};

export function Chip({ children, active = false, tone = 'blue', className = '', style, ...props }: ChipProps) {
  const t = tones[tone];
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-60 ${className}`}
      style={{
        background: active ? t.activeBg : t.bg,
        color: active ? 'var(--on-primary)' : t.color,
        border: `1px solid ${active ? t.activeBorder : t.border}`,
        fontWeight: active ? 600 : 500,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
