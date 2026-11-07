/**
 * usePrevWorkoutSets — previous performance per exercise per set index.
 *
 * Legacy sessions (id starts with "s_"):
 *   reads sets[`${exId}_${weekNumber - 1}`] from AthleteContext.sets
 *
 * New sessions (ProgSession UUID):
 *   queries the most recent PAST workout_log for the same session_id that
 *   actually holds data, and extracts athlete_modifications.sessionSets.
 *   Le statut "completed" n'est PAS requis : une séance réellement effectuée
 *   mais dont l'athlète n'a jamais cliqué "Terminer" reste une référence
 *   valable. Seules les séances "skipped" (volontairement non faites) et les
 *   séances sans aucune saisie sont ignorées.
 *
 * Returns Record<exId, string[]> — one "kg×reps" string per set index.
 * Format: "82,5×6" (comma as decimal, × as separator). "—" when missing.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPreviousLoggedWorkout, workoutKeys } from "@/api/workouts";
import { useAthleteContext } from "../context/AthleteContext";
import type { AthleteModifications, SessionSetLog } from "../types/athlete";

function formatSet(s: SessionSetLog | undefined): string {
  if (!s) return "—";
  const kg = s.kg != null ? String(s.kg).replace(".", ",") : null;
  const reps = s.reps != null ? String(s.reps) : null;
  if (kg && reps) return `${kg}×${reps}`;
  if (reps) return `×${reps}`;
  if (kg) return `${kg}kg`;
  return "—";
}

function isLegacy(sessionId: string | null): boolean {
  return !!sessionId && sessionId.startsWith("s_");
}

export function usePrevWorkoutSets(
  sessionId: string | null,
  currentLogId: string | null,
  exIds: string[],
  weekNumber: number,
  /** Date de la séance en cours — borne haute : on ne référence que le passé. */
  currentDate?: string | null,
): Record<string, string[]> {
  const { sets, athleteId } = useAthleteContext();
  const legacy = isLegacy(sessionId);

  // Dernière séance passée de la même séance-type qui contient réellement des
  // saisies (règle du cron) : une séance ouverte puis abandonnée sans rien
  // remplir ne masque pas la vraie référence.
  const { data: prevLog } = useQuery({
    queryKey: workoutKeys.previous(athleteId ?? "", sessionId ?? "", currentLogId, currentDate ?? null),
    enabled: !legacy && !!sessionId && !!athleteId,
    staleTime: 300_000,
    queryFn: () =>
      getPreviousLoggedWorkout({
        athleteId: athleteId!,
        sessionId: sessionId!,
        excludeId: currentLogId,
        onOrBefore: currentDate ?? null,
      }),
  });

  return useMemo(() => {
    const result: Record<string, string[]> = {};

    if (legacy) {
      const prevWeek = weekNumber - 1;
      for (const exId of exIds) {
        const key = `${exId}_${prevWeek}`;
        const rows = sets[key] ?? sets[exId] ?? [];
        result[exId] = rows.map((r) => {
          const kg = r.kg != null ? String(r.kg).replace(".", ",") : null;
          const reps = r.reps != null ? String(r.reps) : null;
          if (kg && reps) return `${kg}×${reps}`;
          if (reps) return `×${reps}`;
          if (kg) return `${kg}kg`;
          return "—";
        });
      }
    } else {
      const mods = prevLog?.athlete_modifications as AthleteModifications | null;
      const sessionSets = mods?.sessionSets ?? {};
      for (const exId of exIds) {
        const rows = sessionSets[exId] ?? [];
        result[exId] = rows.map(formatSet);
      }
    }

    return result;
  }, [legacy, sets, exIds, weekNumber, prevLog]);
}
