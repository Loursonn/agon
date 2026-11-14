import { C } from "@/lib/theme";
import { CARD, MONO } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import type { HyroxStation } from "@/features/shared/components/hyroxStation";
import { STATION_PICTO } from "@/features/shared/components/hyrox/raceAnalysisShared";
import type { SegmentPosition } from "@/lib/hyrox/raceEvolution";
import { formatMmSs } from "@/lib/time";

const SW = 180;
const SH = 46;
/** Bande verte : top 35 %. */
const GOOD = 35;

const picto = (key: string): HyroxStation => (key === "run_total" ? "course" : key === "roxzone_total" ? "roxzone" : STATION_PICTO[key] ?? "autre");

/** Mini-courbe des positions (0 = meilleur en haut), médiane en pointillé, bande verte = top 35 %. */
function Spark({ pcts }: { pcts: Array<number | null> }) {
  const y = (p: number) => 3 + (p / 100) * (SH - 6);
  const pts = pcts.map((p, i) => (p == null ? null : [pcts.length > 1 ? 8 + (i / (pcts.length - 1)) * (SW - 16) : SW / 2, y(p)] as const));
  const known = pts.filter((p): p is readonly [number, number] => p != null);
  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} style={{ width: "100%", height: SH, display: "block" }} aria-hidden>
      <rect x={0} y={3} width={SW} height={(GOOD / 100) * (SH - 6)} fill={C.g} opacity={0.1} />
      <line x1={0} x2={SW} y1={y(50)} y2={y(50)} stroke={C.tx3} strokeDasharray="3 3" strokeWidth={1} />
      {known.length > 1 && <polyline fill="none" stroke={C.o} strokeWidth={1.6} points={known.map(([x, yy]) => `${x},${yy}`).join(" ")} />}
      {known.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r={i === known.length - 1 ? 3.6 : 2.6} fill={i === known.length - 1 ? C.o : C.tx3} />)}
    </svg>
  );
}

/**
 * « 03 — Position par station » (planche HyroxAnaCoachEvolution) : une carte
 * par station (+ Runs et Roxzone) avec la position course après course, le
 * top % de la dernière, l'évolution en points et les temps successifs.
 */
export default function EvolutionStationPositions({ rows }: { rows: SegmentPosition[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
      {rows.map((s) => {
        const bad = s.latestPct != null && s.latestPct >= 75;
        return (
          <div key={s.key} style={{ ...CARD, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
              <HyroxPicto station={picto(s.key)} size={16} color={C.o} />{s.label}
            </div>
            <Spark pcts={s.pcts} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ ...MONO, fontSize: 15, color: bad ? C.r : C.tx }}>{s.latestPct != null ? `top ${s.latestPct} %` : "—"}</span>
              <span style={{ ...MONO, fontSize: 11, color: s.deltaPts == null || s.deltaPts === 0 ? C.tx3 : s.deltaPts < 0 ? C.g : C.r }}>
                {s.deltaPts == null ? "—" : `${s.deltaPts > 0 ? "+" : s.deltaPts < 0 ? "−" : ""}${Math.abs(s.deltaPts)} pts`}
              </span>
            </div>
            <div style={{ ...MONO, fontSize: 10.5, color: C.tx3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.values.map((v) => formatMmSs(v)).join(" → ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
