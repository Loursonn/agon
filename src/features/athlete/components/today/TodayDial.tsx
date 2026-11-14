/**
 * Cadran décoratif de l'en-tête « Aujourd'hui » (maquette) : grand cercle or
 * gradué, cercles intérieurs, à moitié hors champ à droite.
 */
export function TodayDial() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180;
    const major = i % 6 === 0;
    const r1 = 150;
    const r2 = major ? 141 : 146;
    return (
      <line
        key={i}
        x1={170 + r1 * Math.cos(a)} y1={150 + r1 * Math.sin(a)}
        x2={170 + r2 * Math.cos(a)} y2={150 + r2 * Math.sin(a)}
        stroke={major ? "rgba(255,201,51,0.55)" : "rgba(255,201,51,0.28)"} strokeWidth={1}
      />
    );
  });
  return (
    <svg width="340" height="300" viewBox="0 0 340 300" aria-hidden style={{ position: "absolute", right: -150, top: -40, pointerEvents: "none" }}>
      <circle cx="170" cy="150" r="150" fill="none" stroke="rgba(255,201,51,0.30)" />
      {ticks}
      <circle cx="170" cy="150" r="118" fill="none" stroke="rgba(231,211,168,0.12)" />
      <circle cx="170" cy="150" r="84" fill="none" stroke="rgba(231,211,168,0.10)" strokeDasharray="2 5" />
      <circle cx="170" cy="150" r="48" fill="none" stroke="rgba(255,201,51,0.22)" />
    </svg>
  );
}
