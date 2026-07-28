import React, { type PropsWithChildren, type ReactNode } from 'react';
import { BookOpen } from 'lucide-react';

interface EmptyStateProps extends PropsWithChildren {
  icon?: ReactNode;
  title?: string;
  desc?: string;
  action?: ReactNode;
}

export const EmptyState = React.memo(function EmptyState({ icon, title, desc, action, children }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-14 px-5 rounded-lg text-center"
      style={{
        border: '1px solid var(--hairline-soft)',
        background: 'var(--surface)',
      }}
    >
      <div className="mb-3" style={{ color: 'var(--stone)' }}>{icon || <BookOpen className="w-10 h-10" />}</div>
      {title && <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</div>}
      {desc && <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--steel)' }}>{desc}</p>}
      {children}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
});
