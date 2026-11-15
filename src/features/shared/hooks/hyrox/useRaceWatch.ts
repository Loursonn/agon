import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hyroxKeys, invalidateHyrox, linkRaceWatch, listRaceActivityCandidates } from "@/api/hyrox";
import { useActivityDetail } from "@/features/shared/hooks/useActivityDetail";
import { pickRaceActivity } from "@/lib/hyrox/raceWatch";
import type { HyroxResult } from "@/features/shared/types/hyrox";

/**
 * Série de la montre d'une course HYROX : l'activité liée à la course si
 * l'athlète ou le coach l'a choisie, sinon celle du même jour dont la durée
 * est la plus proche du chrono ; puis son détail (série, zones, attribution).
 */
export function useRaceWatch(race: HyroxResult | null, chosenId: string | null = null) {
  const athleteId = race?.athlete_id;
  const candidates = useQuery({
    queryKey: hyroxKeys.raceActivities(athleteId ?? "none", race?.date ?? ""),
    enabled: !!athleteId && !!race?.date,
    staleTime: 60_000,
    queryFn: () => listRaceActivityCandidates(athleteId!, race!.date),
  });
  const linkedId = race?.watch_activity_id ?? null;
  const picked = race && candidates.data ? pickRaceActivity(candidates.data, race.total_s) : null;
  // Choix en cours (pas encore enregistré) > lien enregistré > proposition d'office.
  const activityId = chosenId ?? linkedId ?? picked?.id ?? null;
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

/** Enregistre le lien course ↔ montre et le recalage (athlète ou coach). */
export function useLinkRaceWatch(race: HyroxResult) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, offsetS }: { activityId: string | null; offsetS: number | null }) => linkRaceWatch(race.id, activityId, offsetS),
    onSuccess: () => {
      void invalidateHyrox(qc, race.athlete_id);
      toast.success("Montre recalée sur la course");
    },
    onError: () => toast.error("Lien avec la montre non enregistré"),
  });
}
