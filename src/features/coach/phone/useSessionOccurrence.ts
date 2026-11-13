import { useSessionWeekLogs } from "@/features/coach/components/programmation/hooks/useSessionWeekLogs";
import type { Bloc } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams } from "@/lib/sessionOccurrence";
import { localIsoDay } from "@shared/domain/dates";

/**
 * Occurrence d'une séance-type à une date : le log de ce jour (s'il existe
 * en base) et son rang (1re, 2e… fois planifiée). Sans log ce jour-là
 * (occurrence virtuelle d'un bloc récurrent), le rang est celui qu'elle
 * prendra : nombre de séances planifiées avant + 1.
 */
export function useSessionOccurrence(athleteId: string | undefined, sessionId: string, date: string | null) {
  const weekLogs = useSessionWeekLogs(athleteId, sessionId);
  const { logs } = weekLogs;
  // Sans date : la prochaine occurrence à venir (aujourd'hui compris).
  const day = date ?? localIsoDay();
  const log = date
    ? logs.find((l) => l.scheduledDate === date) ?? null
    : [...logs].filter((l) => l.scheduledDate >= day).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null;
  const occurrence = log?.weekNumber ?? logs.filter((l) => l.scheduledDate < day).length + 1;
  const override = log?.athleteModifications?.coachOverride?.blocs?.length ? log.athleteModifications.coachOverride : null;
  return { ...weekLogs, log, occurrence, override };
}

/**
 * Blocs d'une seule occurrence (params à plat), base d'une adaptation
 * « cette séance » (même forme que workout_logs…coachOverride.blocs).
 */
export function flattenBlocs(blocs: Bloc[], occurrence: number): Bloc[] {
  return blocs.map((b) => ({
    ...b,
    exercices: b.exercices.map((ex) => {
      const p = resolveExerciceParams(ex.params, occurrence);
      return p ? { ...ex, params: structuredClone(p) } : { ...ex };
    }),
  }));
}
