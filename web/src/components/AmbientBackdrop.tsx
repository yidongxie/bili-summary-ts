import { Zap } from 'lucide-react';

export function AmbientBackdrop() {
  return <div className="fixed inset-0 pointer-events-none" style={{ background: 'var(--canvas)' }} />;
}

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: 'var(--primary)',
        color: 'var(--on-primary)',
      }}
    >
      <Zap style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  );
}
