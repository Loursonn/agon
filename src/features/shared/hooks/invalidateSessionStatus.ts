/**
 * Rafraîchit tous les écrans qui affichent le statut d'une séance d'un athlète
 * (validée / réouverte / annulée) : détail, semaine, accueil, calendriers,
 * bandeau « séance non terminée », planning coach.
 *
 * Sans ça, une séance réouverte restait affichée « validée » ailleurs jusqu'à
 * l'expiration du cache (et inversement).
 */
import type { QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";

export function invalidateSessionStatus(qc: QueryClient, athleteId: string | null | undefined, workoutLogId?: string | null) {
  if (workoutLogId) qc.invalidateQueries({ queryKey: ["workout-log-detail", workoutLogId] });
  qc.invalidateQueries({ queryKey: ["unfinished-workouts"] });
  qc.invalidateQueries({ queryKey: ["coach_missed"] });
  if (!athleteId) return;
  qc.invalidateQueries({ queryKey: ["workout-logs-week", athleteId] });
  qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) });
  qc.invalidateQueries({ queryKey: ["cal", athleteId] });
  qc.invalidateQueries({ queryKey: ["calendar-events", athleteId] });
  qc.invalidateQueries({ queryKey: ["week-schedule", athleteId] });
  qc.invalidateQueries({ queryKey: QK.athleteModifications(athleteId) });
  qc.invalidateQueries({ queryKey: QK.energyAssignments(athleteId) });
}
