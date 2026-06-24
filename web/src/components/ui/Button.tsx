import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'success';

interface ButtonProps extends PropsWithChildren, ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.20)',
    boxShadow: '0 4px 16px rgba(14,165,233,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  ghost: {
    background: 'rgba(255,255,255,0.62)',
    color: '#0369a1',
    border: '1px solid rgba(14,165,233,0.18)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
  },
  danger: {
    background: 'rgba(239,68,68,0.08)',
    color: '#b91c1c',
    border: '1px solid rgba(239,68,68,0.20)',
  },
  success: {
    background: 'rgba(5,150,105,0.10)',
    color: '#047857',
    border: '1px solid rgba(5,150,105,0.25)',
  },
};

export function Button({ children, className = '', variant = 'ghost', size = 'md', style, ...props }: ButtonProps) {
  const padding = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${padding} ${className}`}
      style={{ ...variantStyles[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
