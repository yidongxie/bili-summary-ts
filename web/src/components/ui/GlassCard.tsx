import React, { type PropsWithChildren } from 'react';

type GlassCardVariant = 'default' | 'readable' | 'subtle';

interface GlassCardProps extends PropsWithChildren {
  className?: string;
  variant?: GlassCardVariant;
  style?: React.CSSProperties;
}

const variants: Record<GlassCardVariant, React.CSSProperties> = {
  default: {
    background: 'var(--canvas)',
    border: '1px solid var(--hairline)',
  },
  readable: {
    background: 'var(--canvas)',
    border: '1px solid var(--hairline)',
  },
  subtle: {
    background: 'var(--surface)',
    border: '1px solid var(--hairline-soft)',
  },
};

export const GlassCard = React.memo(function GlassCard({ children, className = '', variant = 'default', style }: GlassCardProps) {
  return (
    <div className={`rounded-lg ${className}`} style={{ ...variants[variant], ...style }}>
      {children}
    </div>
  );
});
