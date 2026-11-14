import { useNavigate } from "react-router-dom";
import { associableOf, type PlanningCardModel } from "@/lib/planningCard";
import type { PlannedVsDoneDay } from "@/lib/plannedVsDone";
import { usePlanLinkDecision } from "@/features/shared/hooks/usePlannedVsDone";
import { PlanningSessionCard } from "./PlanningSessionCard";

interface Props {
  card: PlanningCardModel;
  /** Jour du planning (séances auxquelles associer une activité libre). */
  day: PlannedVsDoneDay | undefined;
  athleteId: string;
  /** Chemin de l'onglet Séance pour une activité. */
  seancePath: (activityId: string) => string;
  narrow?: boolean;
}

/** Carte du planning branchée : ouvre l'onglet Séance, confirme, refuse, associe. */
export function WatchCard({ card, day, athleteId, seancePath, narrow }: Props) {
  const navigate = useNavigate();
  const decide = usePlanLinkDecision(athleteId);
  return (
    <PlanningSessionCard
      card={card}
      narrow={narrow}
      busy={decide.isPending}
      onOpen={(id) => navigate(seancePath(id))}
      onConfirm={(linkId) => decide.mutate({ type: "confirm", linkId })}
      onReject={(linkId) => decide.mutate({ type: "reject", linkId })}
      associable={associableOf(day).map((p) => ({ kind: p.kind, id: p.id, label: p.label }))}
      onAssociate={(activityId, s) => decide.mutate({ type: "associate", activityId, kind: s.kind, plannedId: s.id })}
    />
  );
}
