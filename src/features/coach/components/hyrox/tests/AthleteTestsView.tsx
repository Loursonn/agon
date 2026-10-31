import { useMemo, useState } from "react";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { profileFromAthlete } from "@/lib/hyrox/tests";
import { useHyroxAnalyses, useHyroxAthleteProfile } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { ListSkeleton } from "@/features/shared/components/skeletons";
import AnalysisSheet from "./AnalysisSheet";
import BatteryPlan from "./BatteryPlan";
import { AnalysisRow } from "./TestsView";
import { Muted, SectionTitle } from "./ui";
import { previousOf, todayIso } from "./format";

/** Onglet Tests de l'athlète : sa semaine de tests et ses bilans validés par le coach. */
export default function AthleteTestsView() {
  const { athleteId, viewOnly } = useAthleteContext();
  const { data: athlete } = useHyroxAthleteProfile(athleteId);
  const { data: all = [], isLoading } = useHyroxAnalyses(athleteId);
  // La base ne renvoie à l'athlète que les analyses validées ; le filtre couvre aussi l'aperçu coach.
  const analyses = useMemo(() => all.filter(a => a.validated_at), [all]);
  const [openId, setOpenId] = useState<string | null>(null);
  const profile = useMemo(() => profileFromAthlete(athlete ?? {}, todayIso()).profile, [athlete]);

  const open = analyses.find(a => a.id === openId);
  if (open)
    return <AnalysisSheet analysis={open} previous={previousOf(analyses, open)} audience="athlete" athleteId={athleteId} onBack={() => setOpenId(null)} />;

  return (
    <div style={{ paddingTop: 4 }}>
      <SectionTitle>Mes bilans</SectionTitle>
      {isLoading ? <ListSkeleton rows={2} /> : analyses.length === 0 ? (
        <Muted>Ton bilan apparaîtra ici quand ton coach l'aura relu et validé.</Muted>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {analyses.map(a => <AnalysisRow key={a.id} a={a} onOpen={() => setOpenId(a.id)} />)}
        </div>
      )}
      <SectionTitle>Ma semaine de tests</SectionTitle>
      <Muted style={{ marginBottom: 10 }}>5 séances : lundi, mardi, jeudi, vendredi et dimanche (repos le mercredi et le samedi). À 4 séances par semaine, la séance 5 passe à la semaine suivante. Ouvre un test pour voir le protocole et ce qu'il faut filmer.</Muted>
      <BatteryPlan athleteId={athleteId} mode="athlete" readOnly={viewOnly} profile={profile} />
    </div>
  );
}
