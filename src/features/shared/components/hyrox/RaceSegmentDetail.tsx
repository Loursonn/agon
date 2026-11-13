import { C } from "@/lib/theme";
import { CARD, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { SegmentWatch } from "@/lib/hyrox/raceWatch";
import { DASH, fmtClock, fmtPace } from "@/lib/seance";
import { fmtDelta } from "./raceAnalysisShared";

/** Détail d'un segment de la frise (touché, ou survolé côté coach). */
export default function RaceSegmentDetail({ s, fresh, medianS, coach = false }: {
  s: SegmentWatch;
  fresh: number;
  /** Médiane du niveau pour ce segment (« Écart médiane »). */
  medianS: number | null;
  coach?: boolean;
}) {
  const big = { ...MONO, fontSize: 18 };
  const vsMedian = medianS != null ? s.officialS - medianS : null;
  return (
    <div style={{ ...CARD, padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10 }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 14, fontWeight: 600 }}>{s.label}</div>
      <div><div style={LABEL}>Temps</div><div style={big}>{fmtClock(s.officialS)}</div></div>
      {s.kind === "run" && <div><div style={LABEL}>Allure</div><div style={big}>{fmtPace(s.officialS)} <span style={{ fontSize: 11, color: C.tx3 }}>/km</span></div></div>}
      {vsMedian != null && (
        <div><div style={LABEL}>Écart médiane</div><div style={{ ...big, color: vsMedian > 0 ? C.o : C.g }}>{fmtDelta(vsMedian, (x) => `${x} s`)}</div></div>
      )}
      <div><div style={LABEL}>FC moy. / max</div><div style={big}>{s.avgHr ?? DASH} / {s.maxHr ?? DASH}</div></div>
      {s.kind === "run" && <div><div style={LABEL}>Cadence</div><div style={big}>{s.avgCadence ?? DASH}</div></div>}
      {s.kind === "run" && s.key !== "run_1" && (
        <div>
          <div style={LABEL}>{coach ? "Coût vs allure fraîche" : "vs run 1"}</div>
          <div style={{ ...big, color: s.officialS > fresh ? C.o : C.g }}>{s.officialS >= fresh ? "+" : "−"}{Math.abs(Math.round(s.officialS - fresh))} s/km</div>
        </div>
      )}
    </div>
  );
}
