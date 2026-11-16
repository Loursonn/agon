import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hyroxKeys, invalidateHyrox, linkRaceWatch, listRaceActivityCandidates } from "@/api/hyrox";
import { invalidateCompetitions } from "@/api/competitions";
import { getCompetitionLink, invalidatePlanLinks, planLinkKeys } from "@/api/plannedVsDone";
import { useActivityDetail } from "@/features/shared/hooks/useActivityDetail";
import { pickRaceActivity } from "@/lib/hyrox/raceWatch";
import type { HyroxResult } from "@/features/shared/types/hyrox";

/**
 * Série de la montre d'une course HYROX : l'activité liée à la course si
 * l'athlète ou le coach l'a choisie, sinon celle rattachée à sa compétition
 * (séance du jour J), sinon celle du même jour dont la durée est la plus
 * proche du chrono ; puis son détail (série, zones, attribution).
 */
export function useRaceWatch(race: HyroxResult | null, chosenId: string | null = null) {
  const athleteId = race?.athlete_id;
  const candidates = useQuery({
    queryKey: hyroxKeys.raceActivities(athleteId ?? "none", race?.date ?? ""),
    enabled: !!athleteId && !!race?.date,
    staleTime: 60_000,
    queryFn: () => listRaceActivityCandidates(athleteId!, race!.date),
  });
  const competitionId = race?.competition_id ?? null;
  const compLink = useQuery({
    queryKey: planLinkKeys.competition(athleteId ?? "none", competitionId ?? "none"),
    enabled: !!athleteId && !!competitionId && !race?.watch_activity_id,
    staleTime: 60_000,
    queryFn: () => getCompetitionLink(competitionId!),
  });
  const linkedId = race?.watch_activity_id ?? null;
  const picked = race && candidates.data ? pickRaceActivity(candidates.data, race.total_s) : null;
  // Choix en cours (pas encore enregistré) > lien enregistré > activité de la
  // compétition > proposition d'office.
  const fromCompetition = compLink.data && candidates.data?.some((c) => c.id === compLink.data!.activityId) ? compLink.data.activityId : null;
  const activityId = chosenId ?? linkedId ?? fromCompetition ?? picked?.id ?? null;
  const detail = useActivityDetail(athleteId, activityId ?? undefined);
  return {
    loading: candidates.isLoading || (!!activityId && detail.isLoading),
    activityId,
    /** Lien enregistré (true) ou proposition d'office (false). */
    linked: linkedId != null,
    candidates: candidates.data ?? [],
    detail: detail.data ?? null,
    error: candidates.error ?? detail.error ?? null,
  };
}

/**
 * Enregistre le lien course ↔ montre et le recalage (athlète ou coach). La
 * compétition de la course suit en base (trigger `hyrox_results_race_watch`).
 */
export function useLinkRaceWatch(race: HyroxResult) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, offsetS }: { activityId: string | null; offsetS: number | null }) => linkRaceWatch(race.id, activityId, offsetS),
    onSuccess: () => {
      void invalidateHyrox(qc, race.athlete_id);
      if (race.competition_id) {
        void invalidatePlanLinks(qc, race.athlete_id);
        void invalidateCompetitions(qc, race.athlete_id);
      }
      toast.success("Montre recalée sur la course");
    },
    onError: () => toast.error("Lien avec la montre non enregistré"),
  });
}
