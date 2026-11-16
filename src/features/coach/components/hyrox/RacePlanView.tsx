import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { CARD, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { ddmm } from "@/features/shared/components/hyrox/raceAnalysisShared";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useDeleteHyroxRacePlan, useHyroxRacePlans } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { competitionKeys, listCompetitions } from "@/api/competitions";
import type { HyroxRacePlan } from "@/features/shared/types/hyrox";
import { raceCategory } from "@/lib/hyrox/categories";
import { planSegments, planTotal } from "@/lib/hyrox/racePlan";
import { fmtClock } from "@/lib/seance";
import ObjectiveEditor from "./ObjectiveEditor";
import SeasonGoalsCard from "./SeasonGoalsCard";
import { categoryLabel, runText } from "./objectiveUi";

/**
 * Onglet « Objectif » (coach, docs/HYROX_OBJECTIF_CONCEPTION.md §8.3) :
 * l'objectif de saison (run moyen visé), puis un objectif par course HYROX,
 * construit depuis le run moyen par la grille du modèle. L'analyse de course
 * le lit (« Vs objectif », colonne Objectif, stratégie).
 */
export default function RacePlanView() {
  const { athleteId } = useAthleteContext();
  const { data: plans = [], isLoading } = useHyroxRacePlans(athleteId);
  const { data: races = [] } = useHyroxResults(athleteId);
  const { data: competitions = [] } = useQuery({
    queryKey: competitionKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listCompetitions(athleteId as string),
  });
  const del = useDeleteHyroxRacePlan(athleteId ?? "");
  const [editing, setEditing] = useState<HyroxRacePlan | "new" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const lastRace = races.find((r) => r.status === "finished");

  const linkName = (p: HyroxRacePlan) => {
    const c = competitions.find((x) => x.id === p.competition_id);
    if (c) return `${c.name} · ${ddmm(c.date)}`;
    const r = races.find((x) => x.id === p.result_id);
    return r ? `${r.event_name} · ${ddmm(r.date)}` : "Sans course rattachée";
  };

  if (editing && athleteId) {
    return <ObjectiveEditor athleteId={athleteId} plan={editing === "new" ? null : editing} competitions={competitions} races={races} onDone={() => setEditing(null)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16 }}>
      {athleteId && <SeasonGoalsCard athleteId={athleteId} defaultCategory={lastRace ? raceCategory(lastRace) : "women"} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={KICKER}><span style={{ color: C.ac }}>02 —</span> Objectifs de course</span>
        <button type="button" onClick={() => setEditing("new")} style={buttonStyle("primary")}><Plus size={14} /> Nouvel objectif</button>
      </div>
      {isLoading ? (
        <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
      ) : plans.length === 0 ? (
        <div style={{ ...CARD, padding: 18, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
          Aucun objectif de course. Choisis une compétition HYROX et un run moyen (ou un chrono visé) : Agon en tire les 17 cibles (runs, stations, Roxzone), tu ajustes ce que tu veux. L'analyse de la course compare ensuite le réalisé à l'objectif.
        </div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          {plans.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderTop: i ? `1px solid ${C.brd}` : "none", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>
                  {linkName(p)} · {categoryLabel(p.division)}{p.run_avg_s ? ` · run ${runText(p.run_avg_s)} /km` : ""}
                </div>
              </div>
              <span style={{ ...MONO, fontSize: 20 }}>{fmtClock(planTotal(planSegments(p.targets)))}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setEditing(p)} style={buttonStyle()}><Pencil size={14} /> Modifier</button>
                {confirm === p.id
                  ? <button type="button" onClick={() => del.mutate(p.id, { onSuccess: () => setConfirm(null) })} style={{ ...buttonStyle(), color: C.r, borderColor: C.r }}>Confirmer</button>
                  : <button type="button" onClick={() => setConfirm(p.id)} style={buttonStyle()} aria-label={`Supprimer ${p.name}`}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
