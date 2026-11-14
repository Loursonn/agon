import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  coachRetourKeys, getWeeklyRetour, invalidateCoachRetours, listAthleteRetours, reactToRetour, upsertWeeklyRetour,
  type RetourReaction, type WeeklyRetour,
} from "@/api/coachRetours";

export type { RetourReaction, WeeklyRetour } from "@/api/coachRetours";

export const RETOUR_REACTIONS: { key: RetourReaction; emoji: string; label: string }[] = [
  { key: "like",   emoji: "👍", label: "Bien reçu" },
  { key: "strong", emoji: "💪", label: "Motivé" },
  { key: "fire",   emoji: "🔥", label: "À fond" },
  { key: "heart",  emoji: "❤️", label: "Merci" },
];

export function reactionEmoji(r: string | null | undefined): string | null {
  return RETOUR_REACTIONS.find((x) => x.key === r)?.emoji ?? null;
}

export function useWeeklyCoachRetour(athleteId: string | undefined, weekStart: string | undefined) {
  return useQuery<WeeklyRetour | null>({
    queryKey: coachRetourKeys.week(athleteId, weekStart),
    queryFn: () => getWeeklyRetour(athleteId!, weekStart!),
    enabled: !!athleteId && !!weekStart,
    staleTime: 60_000,
  });
}

/** Tous les retours de l'athlète, du plus récent au plus ancien. */
export function useAthleteRetours(athleteId: string | undefined) {
  return useQuery<WeeklyRetour[]>({
    queryKey: coachRetourKeys.list(athleteId),
    queryFn: () => listAthleteRetours(athleteId!),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

export function useReactWeeklyRetour() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ retourId, reaction }: { retourId: string; athleteId: string; reaction: RetourReaction }) =>
      reactToRetour(retourId, reaction),
    onMutate: async ({ retourId, athleteId, reaction }) => {
      const key = coachRetourKeys.list(athleteId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeeklyRetour[]>(key);
      qc.setQueryData<WeeklyRetour[]>(key, (old = []) =>
        old.map((r) => (r.id === retourId ? { ...r, athlete_reaction: reaction, reacted_at: new Date().toISOString() } : r)),
      );
      return { prev };
    },
    onError: (_err, vars, ctx) => {
      qc.setQueryData(coachRetourKeys.list(vars.athleteId), ctx?.prev);
    },
    onSettled: (_data, _err, vars) => invalidateCoachRetours(qc, vars.athleteId),
  });
}

export function useUpsertWeeklyRetour() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: upsertWeeklyRetour,
    onSuccess: (data) => {
      qc.setQueryData(coachRetourKeys.week(data.athlete_id, data.week_start), data);
      void invalidateCoachRetours(qc, data.athlete_id);
    },
  });
}
