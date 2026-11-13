import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, type IsoDay } from "@shared/domain/dates";
import type { Light } from "@shared/domain/wellnessLight";
import type { ReviewAnswers, WeekSummary } from "@/lib/weekly-review";
import {
  getWeekSummary,
  getWeeklyReview,
  invalidateWeeklyReviews,
  listReviewsForWeek,
  listWeeklyReviews,
  saveWeeklyReview,
  weeklyReviewKeys,
  type WeeklyReview,
} from "@/api/weeklyReviews";

/** Review d'une semaine (`null` = pas commencée, ou brouillon invisible pour le coach). */
export function useWeeklyReview(athleteId: string | null | undefined, weekStart: IsoDay | null | undefined) {
  return useQuery({
    queryKey: weeklyReviewKeys.week(athleteId ?? "", weekStart ?? ""),
    queryFn: () => getWeeklyReview(athleteId!, weekStart!),
    enabled: Boolean(athleteId && weekStart),
    staleTime: 30_000,
  });
}

/** Review de la semaine d'avant (ses 3 engagements sont évalués cette semaine). */
export function usePreviousWeeklyReview(athleteId: string | null | undefined, weekStart: IsoDay | null | undefined) {
  return useWeeklyReview(athleteId, weekStart ? addDays(weekStart, -7) : null);
}

export function useWeeklyReviews(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: weeklyReviewKeys.list(athleteId ?? ""),
    queryFn: () => listWeeklyReviews(athleteId!),
    enabled: Boolean(athleteId),
    staleTime: 60_000,
  });
}

/** Bilan automatique recalculé (brouillon) ; après l'envoi, lire `review.auto`. */
export function useWeekSummary(athleteId: string | null | undefined, weekStart: IsoDay | null | undefined, enabled = true) {
  return useQuery<WeekSummary>({
    queryKey: weeklyReviewKeys.summary(athleteId ?? "", weekStart ?? ""),
    queryFn: () => getWeekSummary(athleteId!, weekStart!),
    enabled: enabled && Boolean(athleteId && weekStart),
    staleTime: 60_000,
  });
}

/** Liste du coach : reviews envoyées de la semaine pour ses athlètes. */
export function useCoachWeekReviews(athleteIds: readonly string[], weekStart: IsoDay) {
  return useQuery<WeeklyReview[]>({
    queryKey: weeklyReviewKeys.coachWeek(weekStart, athleteIds),
    queryFn: () => listReviewsForWeek(athleteIds, weekStart),
    enabled: athleteIds.length > 0,
    staleTime: 60_000,
  });
}

export function useSaveWeeklyReview(athleteId: string | null | undefined, weekStart: IsoDay | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { answers: ReviewAnswers; submit?: { auto: WeekSummary; light: Light | null } }) =>
      saveWeeklyReview(weekStart!, p.answers, p.submit),
    onSuccess: (row) => {
      if (!athleteId || !weekStart) return;
      qc.setQueryData(weeklyReviewKeys.week(athleteId, weekStart), row);
      if (row.status === "submitted") void invalidateWeeklyReviews(qc, athleteId);
    },
  });
}
