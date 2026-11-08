import { useQuery } from "@tanstack/react-query";
import { computeOccurrences } from "@/lib/sessionOccurrence";
import { countSessionOccurrence, listSessionOccurrenceLogs } from "@/api/workouts";
import { planningKeys } from "@/api/planning";

/**
 * Occurrence (1-based) de la séance `sessionId` planifiée le `date` :
 * nombre de séances non « skipped » de cette séance jusqu'à cette date incluse.
 */
export function fetchSessionOccurrence(athleteId: string, sessionId: string, date: string): Promise<number> {
  return countSessionOccurrence(athleteId, sessionId, date);
}

export function useSessionOccurrence(
  athleteId: string | undefined,
  sessionId: string | undefined,
  date: string | undefined,
) {
  return useQuery({
    queryKey: planningKeys.occurrence(athleteId, sessionId, date),
    enabled: !!athleteId && !!sessionId && !!date,
    staleTime: 30_000,
    queryFn: () => countSessionOccurrence(athleteId!, sessionId!, date!),
  });
}

/** Occurrence de chaque log (par id) pour les séances données, jusqu'à `upTo` inclus. */
export async function fetchOccurrencesForSessions(
  athleteId: string,
  sessionIds: string[],
  upTo: string,
): Promise<Map<string, number>> {
  return computeOccurrences(await listSessionOccurrenceLogs(athleteId, sessionIds, upTo));
}
