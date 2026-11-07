import { supabase } from "@/integrations/supabase/client";

/**
 * Séances réalisées (`workout_logs`).
 *
 * Premier morceau de la couche `src/api/` (voir docs/COUCHE_API.md) : la
 * suppression liée à la planification.
 */

/**
 * Une séance est « réelle » dès que l'athlète y a laissé une trace : validée,
 * saisie commencée (`athlete_modifications`) ou RPE donné. Une opération de
 * planification (raccourcir, déplacer ou supprimer un cycle) ne doit jamais
 * l'effacer : le 2026-11-07, 38 séances réelles rattachées à une semaine de
 * cycle étaient exposées à cette suppression.
 *
 * Les séances gardées perdent seulement leur rattachement à la semaine
 * supprimée (`microcycle_id` → NULL par la clé étrangère `ON DELETE SET NULL`).
 */
export type PlannedWorkoutScope =
  | { microcycleIds: string[] }
  | { athleteId: string; after: string; until: string };

export async function deletePlannedWorkouts(scope: PlannedWorkoutScope): Promise<void> {
  if ("microcycleIds" in scope && scope.microcycleIds.length === 0) return;
  let query = supabase.from("workout_logs").delete();
  if ("microcycleIds" in scope) {
    query = query.in("microcycle_id", scope.microcycleIds);
  } else {
    query = query
      .eq("athlete_id", scope.athleteId)
      .gt("scheduled_date", scope.after)
      .lte("scheduled_date", scope.until);
  }
  const { error } = await query
    .neq("status", "completed")
    .is("athlete_modifications", null)
    .is("rpe_score", null);
  if (error) throw new Error(`Suppression des séances prévues impossible : ${error.message}`);
}
