import { KICKER } from "@/features/shared/components/seance/seanceUi";
import { C } from "@/lib/theme";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { raceShortName, type SegmentPosition } from "@/lib/hyrox/raceEvolution";
import { formatMmSs } from "@/lib/time";

const SW = 120;
const SH = 34;
const GOOD = 35;

/** Mini-courbe des positions (0 = meilleur en haut), médiane en pointillé, bande verte = top 35 %. */
function Spark({ pcts }: { pcts: Array<number | null> }) {
  const pts = pcts.map((p, i) => (p == null ? null : [pcts.length > 1 ? 4 + (i / (pcts.length - 1)) * (SW - 8) : SW / 2, 2 + (p / 100) * (SH - 4)] as const));
  const known = pts.filter((p): p is readonly [number, number] => p != null);
  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} width={SW} height={SH} aria-hidden>
      <rect x={0} y={2} width={SW} height={(GOOD / 100) * (SH - 4)} fill={C.g} opacity={0.12} />
      <line x1={0} x2={SW} y1={2 + 0.5 * (SH - 4)} y2={2 + 0.5 * (SH - 4)} stroke={C.tx3} strokeDasharray="3 3" strokeWidth={1} />
      {known.length > 1 && <polyline fill="none" stroke={C.ac} strokeWidth={1.6} points={known.map(([x, y]) => `${x},${y}`).join(" ")} />}
      {known.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === known.length - 1 ? 2.8 : 2} fill={C.ac} />)}
    </svg>
  );
}

/**
 * « 03 — Position par station » (planche HyroxAnaCoachEvolution) : top % de
 * la dernière course, évolution en points depuis la première, temps course
 * après course et mini-courbe. Remplace l'ancien tableau « Moy. / Meilleur %ile ».
 */
export default function BilanStationPositions({ rows, races, pctColor, refText }: {
  rows: SegmentPosition[];
  /** Courses dans l'ordre chronologique (même ordre que `rows[i].values`). */
  races: HyroxResult[];
  pctColor: (p: number) => string;
  refText: string;
}) {
  return (
    <div style={{ background: C.s1, borderRadius: 14, border: "1px solid " + C.brd, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Top % par segment</div>
        <div style={{ fontSize: 10, color: C.tx3 }}>{races.map(raceShortName).join(" · ")}</div>
      </div>
      {rows.map((s) => (
        <div key={s.key} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) 70px 64px minmax(120px, 2fr) 120px", gap: 10, alignItems: "center", padding: "5px 0", borderTop: "1px solid " + C.brd }}>
          <span style={{ fontSize: 11, color: C.tx }}>{s.label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: s.latestPct != null ? pctColor(s.latestPct) : C.tx3, textAlign: "right" }}>
            {s.latestPct != null ? `top ${s.latestPct} %` : "—"}
          </span>
          <span style={{ fontSize: 10, fontFamily: "monospace", textAlign: "right", color: s.deltaPts == null || s.deltaPts === 0 ? C.tx3 : s.deltaPts < 0 ? C.g : C.r }}>
            {s.deltaPts == null ? "—" : `${s.deltaPts > 0 ? "+" : s.deltaPts < 0 ? "−" : ""}${Math.abs(s.deltaPts)} pts`}
          </span>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.values.map((v) => formatMmSs(v)).join(" → ")}
          </span>
          <Spark pcts={s.pcts} />
        </div>
      ))}
      <div style={{ fontSize: 10, color: C.tx3, marginTop: 8 }}>
        Calcul Agon · position vs {refText} (top 1 % = meilleur, ligne pointillée = médiane, bande verte = top {GOOD} %) · points : évolution entre la première et la dernière course (− = mieux)
      </div>
    </div>
  );
}
