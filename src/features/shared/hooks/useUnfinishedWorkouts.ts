/**
 * useUnfinishedWorkouts — séances passées contenant des saisies de l'athlète
 * mais jamais clôturées ("Terminer la séance" non cliqué).
 *
 * Les données sont bien enregistrées (autosave), mais tant que le statut reste
 * "planned" la séance n'apparaît ni dans l'historique ni dans les stats.
 * Côté athlète : bandeau de rappel. Côté coach : liste de relance.
 * « Saisie » = même règle que le cron de nuit (`hasLoggedEntries`).
 */
import { useQuery } from "@tanstack/react-query";
import { listUnfinishedWorkouts, workoutKeys, type UnfinishedWorkout } from "@/api/workouts";

export type { UnfinishedWorkout };

/**
 * @param athleteIds un ou plusieurs athlètes. Vue athlète : son seul id.
 *                   Vue coach : tous ses athlètes.
 */
export function useUnfinishedWorkouts(athleteIds: string[] | string | null | undefined) {
  const ids = (Array.isArray(athleteIds) ? athleteIds : athleteIds ? [athleteIds] : [])
    .filter(Boolean)
    .sort();

  return useQuery({
    queryKey: workoutKeys.unfinished(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: () => listUnfinishedWorkouts(ids),
  });
}
