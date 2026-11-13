import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

const W = 350;
const FLOOR = 64;
/** Score (0-100) → ordonnée de la maquette : 60 à y = 40, plancher à 64. */
const yOf = (score: number) => Math.min(FLOOR, Math.max(0, 100 - score));

/**
 * Courbe de forme sur 14 jours (maquette « Aujourd'hui ») : seuil 60 en
 * pointillés orange, aire teintée, dernier point marqué. Un jour sans note
 * coupe la courbe (jamais de valeur inventée).
 */
export function TodayFormeTrend({ scores, color }: { scores: Array<number | null>; color: string }) {
  const n = scores.length;
  const xOf = (i: number) => (n > 1 ? (i * W) / (n - 1) : 0);
  const segments: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  scores.forEach((s, i) => {
    if (s == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push([xOf(i), yOf(s)]);
  });
  if (cur.length) segments.push(cur);
  const lastIdx = scores.map((s, i) => (s == null ? -1 : i)).filter((i) => i >= 0).pop();
  const pts = (seg: Array<[number, number]>) => seg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const vals = scores.filter((s): s is number => s != null);

  return (
    <svg
      width="100%" viewBox="0 -2 350 70" style={{ overflow: "visible", display: "block" }} role="img"
      aria-label={vals.length ? `Forme sur 14 jours, de ${Math.min(...vals)} à ${Math.max(...vals)}` : "Forme sur 14 jours"}
    >
      <line x1="0" y1="40" x2={W} y2="40" stroke="rgba(255,149,0,0.55)" strokeDasharray="3 4" />
      <text x={W} y="36" textAnchor="end" fill={C.o} style={{ ...MONO, fontSize: 10 }}>60</text>
      <line x1="0" y1={FLOOR} x2={W} y2={FLOOR} stroke="rgba(231,211,168,0.10)" />
      {segments.map((seg, k) => (
        <g key={k}>
          {seg.length > 1 && (
            <polygon points={`${pts(seg)} ${seg[seg.length - 1][0].toFixed(1)},${FLOOR} ${seg[0][0].toFixed(1)},${FLOOR}`} fill={`${color}1F`} />
          )}
          <polyline points={pts(seg)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </g>
      ))}
      {lastIdx != null && (
        <circle cx={xOf(lastIdx)} cy={yOf(scores[lastIdx]!)} r={3.5} fill={color} stroke={C.bg} strokeWidth={1.5} />
      )}
    </svg>
  );
}
