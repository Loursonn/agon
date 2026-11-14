import type { WorkoutLog } from "@/api/workouts";

export interface YesterdayWorkout {
  id: string;
  name: string;
  /** « 4 exercices · 14 séries · RPE 8 » : seulement ce qui est connu. */
  detail: string | null;
}

/**
 * Séance de la veille à afficher : la terminée d'abord, sinon la commencée ;
 * à égalité, celle qui a le plus de séries faites.
 */
export function yesterdayWorkoutOf(logs: readonly WorkoutLog[]): YesterdayWorkout | null {
  const scored = logs.map((l) => {
    const sets = Object.values(l.athlete_modifications?.sessionSets ?? {});
    const done = sets.reduce((n, rows) => n + rows.filter((r) => r.done && !r.skipped).length, 0);
    const exercises = sets.filter((rows) => rows.some((r) => r.done && !r.skipped)).length;
    return { l, done, exercises };
  });
  scored.sort((a, b) => Number(b.l.status === "completed") - Number(a.l.status === "completed") || b.done - a.done);
  const best = scored[0];
  if (!best) return null;
  const parts: string[] = [];
  if (best.exercises > 0) parts.push(`${best.exercises} exercice${best.exercises > 1 ? "s" : ""}`);
  if (best.done > 0) parts.push(`${best.done} série${best.done > 1 ? "s" : ""}`);
  if (best.l.rpe_score != null) parts.push(`RPE ${String(best.l.rpe_score).replace(".", ",")}`);
  return { id: best.l.id, name: best.l.session_name.trim() || "Séance", detail: parts.length ? parts.join(" · ") : null };
}
