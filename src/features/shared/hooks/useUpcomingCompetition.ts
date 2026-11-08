import { useQuery } from "@tanstack/react-query";
import { competitionKeys, getNextCompetition, type UpcomingCompetitionRow } from "@/api/competitions";

export type UpcomingAthleteCompetition = UpcomingCompetitionRow;

/**
 * Prochaine compétition d'un athlète (aujourd'hui compris), ou `null`.
 */
export function useUpcomingCompetition(athleteId: string) {
  return useQuery<UpcomingAthleteCompetition | null>({
    queryKey: competitionKeys.next(athleteId),
    queryFn: () => getNextCompetition(athleteId),
    enabled: !!athleteId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
