import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { CARD, KICKER } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxRacePlans } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import type { RefLookup } from "@/lib/hyrox/calc";
import { CATEGORY_LABEL, raceCategory } from "@/lib/hyrox/categories";
import { effortProfile } from "@/lib/hyrox/effortProfile";
import { objectiveForRace } from "@/lib/hyrox/objective/forRace";
import { fmtClock } from "@/lib/seance";
import EffortProfile from "@/features/shared/components/hyrox/EffortProfile";

/**
 * Vue coach « Radar » : le profil d'effort d'une course, le même que le bloc 07
 * de Ma saison (décision d'Hugo du 16/11/2026) : rang dans toute la catégorie
 * et niveau contre l'objectif de la course, superposés.
 */
export default function HyroxRadarView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [] } = useHyroxResults(athleteId);
  const { data: plans = [] } = useHyroxRacePlans(athleteId);
  const { data: refRows = [] } = useHyroxReferences();
  const refs: RefLookup = useMemo(() => (d, s, b) => pickRef(refRows, d, s, b) ?? undefined, [refRows]);
  const finished = useMemo(() => races.filter((r) => r.status === "finished" && r.total_s > 0).sort((a, b) => b.date.localeCompare(a.date)), [races]);
  const [id, setId] = useState<string | null>(null);
  const race = finished.find((r) => r.id === id) ?? finished[0];

  if (!race) {
    return <div style={{ padding: 40, textAlign: "center", color: C.tx3, fontSize: 12 }}>Aucune course terminée pour afficher le profil d'effort.</div>;
  }
  const cat = raceCategory(race);
  const axes = effortProfile(race, refs, objectiveForRace(race, plans)?.objective.segments ?? null);

  return (
    <section aria-label="Profil d'effort" style={{ ...CARD, padding: 20, marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={KICKER}>Profil d'effort</span>
        <select value={race.id} onChange={(e) => setId(e.target.value)} aria-label="Course"
          style={{ minHeight: 36, borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, padding: "0 10px", fontFamily: "inherit", fontSize: 13 }}>
          {finished.map((r) => <option key={r.id} value={r.id}>{r.event_name} · {r.date} · {fmtClock(r.total_s)}</option>)}
        </select>
      </div>
      <span style={{ fontSize: 12.5, color: C.tx2 }}>Plus loin du centre = plus rapide · anneau du milieu = la médiane</span>
      <EffortProfile axes={axes} categoryLabel={CATEGORY_LABEL[cat] ?? cat} />
    </section>
  );
}
