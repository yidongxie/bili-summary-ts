import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ChipTone = 'blue' | 'green' | 'red' | 'gray';

interface ChipProps extends PropsWithChildren, ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: ChipTone;
}

const tones: Record<ChipTone, { color: string; bg: string; border: string; activeBg: string; activeBorder: string }> = {
  blue: { color: '#0369a1', bg: 'rgba(255,255,255,0.45)', border: 'rgba(14,165,233,0.14)', activeBg: 'rgba(14,165,233,0.16)', activeBorder: 'rgba(14,165,233,0.38)' },
  green: { color: '#047857', bg: 'rgba(255,255,255,0.45)', border: 'rgba(5,150,105,0.16)', activeBg: 'rgba(5,150,105,0.13)', activeBorder: 'rgba(5,150,105,0.32)' },
  red: { color: '#b91c1c', bg: 'rgba(255,255,255,0.45)', border: 'rgba(239,68,68,0.16)', activeBg: 'rgba(239,68,68,0.10)', activeBorder: 'rgba(239,68,68,0.28)' },
  gray: { color: '#5b8fae', bg: 'rgba(255,255,255,0.45)', border: 'rgba(14,165,233,0.12)', activeBg: 'rgba(255,255,255,0.70)', activeBorder: 'rgba(14,165,233,0.20)' },
};

export function Chip({ children, active = false, tone = 'blue', className = '', style, ...props }: ChipProps) {
  const t = tones[tone];
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-all hover:scale-105 disabled:hover:scale-100 ${className}`}
      style={{
        background: active ? t.activeBg : t.bg,
        color: t.color,
        border: `1px solid ${active ? t.activeBorder : t.border}`,
        fontWeight: active ? 700 : 500,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
