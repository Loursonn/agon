import { useState } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, pillStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { hyroxPictoColor } from "@/features/shared/components/hyroxStation";
import type { RunPaceRow } from "@/lib/hyrox/raceEvolution";
import type { RaceWatchAnalysis, SegmentWatch } from "@/lib/hyrox/raceWatch";
import { DASH, fmtPace } from "@/lib/seance";
import { STATION_PICTO } from "./raceAnalysisShared";
import { Sources } from "./raceAnalysisUi";
import RaceRunsEvolution from "./RaceRunsEvolution";

/** Onglet « Runs » : cette course (8 barres, écart au run 1) ou évolution sur les courses. */
export default function RaceRunsTab({ analysis, median, attribution, timeSource, evolution, raceId }: {
  analysis: RaceWatchAnalysis;
  median: (s: string) => number | null;
  attribution: string | null;
  timeSource: string;
  evolution: RunPaceRow[];
  raceId: string;
}) {
  const [view, setView] = useState<"course" | "evolution">("course");
  const runs = analysis.segments.filter((s) => s.kind === "run");
  const fresh = analysis.freshPaceSPerKm;
  const maxDelta = Math.max(10, ...runs.map((r) => r.officialS - fresh));
  const prevStation = (s: SegmentWatch) => {
    const i = analysis.segments.indexOf(s);
    return analysis.segments.slice(0, i).reverse().find((x) => x.kind === "station") ?? null;
  };
  const slowest = [...runs.slice(1)].sort((a, b) => b.officialS - a.officialS).slice(0, 2);
  const costly = slowest.map(prevStation).filter((x): x is SegmentWatch => x != null);
  const cad = runs.map((r) => r.avgCadence).filter((x): x is number => x != null);
  // FC des 2 runs les plus lents vs run 1 : le cœur monte-t-il plus ?
  const slowHr = slowest.map((s) => s.avgHr).filter((x): x is number => x != null);
  const hr1 = runs[0].avgHr;
  const slowHrAvg = slowHr.length === slowest.length && slowHr.length > 0 ? Math.round(slowHr.reduce((a, b) => a + b, 0) / slowHr.length) : null;
  const heartUp = hr1 != null && slowHrAvg != null && slowHrAvg > hr1;
  const cadDown = cad.length > 0 && Math.min(...cad) < cad[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }} role="radiogroup" aria-label="Vue des runs">
        {([["course", "Cette course"], ["evolution", "Évolution"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}
            style={{ ...pillStyle(C.ac, view === k), height: 28, cursor: "pointer", textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{l}</button>
        ))}
      </div>

      {view === "evolution" ? (
        <>
          <RaceRunsEvolution rows={evolution} currentId={raceId} />
          <Sources>allures : temps des courses (résultats officiels ou saisis) · aucune donnée montre</Sources>
        </>
      ) : (
        <>
          <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <span style={KICKER}>Allure par km</span>
              <span style={{ ...LABEL, fontSize: 10 }}>Allure fraîche {fmtPace(fresh)} (run 1)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, alignItems: "end", height: 140 }}>
              {runs.map((r, i) => {
                const d = r.officialS - fresh;
                const m = median(r.key);
                return (
                  <div key={r.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                    <span style={{ ...MONO, fontSize: 10.5, color: i === 0 ? C.tx3 : d > 0 ? C.o : C.g }}>{i === 0 ? fmtPace(r.officialS) : `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`}</span>
                    <div title={m != null ? `Médiane ${fmtPace(m)}` : undefined}
                      style={{ width: "70%", height: `${12 + (Math.max(0, d) / maxDelta) * 90}%`, background: i === 0 ? C.tx3 : hyroxPictoColor("course"), borderRadius: 4 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, justifyItems: "center" }}>
              {runs.map((r, i) => {
                const st = prevStation(r);
                return (
                  <div key={r.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{i + 1}</span>
                    {i === 0
                      ? <span style={{ ...MONO, fontSize: 9.5, color: C.tx3, height: 14, lineHeight: "14px" }}>réf.</span>
                      : st ? <HyroxPicto station={STATION_PICTO[st.key] ?? "autre"} size={14} title={st.label} /> : <span style={{ height: 14 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.tx3 }}>Sous chaque barre : la station juste avant. Run 1 = référence (allure fraîche).</div>
            {cad.length > 0 && (
              <>
                <div style={LABEL}>Cadence · pas/min</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, textAlign: "center" }}>
                  {runs.map((r) => <span key={r.key} style={{ ...MONO, fontSize: 12 }}>{r.avgCadence ?? DASH}</span>)}
                </div>
                <div style={LABEL}>FC moyenne · bpm</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, textAlign: "center" }}>
                  {runs.map((r) => <span key={r.key} style={{ ...MONO, fontSize: 12 }}>{r.avgHr ?? DASH}</span>)}
                </div>
              </>
            )}
          </div>
          {costly.length > 0 && slowest[0].officialS > fresh && (
            <div style={{ ...CARD, padding: "12px 14px", borderColor: alpha(C.o, 0.5) }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Ce qui te coûte le plus : {costly.map((c) => c.label.toLowerCase()).join(" et ")}.</div>
              <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 4, lineHeight: 1.45 }}>
                Les runs qui suivent sont les plus lents ({slowest.map((s) => `+${Math.round(s.officialS - fresh)}`).join(" et ")} s/km)
                {cadDown ? `, ta cadence descend jusqu'à ${Math.min(...cad)} pas/min` : ""}
                {heartUp ? `${cadDown ? " et" : ","} ton cœur monte plus qu'au run 1 (${slowHrAvg} bpm contre ${hr1})` : ""}.
              </div>
            </div>
          )}
          <Sources>allures : {timeSource}{attribution ? ` · cadence, FC : ${attribution}` : ""}</Sources>
        </>
      )}
    </div>
  );
}
