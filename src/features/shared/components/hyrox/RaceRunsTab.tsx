import { useState } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, pillStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { hyroxPictoColor } from "@/features/shared/components/hyroxStation";
import type { RunPaceRow } from "@/lib/hyrox/raceEvolution";
import type { RaceWatchAnalysis, SegmentWatch } from "@/lib/hyrox/raceWatch";
import { DASH, fmtPace } from "@/lib/seance";
import { STATION_META } from "@/features/shared/types/hyrox";
import { runLookup } from "@/lib/hyrox/raceWatch";
import { EXCESS_WARN_S, levelRunPattern, stationRunCosts, type RunLookup, type StationRunCost } from "@/lib/hyrox/runPacing";
import { STATION_PICTO } from "./raceAnalysisShared";
import { Sources } from "./raceAnalysisUi";
import RaceRunsEvolution from "./RaceRunsEvolution";

/**
 * Onglet « Runs » : cette course (8 barres, écart à la croisière = médiane
 * des runs 2 à 7 ; le run 1 s'affiche sans être comparé ; repère = écart
 * habituel au niveau) ou évolution sur les courses.
 */
export default function RaceRunsTab({ analysis, median, levelP50 = null, attribution, timeSource, evolution, raceId }: {
  analysis: RaceWatchAnalysis;
  median: (s: string) => number | null;
  /** Médianes des runs du niveau : écart habituel. */
  levelP50?: RunLookup | null;
  attribution: string | null;
  timeSource: string;
  evolution: RunPaceRow[];
  raceId: string;
}) {
  const [view, setView] = useState<"course" | "evolution">("course");
  const runs = analysis.segments.filter((s) => s.kind === "run");
  const cruise = analysis.cruisePaceSPerKm;
  const level = levelP50 ? levelRunPattern(levelP50) : null;
  const compared = runs.filter((r) => r.key !== "run_1");
  const maxDelta = Math.max(10, ...compared.map((r) => r.officialS - cruise), ...Object.values(level?.usual ?? {}));
  const prevStation = (s: SegmentWatch) => {
    const i = analysis.segments.indexOf(s);
    return analysis.segments.slice(0, i).reverse().find((x) => x.kind === "station") ?? null;
  };
  // Stations qui coûtent le plus : surcoût vs l'habituel du niveau (≥ 10 s/km), sinon coût brut vs la croisière.
  const costs = stationRunCosts(runLookup(analysis.segments), level);
  const rank = (c: StationRunCost) => c.excessS ?? c.costS;
  const costly = [...costs].sort((x, y) => rank(y) - rank(x))
    .filter((c) => (c.excessS != null ? c.excessS >= EXCESS_WARN_S : c.costS >= 15))
    .slice(0, 2);
  const cad = compared.map((r) => r.avgCadence).filter((x): x is number => x != null);
  const cruiseCad = (() => {
    const v = compared.filter((r) => r.key !== "run_8").map((r) => r.avgCadence).filter((x): x is number => x != null).sort((x, y) => x - y);
    return v.length >= 3 ? v[Math.floor(v.length / 2)] : null;
  })();
  const costlyRuns = costly.map((c) => runs.find((r) => r.key === c.run)).filter((x): x is SegmentWatch => x != null);
  const cadDown = cruiseCad != null && costlyRuns.some((r) => r.avgCadence != null && r.avgCadence <= cruiseCad - 4);
  const minCad = costlyRuns.map((r) => r.avgCadence).filter((x): x is number => x != null);

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
              <span style={{ ...LABEL, fontSize: 10 }}>Croisière {fmtPace(cruise)} (runs 2 à 7)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, alignItems: "end", height: 140 }}>
              {runs.map((r, i) => {
                const first = i === 0;
                const d = r.officialS - cruise;
                const m = median(r.key);
                const usual = level?.usual[r.key];
                const h = (x: number) => `${12 + (Math.max(0, x) / maxDelta) * 80}%`;
                return (
                  <div key={r.key} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                    <span style={{ ...MONO, fontSize: 10.5, color: first ? C.tx3 : d > 0 ? C.o : C.g }}>{first ? fmtPace(r.officialS) : `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`}</span>
                    <div title={[m != null ? `Médiane du niveau ${fmtPace(m)}` : null, usual != null ? `Habituel ${usual >= 0 ? "+" : "−"}${Math.abs(Math.round(usual))} s/km` : null].filter(Boolean).join(" · ") || undefined}
                      style={{
                        width: "70%", height: first ? "12%" : h(d), borderRadius: 4,
                        background: first ? "transparent" : hyroxPictoColor("course"),
                        border: first ? `1px dashed ${C.tx3}` : "none",
                        opacity: r.key === "run_8" ? 0.7 : 1,
                      }} />
                    {!first && usual != null && (
                      <span aria-hidden style={{ position: "absolute", left: "8%", right: "8%", bottom: h(usual), borderTop: `2px dotted ${C.tx}` }} />
                    )}
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
                      ? <span style={{ ...MONO, fontSize: 9.5, color: C.tx3, height: 14, lineHeight: "14px" }}>départ</span>
                      : st ? <HyroxPicto station={STATION_PICTO[st.key] ?? "autre"} size={14} title={st.label} /> : <span style={{ height: 14 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
              Sous chaque barre : la station juste avant. Écart à ta croisière (médiane des runs 2 à 7){level ? " ; pointillé = écart habituel des athlètes de ton niveau au même endroit" : ""}.
              Run 1 affiché sans comparaison (départ et longueur changent selon la course) ; run 8 en clair (arrivée parfois différente).
            </div>
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
          {costly.length > 0 && (
            <div style={{ ...CARD, padding: "12px 14px", borderColor: alpha(C.o, 0.5) }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Ce qui te coûte le plus : {costly.map((c) => STATION_META[c.station].label.toLowerCase()).join(" et ")}.</div>
              <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 4, lineHeight: 1.45 }}>
                Les runs qui suivent : {costly.map((c) => `+${c.costS} s/km${c.usualS != null ? ` (habituel ${c.usualS >= 0 ? "+" : "−"}${Math.abs(c.usualS)})` : ""}`).join(" et ")} par rapport à ta croisière
                {cadDown && minCad.length ? `, ta cadence descend jusqu'à ${Math.min(...minCad)} pas/min (croisière ${cruiseCad})` : ""}.
              </div>
            </div>
          )}
          <Sources>allures : {timeSource}{attribution ? ` · cadence, FC : ${attribution}` : ""}</Sources>
        </>
      )}
    </div>
  );
}
