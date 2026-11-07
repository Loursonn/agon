/**
 * Ancien nom de l'invalidation des séances, gardé pour les appelants pas
 * encore migrés. Toute la liste vit dans `invalidateWorkouts`
 * (src/api/workouts.ts) : c'est la seule à tenir à jour.
 */
import type { QueryClient } from "@tanstack/react-query";
import { invalidateWorkouts } from "@/api/workouts";

export function invalidateSessionStatus(qc: QueryClient, athleteId: string | null | undefined, workoutLogId?: string | null) {
  void invalidateWorkouts(qc, { athleteId, logId: workoutLogId });
}
