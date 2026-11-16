import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateCompetitions, saveCompetitionSession, type CompetitionSessionInput } from "@/api/competitions";
import { invalidateActivityDetail } from "@/api/activityDetail";
import { invalidateHyrox, listRaceActivityCandidates } from "@/api/hyrox";
import {
  confirmMatch, getCompetitionLink, invalidatePlanLinks, linkActivityToPlan, planLinkKeys, rejectMatch,
} from "@/api/plannedVsDone";
import { QK } from "@/lib/queryKeys";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Séance de compétition du jour J : activités de la montre du jour (Garmin,
 * COROS, fichier), activité rattachée (choisie, ou proposée d'office en base)
 * et enregistrement. Le lien alimente aussi l'analyse de course HYROX (trigger
 * `activity_plan_links_race_watch`, 20261116224500), et inversement.
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

export type CompetitionLinkState = { id: string; activityId: string; status: "auto" | "confirmed" | "rejected" } | null;

/**
 * Applique le choix de l'activité : confirmer la proposition, changer
 * d'activité (l'ancien lien est refusé, jamais reproposé) ou n'en retenir aucune.
 */
export async function applyCompetitionLink(competitionId: string, activityId: string | null, current: CompetitionLinkState): Promise<void> {
  if (current && current.activityId === activityId) {
    if (current.status === "auto") await confirmMatch(current.id);
    return;
  }
  if (current && current.status !== "rejected") await rejectMatch(current.id);
  if (activityId) await linkActivityToPlan(activityId, "competition", competitionId);
}

/** Lien compétition ↔ montre changé : planning, retours, HYROX, séance. */
function invalidateCompetitionWatch(qc: QueryClient, athleteId: string): void {
  void invalidateCompetitions(qc, athleteId);
  void invalidatePlanLinks(qc, athleteId);
  void invalidateHyrox(qc, athleteId);
  void invalidateActivityDetail(qc, athleteId);
  void qc.invalidateQueries({ queryKey: QK.weeklyRetours() });
  void qc.invalidateQueries({ queryKey: QK.monthlyRetours() });
}

export interface SaveCompetitionSessionArgs {
  athleteId: string;
  competitionId: string;
  input: CompetitionSessionInput;
  /** Activité retenue comme la course (`null` : aucune). */
  activityId: string | null;
  /** Lien actuel (proposé ou confirmé), pour savoir quoi changer. */
  current: CompetitionLinkState;
}

/** Enregistre la séance puis le choix de l'activité (confirmer, changer ou retirer). */
export function useSaveCompetitionSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ competitionId, input, activityId, current }: SaveCompetitionSessionArgs) => {
      await saveCompetitionSession(competitionId, input);
      await applyCompetitionLink(competitionId, activityId, current);
    },
    onSuccess: () => toast.success("Séance de compétition enregistrée"),
    onError: () => toast.error("Séance de compétition non enregistrée — vérifie ta connexion"),
    onSettled: (_d, _e, { athleteId }) => invalidateCompetitionWatch(qc, athleteId),
  });
}

export interface LinkCompetitionWatchArgs {
  athleteId: string;
  competitionId: string;
  activityId: string | null;
  current: CompetitionLinkState;
}

/** Choisit (ou confirme) la sortie de la montre de la compétition, athlète ou coach. */
export function useLinkCompetitionWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ competitionId, activityId, current }: LinkCompetitionWatchArgs) => applyCompetitionLink(competitionId, activityId, current),
    onSuccess: (_d, { activityId }) => toast.success(activityId ? "Sortie de la montre liée à la compétition" : "Sortie de la montre retirée"),
    onError: () => toast.error("Lien avec la montre non enregistré — vérifie ta connexion"),
    onSettled: (_d, _e, { athleteId }) => invalidateCompetitionWatch(qc, athleteId),
  });
}
