import type { PropsWithChildren, ReactNode } from 'react';
import { BookOpen } from 'lucide-react';

interface EmptyStateProps extends PropsWithChildren {
  icon?: ReactNode;
  title?: string;
  desc?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, desc, action, children }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-14 px-5 rounded-2xl text-center"
      style={{
        border: '1.5px dashed rgba(14,165,233,0.25)',
        background: 'rgba(255,255,255,0.34)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="mb-3" style={{ color: '#b0d8f0' }}>{icon || <BookOpen className="w-10 h-10" />}</div>
      {title && <div className="text-sm font-bold" style={{ color: '#0d2d45' }}>{title}</div>}
      {desc && <p className="text-sm mt-1 leading-relaxed" style={{ color: '#7db8d4' }}>{desc}</p>}
      {children}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
