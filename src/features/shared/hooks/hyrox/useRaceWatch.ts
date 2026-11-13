import { useQuery } from "@tanstack/react-query";
import { hyroxKeys, listRaceActivityCandidates } from "@/api/hyrox";
import { useActivityDetail } from "@/features/shared/hooks/useActivityDetail";
import { pickRaceActivity } from "@/lib/hyrox/raceWatch";
import type { HyroxResult } from "@/features/shared/types/hyrox";

/**
 * Série de la montre d'une course HYROX : activité du même jour dont la durée
 * est la plus proche du chrono, puis son détail (série, zones, attribution).
 */
export function useRaceWatch(race: HyroxResult | null) {
  const athleteId = race?.athlete_id;
  const candidates = useQuery({
    queryKey: hyroxKeys.raceActivities(athleteId ?? "none", race?.date ?? ""),
    enabled: !!athleteId && !!race?.date,
    staleTime: 60_000,
    queryFn: () => listRaceActivityCandidates(athleteId!, race!.date),
  });
  const picked = race && candidates.data ? pickRaceActivity(candidates.data, race.total_s) : null;
  const detail = useActivityDetail(athleteId, picked?.id);
  return {
    loading: candidates.isLoading || (!!picked && detail.isLoading),
    activityId: picked?.id ?? null,
    detail: detail.data ?? null,
    error: candidates.error ?? detail.error ?? null,
  };
}
