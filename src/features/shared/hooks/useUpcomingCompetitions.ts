import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { competitionKeys, listUpcomingCompetitions, type UpcomingCompetitionRow } from "@/api/competitions";
import { addDays, localIsoDay } from "@shared/domain/dates";

export interface UpcomingCompetition extends UpcomingCompetitionRow {
  athleteName: string;
}

/**
 * Compétitions de tous les athlètes suivis dans les `daysAhead` prochains jours,
 * par date croissante.
 */
export function useUpcomingCompetitions(daysAhead = 30) {
  const { athletes } = useAuth();
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const today = useMemo(() => localIsoDay(), []);
  const until = useMemo(() => addDays(today, daysAhead), [today, daysAhead]);

  const query = useQuery({
    queryKey: competitionKeys.upcoming(athleteIds, today, until),
    queryFn: () => listUpcomingCompetitions(athleteIds, today, until),
    enabled: athleteIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const competitions = useMemo<UpcomingCompetition[]>(() => {
    const names = new Map(athletes.map((a) => [a.id, a.full_name]));
    return (query.data ?? []).map((c) => ({ ...c, athleteName: names.get(c.athlete_id) ?? "—" }));
  }, [query.data, athletes]);

  return { competitions, isLoading: query.isLoading };
}
