import { useQuery } from "@tanstack/react-query";
import { competitionKeys, listCompetitions } from "@/api/competitions";
import { STALE_MS } from "@/lib/queryCache";

/** Toutes les compétitions d'un athlète (même clé que l'import HYROX : cache partagé). */
export function useCompetitionList(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: competitionKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: STALE_MS,
    queryFn: () => listCompetitions(athleteId as string),
  });
}
