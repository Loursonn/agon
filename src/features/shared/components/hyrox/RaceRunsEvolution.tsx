import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { RunPaceRow } from "@/lib/hyrox/raceEvolution";
import { fmtPace } from "@/lib/seance";
import { ddmm } from "./raceAnalysisShared";

const W = 360;
const H = 170;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

/**
 * Runs › Évolution : allure des 8 runs de chaque course (plus haut = plus
 * lent), la course ouverte en couleur, les précédentes en gris.
 */
export default function RaceRunsEvolution({ rows, currentId }: { rows: RunPaceRow[]; currentId: string }) {
  if (rows.length < 2) {
    return <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Il faut au moins deux courses avec les 8 temps de run pour comparer.</div>;
  }
  const all = rows.flatMap((r) => r.runs);
  const lo = Math.floor((Math.min(...all) - 5) / 15) * 15;
  const hi = Math.ceil((Math.max(...all) + 5) / 15) * 15;
  const x = (i: number) => PAD.l + (i / 7) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((hi - v) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const color = (r: RunPaceRow) => (r.id === currentId ? C.ac : C.tx3);
  return (
    <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span style={KICKER}>Allure par km · {rows.length} courses</span>
        <span style={{ ...LABEL, fontSize: 10 }}>plus haut = plus lent</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Allure des runs, course par course">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={C.brd} strokeWidth={1} />
            <text x={PAD.l - 4} y={y(t) + 3} fontSize={9} fill={C.tx3} textAnchor="end" style={MONO}>{fmtPace(t)}</text>
          </g>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize={9} fill={C.tx3} textAnchor="middle" style={MONO}>{i + 1}</text>
        ))}
        {rows.map((r) => (
          <g key={r.id} opacity={r.id === currentId ? 1 : 0.55}>
            <polyline fill="none" stroke={color(r)} strokeWidth={r.id === currentId ? 2.4 : 1.4}
              points={r.runs.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {r.runs.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={r.id === currentId ? 2.6 : 1.8} fill={color(r)} />)}
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[...rows].reverse().map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "baseline", fontSize: 12.5 }}>
            <span style={{ color: r.id === currentId ? C.tx : C.tx2 }}>
              <span style={{ color: color(r) }}>━</span> {r.label} <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{ddmm(r.date)}</span>
            </span>
            <span style={{ ...MONO, color: C.tx3, fontSize: 11 }}>run 1 {fmtPace(r.runs[0])}</span>
            <span style={{ ...MONO, color: C.tx3, fontSize: 11 }}>run 8 {fmtPace(r.runs[7])}</span>
            <span style={{ ...MONO }}>moy. {fmtPace(r.avg)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
