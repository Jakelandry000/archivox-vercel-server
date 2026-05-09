export function AuroraBackground({ subtle = false }: { subtle?: boolean }) {
  const opacity = subtle ? 0.06 : 0.10;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div className="aurora-1" style={{
        position: 'absolute', width: '70vw', height: '70vw',
        top: '-20%', left: '10%',
        background: `radial-gradient(ellipse, rgba(27,90,67,${opacity}) 0%, transparent 70%)`,
        borderRadius: '50%',
      }} />
      <div className="aurora-2" style={{
        position: 'absolute', width: '50vw', height: '50vw',
        top: '10%', right: '-10%',
        background: `radial-gradient(ellipse, rgba(79,154,120,${opacity * 0.7}) 0%, transparent 70%)`,
        borderRadius: '50%',
      }} />
    </div>
  );
}
