import { STALE_MS } from "@/lib/queryCache";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, type IsoDay } from "@shared/domain/dates";
import type { Light } from "@shared/domain/wellnessLight";
import type { PainReport, ReviewAnswers, WeekSummary } from "@/lib/weekly-review";
import {
  getWeekPainReports,
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
    staleTime: STALE_MS,
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
    staleTime: STALE_MS,
  });
}

/** Bilan automatique recalculé (brouillon) ; après l'envoi, lire `review.auto`. */
export function useWeekSummary(athleteId: string | null | undefined, weekStart: IsoDay | null | undefined, enabled = true) {
  return useQuery<WeekSummary>({
    queryKey: weeklyReviewKeys.summary(athleteId ?? "", weekStart ?? ""),
    queryFn: () => getWeekSummary(athleteId!, weekStart!),
    enabled: enabled && Boolean(athleteId && weekStart),
    staleTime: STALE_MS,
  });
}

/** Douleurs saisies dans la semaine : déclenchent et nourrissent le bloc « Ta douleur ». */
export function useWeekPainReports(athleteId: string | null | undefined, weekStart: IsoDay | null | undefined, enabled = true) {
  return useQuery<PainReport[]>({
    queryKey: weeklyReviewKeys.pains(athleteId ?? "", weekStart ?? ""),
    queryFn: () => getWeekPainReports(athleteId!, weekStart!),
    enabled: enabled && Boolean(athleteId && weekStart),
    staleTime: STALE_MS,
  });
}

/** Liste du coach : reviews envoyées de la semaine pour ses athlètes. */
export function useCoachWeekReviews(athleteIds: readonly string[], weekStart: IsoDay) {
  return useQuery<WeeklyReview[]>({
    queryKey: weeklyReviewKeys.coachWeek(weekStart, athleteIds),
    queryFn: () => listReviewsForWeek(athleteIds, weekStart),
    enabled: athleteIds.length > 0,
    staleTime: STALE_MS,
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
