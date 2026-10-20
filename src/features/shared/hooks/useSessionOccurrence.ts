import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeOccurrences } from "@/lib/sessionOccurrence";

/**
 * Occurrence (1-based) de la séance `sessionId` planifiée le `date` :
 * nombre de workout_logs non « skipped » de cette séance jusqu'à cette date incluse.
 */
export async function fetchSessionOccurrence(
  athleteId: string,
  sessionId: string,
  date: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", athleteId)
    .eq("session_id", sessionId)
    .neq("status", "skipped")
    .lte("scheduled_date", date);
  if (error) throw error;
  return Math.max(count ?? 1, 1);
}

export function useSessionOccurrence(
  athleteId: string | undefined,
  sessionId: string | undefined,
  date: string | undefined,
) {
  return useQuery({
    queryKey: ["session-occurrence", athleteId, sessionId, date],
    enabled: !!athleteId && !!sessionId && !!date,
    staleTime: 30_000,
    queryFn: () => fetchSessionOccurrence(athleteId!, sessionId!, date!),
  });
}

/** Occurrence de chaque log (par id) pour les séances données, jusqu'à `upTo` inclus. */
export async function fetchOccurrencesForSessions(
  athleteId: string,
  sessionIds: string[],
  upTo: string,
): Promise<Map<string, number>> {
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  // Une requête par séance : reste loin de la limite de 1000 lignes de PostgREST
  const results = await Promise.all(ids.map(async (sid) => {
    const { data, error } = await supabase
      .from("workout_logs")
      .select("id, session_id, scheduled_date")
      .eq("athlete_id", athleteId)
      .eq("session_id", sid)
      .neq("status", "skipped")
      .lte("scheduled_date", upTo)
      .order("scheduled_date");
    if (error) throw error;
    return data ?? [];
  }));
  return computeOccurrences(results.flat());
}
