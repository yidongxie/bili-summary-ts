import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps extends PropsWithChildren, ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--primary)',
    color: 'var(--on-primary)',
    border: '1px solid var(--primary)',
  },
  accent: {
    background: 'var(--brand-green)',
    color: 'var(--primary)',
    border: '1px solid var(--brand-green)',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--hairline)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'transparent',
    color: 'var(--brand-error)',
    border: '1px solid rgba(212,86,86,0.35)',
  },
  success: {
    background: 'var(--brand-green)',
    color: 'var(--primary)',
    border: '1px solid var(--brand-green)',
  },
};

export function Button({ children, className = '', variant = 'secondary', size = 'md', style, ...props }: ButtonProps) {
  const padding = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm';
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${padding} ${className}`}
      style={{ ...variantStyles[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
