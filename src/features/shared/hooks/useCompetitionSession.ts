import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateCompetitions, saveCompetitionSession, type CompetitionSessionInput } from "@/api/competitions";
import { listRaceActivityCandidates } from "@/api/hyrox";
import {
  confirmMatch, getCompetitionLink, invalidatePlanLinks, linkActivityToPlan, planLinkKeys, rejectMatch,
} from "@/api/plannedVsDone";
import { QK } from "@/lib/queryKeys";

/**
 * Séance de compétition du jour J : activités de la montre du jour (Garmin,
 * COROS, fichier), activité rattachée (choisie, ou proposée d'office en base
 * une fois la partie B appliquée, voir supabase/pending/README.md) et enregistrement.
 * Données de montre : affichées, jamais envoyées à une IA.
 */
export function useCompetitionSession(athleteId: string | null | undefined, competitionId: string, date: string, enabled = true) {
  const on = enabled && !!athleteId;
  const activities = useQuery({
    queryKey: planLinkKeys.dayActivities(athleteId ?? "none", date),
    enabled: on,
    staleTime: 60_000,
    queryFn: () => listRaceActivityCandidates(athleteId!, date),
  });
  const link = useQuery({
    queryKey: planLinkKeys.competition(athleteId ?? "none", competitionId),
    enabled: on,
    staleTime: 60_000,
    queryFn: () => getCompetitionLink(competitionId),
  });
  return {
    activities: activities.data ?? [],
    link: link.data ?? null,
    loading: activities.isLoading || link.isLoading,
    error: activities.error ?? link.error ?? null,
  };
}

export interface SaveCompetitionSessionArgs {
  athleteId: string;
  competitionId: string;
  input: CompetitionSessionInput;
  /** Activité retenue comme la course (`null` : aucune). */
  activityId: string | null;
  /** Lien actuel (proposé ou confirmé), pour savoir quoi changer. */
  current: { id: string; activityId: string; status: "auto" | "confirmed" | "rejected" } | null;
}

/** Enregistre la séance puis le choix de l'activité (confirmer, changer ou retirer). */
export function useSaveCompetitionSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ competitionId, input, activityId, current }: SaveCompetitionSessionArgs) => {
      await saveCompetitionSession(competitionId, input);
      if (current && current.activityId === activityId) {
        if (current.status === "auto") await confirmMatch(current.id);
        return;
      }
      // Autre activité, ou aucune : l'ancien lien est refusé (jamais reproposé).
      if (current) await rejectMatch(current.id);
      if (activityId) await linkActivityToPlan(activityId, "competition", competitionId);
    },
    onSuccess: () => toast.success("Séance de compétition enregistrée"),
    onError: () => toast.error("Séance de compétition non enregistrée — vérifie ta connexion"),
    onSettled: (_d, _e, { athleteId }) => {
      void invalidateCompetitions(qc, athleteId);
      void invalidatePlanLinks(qc, athleteId);
      void qc.invalidateQueries({ queryKey: QK.weeklyRetours() });
      void qc.invalidateQueries({ queryKey: QK.monthlyRetours() });
    },
  });
}
