import type { PropsWithChildren } from 'react';

type GlassCardVariant = 'default' | 'readable' | 'subtle';

interface GlassCardProps extends PropsWithChildren {
  className?: string;
  variant?: GlassCardVariant;
  style?: React.CSSProperties;
}

const variants: Record<GlassCardVariant, React.CSSProperties> = {
  default: {
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(14,165,233,0.14)',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 4px 24px rgba(14,165,233,0.07), inset 0 1px 0 rgba(255,255,255,0.85)',
  },
  readable: {
    background: 'rgba(255,255,255,0.78)',
    border: '1px solid rgba(14,165,233,0.16)',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 22px rgba(14,165,233,0.08), inset 0 1px 0 rgba(255,255,255,0.90)',
  },
  subtle: {
    background: 'rgba(255,255,255,0.42)',
    border: '1px solid rgba(14,165,233,0.10)',
    backdropFilter: 'blur(12px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
  },
};

export function GlassCard({ children, className = '', variant = 'default', style }: GlassCardProps) {
  return (
    <div className={`rounded-2xl ${className}`} style={{ ...variants[variant], ...style }}>
      {children}
    </div>
  );
}
