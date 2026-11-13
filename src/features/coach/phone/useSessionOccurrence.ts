import { useSessionWeekLogs } from "@/features/coach/components/programmation/hooks/useSessionWeekLogs";
import type { Bloc, ExerciceParams, ProgSession } from "@/features/coach/components/programmation/types";
import { isWeekRecord, resolveExerciceParams, toMultiWeekSession } from "@/lib/sessionOccurrence";
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

/**
 * « Celle-ci et les suivantes » : la séance-type avec les blocs édités (params
 * à plat) écrits à l'occurrence `occurrence`. Ils valent jusqu'à la prochaine
 * occurrence qui a ses propres valeurs ; les occurrences d'avant gardent les
 * leurs. Structure (ordre, ajouts, retraits, noms) : celle des blocs édités.
 */
export function applyFromOccurrence(session: ProgSession, edited: Bloc[], occurrence: number): ProgSession {
  const base = toMultiWeekSession(session);
  const byId = new Map(base.blocs.flatMap((b) => b.exercices).map((ex) => [ex.id, ex]));
  const key = String(occurrence);
  return {
    ...base,
    nb_semaines: Math.max(base.nb_semaines ?? 1, occurrence),
    blocs: edited.map((b) => ({
      ...b,
      exercices: b.exercices.map((ex) => {
        const orig = byId.get(ex.id);
        // Consigne libre sans params, ou params déjà par occurrence : inchangés.
        if (!ex.params || isWeekRecord(ex.params)) return { ...ex, params: orig?.params ?? ex.params };
        const rec = orig && isWeekRecord(orig.params) ? orig.params : {};
        return { ...ex, params: { ...rec, [key]: ex.params as ExerciceParams } };
      }),
    })),
  };
}
