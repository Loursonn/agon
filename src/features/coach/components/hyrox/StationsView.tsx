import { useMemo } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxRacePlans } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { STATION_KEYS, STATION_META, DIVISION_LOADS, type HyroxResult } from "@/features/shared/types/hyrox";
import { roxzoneTotal } from "@/lib/hyrox/calc";
import { raceCategory } from "@/lib/hyrox/categories";
import { objectiveForRace } from "@/lib/hyrox/objective/forRace";
import { seasonLevers, seasonRaces } from "@/lib/hyrox/objective/seasonView";
import type { ObjectiveState } from "@/lib/hyrox/objective/vsObjective";
import { seasonOf } from "@/lib/hyrox/season";
import { fmtClock } from "@/lib/seance";
import { fmtGap, objectiveColor } from "@/features/shared/components/hyrox/raceAnalysisShared";

/**
 * Vue coach « Stations » (Q8, docs/HYROX_OBJECTIF_CONCEPTION.md) : chaque
 * station de la dernière course contre son objectif (plan, sinon run du jour),
 * en secondes et en % de l'objectif (100 = pile, au-delà = en avance), puis les
 * leviers de la saison (§9.4) à la place des priorités contre la médiane.
 */

const value = (r: HyroxResult, k: string): number | null => {
  if (k === "roxzone_total") return roxzoneTotal(r);
  const v = (r as unknown as Record<string, number | null | undefined>)[`${k}_s`];
  return typeof v === "number" && v > 0 ? v : null;
};
const stateColor = (s: ObjectiveState | null) => (s === "on" || s == null ? C.tx2 : objectiveColor(s));

export default function StationsView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const { data: plans = [] } = useHyroxRacePlans(athleteId);
  const finished = useMemo(() => races.filter((r) => r.status === "finished" && r.total_s > 0).sort((a, b) => b.date.localeCompare(a.date)), [races]);
  const latest = finished[0];
  const season = latest ? seasonOf(latest.date) : null;
  const levers = useMemo(() => (season ? seasonLevers(seasonRaces(races, plans, season.key)) : []), [races, plans, season]);

  if (isLoading) return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>;
  if (!latest) return <div style={{ padding: 40, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune course HYROX terminée.</div>;

  const cat = raceCategory(latest);
  const view = objectiveForRace(latest, plans);
  const loads = DIVISION_LOADS[cat] ?? {};
  const keys = [...STATION_KEYS, "roxzone_total"] as const;
  const official = finished.filter((r) => r.is_official && raceCategory(r) === cat);
  const cards = keys.map((k) => {
    const seg = view?.vs.segments.find((s) => s.key === k) ?? null;
    const actual = value(latest, k);
    const record = official.reduce<number | null>((m, r) => { const v = value(r, k); return v != null && (m == null || v < m) ? v : m; }, null);
    const spark = [...finished].reverse().map((r) => value(r, k)).filter((v): v is number => v != null);
    return {
      key: k,
      label: k === "roxzone_total" ? "Roxzone" : STATION_META[k].label,
      actual, record, spark,
      target: seg?.targetS ?? null,
      delta: seg?.deltaS ?? null,
      state: seg?.state ?? null,
      pct: actual != null && seg ? Math.round((seg.targetS / actual) * 100) : null,
      load: k === "roxzone_total" ? "" : (loads as Record<string, string>)[k] ?? "",
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={KICKER}>Stations · {latest.event_name}</span>
        <span style={{ fontSize: 12, color: C.tx3 }}>
          contre l'objectif {view?.objective.source === "plan" ? "du plan" : "du run du jour"} · 100 % = pile, au-delà = en avance
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {cards.map((s) => (
          <div key={s.key} style={{ ...CARD, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
              <span style={{ ...MONO, fontSize: 13, color: stateColor(s.state) }}>{s.pct != null ? `${s.pct} %` : "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...MONO, fontSize: 20 }}>{s.actual != null ? fmtClock(s.actual) : "—"}</span>
              <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>obj. {s.target != null ? fmtClock(s.target) : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ ...MONO, color: stateColor(s.state) }}>
                {s.delta == null ? "—" : s.delta === 0 ? "pile" : `${s.delta > 0 ? "+" : "−"}${fmtGap(s.delta)}`}
              </span>
              {s.record != null && s.record !== s.actual && <span style={{ ...MONO, color: C.tx3 }}>record {fmtClock(s.record)}</span>}
            </div>
            {s.spark.length > 1 && (
              <svg viewBox={`0 0 ${s.spark.length * 10} 20`} preserveAspectRatio="none" style={{ width: "100%", height: 20 }} aria-hidden="true">
                <polyline fill="none" stroke={alpha(C.tx2, 0.8)} strokeWidth={1.5}
                  points={s.spark.map((v, i) => {
                    const lo = Math.min(...s.spark);
                    const hi = Math.max(...s.spark);
                    return `${i * 10 + 5},${2 + ((v - lo) / (hi - lo || 1)) * 16}`;
                  }).join(" ")} />
              </svg>
            )}
            {s.load && <span style={{ fontSize: 11, color: C.tx3 }}>{s.load}</span>}
          </div>
        ))}
      </div>

      <section aria-label="Leviers de la saison" style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={KICKER}>Leviers de la {season?.label ?? "saison"}</span>
          <span style={{ fontSize: 12, color: C.tx3 }}>moyenne par course · récurrent dès 2 courses sur 3</span>
        </div>
        {levers.length === 0 ? <span style={{ fontSize: 13, color: C.tx3 }}>Aucun levier chiffré sur la saison.</span> : levers.map((l) => (
          <div key={l.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 12, alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${C.brd}` }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{l.label}{l.recurrent && <span style={{ ...LABEL, color: C.o, marginLeft: 8 }}>récurrent</span>}</span>
              {l.proposal && <span style={{ fontSize: 12, color: C.tx2 }}>{l.proposal}</span>}
            </span>
            <span style={{ fontSize: 12, color: C.tx3 }}>{l.group === "strategie" ? "Stratégie" : "Capacité"} · {l.count}/{l.of}</span>
            <span style={{ ...MONO, fontSize: 14 }}>−{fmtGap(l.avgS)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
