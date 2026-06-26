export function BrandIcon({ size = 44 }: { size?: number }) {
  return (
    <img
      src="/brand-icon.svg"
      alt="BiliStudy"
      width={size}
      height={size}
      className="shrink-0"
      style={{ borderRadius: Math.round(size * 0.22) }}
    />
  );
}

export function AmbientBackdrop() {
  return <div className="fixed inset-0 pointer-events-none" style={{ background: 'var(--canvas)' }} />;
}

export function LogoMark({ size = 44 }: { size?: number }) {
  return <BrandIcon size={size} />;
}
