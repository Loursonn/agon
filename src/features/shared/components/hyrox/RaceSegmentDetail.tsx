import { C } from "@/lib/theme";
import { CARD, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import type { SegmentWatch } from "@/lib/hyrox/raceWatch";
import { DASH, fmtClock, fmtPace } from "@/lib/seance";
import { fmtDelta } from "./raceAnalysisShared";

/** Détail d'un segment de la frise (touché, ou survolé côté coach). */
export default function RaceSegmentDetail({ s, cruise, usualS = null, objectiveS }: {
  s: SegmentWatch;
  /** Allure de croisière de l'athlète (médiane des runs 2 à 7). */
  cruise: number;
  /** Ralentissement habituel à ce run chez les athlètes du niveau (s/km vs leur croisière). */
  usualS?: number | null;
  /** Cible de l'objectif de la course pour ce segment (« Écart objectif »). */
  objectiveS: number | null;
}) {
  const big = { ...MONO, fontSize: 18 };
  const vsObj = objectiveS != null ? s.officialS - objectiveS : null;
  return (
    <div style={{ ...CARD, padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10 }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 14, fontWeight: 600 }}>{s.label}</div>
      <div><div style={LABEL}>Temps</div><div style={big}>{fmtClock(s.officialS)}</div></div>
      {s.kind === "run" && <div><div style={LABEL}>Allure</div><div style={big}>{fmtPace(s.officialS)} <span style={{ fontSize: 11, color: C.tx3 }}>/km</span></div></div>}
      {objectiveS != null && <div><div style={LABEL}>Objectif</div><div style={{ ...big, color: C.tx2 }}>{fmtClock(objectiveS)}</div></div>}
      {vsObj != null && (
        <div><div style={LABEL}>Écart objectif</div><div style={{ ...big, color: vsObj > 0 ? C.o : C.g }}>{fmtDelta(vsObj, (x) => `${x} s`)}</div></div>
      )}
      <div><div style={LABEL}>FC moy. / max</div><div style={big}>{s.avgHr ?? DASH} / {s.maxHr ?? DASH}</div></div>
      {s.kind === "run" && <div><div style={LABEL}>Cadence</div><div style={big}>{s.avgCadence ?? DASH}</div></div>}
      {s.kind === "run" && s.key !== "run_1" && (
        <div>
          <div style={LABEL}>vs croisière</div>
          <div style={{ ...big, color: s.officialS > cruise ? C.o : C.g }}>{s.officialS >= cruise ? "+" : "−"}{Math.abs(Math.round(s.officialS - cruise))} s/km</div>
          {usualS != null && <div style={{ fontSize: 11, color: C.tx3 }}>habituel {usualS >= 0 ? "+" : "−"}{Math.abs(Math.round(usualS))}</div>}
        </div>
      )}
      {s.key === "run_1" && (
        <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: C.tx3 }}>Run 1 : départ et longueur changent d'une course à l'autre, il ne sert pas de référence.</div>
      )}
      {s.key === "run_8" && (
        <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: C.tx3 }}>Run 8 : arrivée et parcours parfois différents, à lire avec prudence.</div>
      )}
    </div>
  );
}
