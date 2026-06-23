import { Zap } from 'lucide-react';

// Decorative liquid gradient blobs that sit behind the entire app shell.
// Pulled out of App.tsx so individual pages don't have to re-mount them.
export function AmbientBackdrop() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute rounded-full"
        style={{
          width: 700,
          height: 700,
          top: '-15%',
          left: '10%',
          background:
            'radial-gradient(circle, rgba(147,210,255,0.55) 0%, rgba(186,230,255,0.20) 50%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 550,
          height: 550,
          bottom: '-5%',
          right: '5%',
          background:
            'radial-gradient(circle, rgba(96,196,255,0.45) 0%, rgba(186,230,255,0.15) 55%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 420,
          height: 420,
          top: '35%',
          left: '-8%',
          background:
            'radial-gradient(circle, rgba(186,230,255,0.50) 0%, transparent 65%)',
          filter: 'blur(45px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 350,
          height: 350,
          top: '20%',
          right: '25%',
          background:
            'radial-gradient(circle, rgba(125,211,252,0.30) 0%, transparent 65%)',
          filter: 'blur(40px)',
        }}
      />
    </div>
  );
}

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="rounded-2xl flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
        boxShadow:
          '0 4px 16px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
      }}
    >
      <Zap className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  );
}
