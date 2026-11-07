/**
 * Hooks React Query des références de performance — adaptateurs de
 * `src/api/references.ts`. Toute écriture invalide via `invalidateReferences`
 * (séances énergie, profil sportif, accueil coach, validations).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateReference,
  addMeasurement,
  deleteMeasurement,
  getActiveReferences,
  getMeasurements,
  getPerformanceReviews,
  getRecentMeasurements,
  invalidateReferences,
  referenceKeys,
  reviewMeasurement,
  saveFcZones,
  setReference,
  type NewMeasurement,
  type ReferenceInput,
} from "@/api/references";
import type { FcZoneKey } from "@shared/domain/performance";

export function useActiveReferences(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: referenceKeys.active(athleteId ?? ""),
    queryFn: () => getActiveReferences(athleteId!),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

export function useMeasurementHistory(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: referenceKeys.history(athleteId ?? ""),
    queryFn: () => getMeasurements(athleteId!),
    enabled: !!athleteId,
    staleTime: 30_000,
  });
}

export function useRecentMeasurements(athleteIds: string[], limit = 8) {
  return useQuery({
    queryKey: referenceKeys.recent(athleteIds, limit),
    queryFn: () => getRecentMeasurements(athleteIds, limit),
    enabled: athleteIds.length > 0,
    staleTime: 120_000,
    refetchOnWindowFocus: true,
  });
}

export function usePerformanceReviews(scope: { athleteId: string } | { coachId: string }) {
  const key = "athleteId" in scope ? referenceKeys.reviews(scope.athleteId) : referenceKeys.coachReviews(scope.coachId);
  const id = "athleteId" in scope ? scope.athleteId : scope.coachId;
  return useQuery({
    queryKey: key,
    queryFn: () => getPerformanceReviews(scope),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useAddMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: NewMeasurement) => addMeasurement(m),
    onSettled: (_r, _e, m) => invalidateReferences(qc, m.athleteId),
  });
}

export function useSetReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: ReferenceInput) => setReference(r),
    onSettled: (_r, _e, r) => invalidateReferences(qc, r.athleteId),
  });
}

export function useSaveFcZones(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (zones: Partial<Record<FcZoneKey, number>> | Record<string, number>) => saveFcZones(athleteId, zones),
    onSettled: () => invalidateReferences(qc, athleteId),
  });
}

export function useActivateReference(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ logId, metricName }: { logId: string; metricName: string }) =>
      activateReference(athleteId, logId, metricName),
    onSettled: () => invalidateReferences(qc, athleteId),
  });
}

export function useDeleteMeasurement(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMeasurement(id),
    onSettled: () => invalidateReferences(qc, athleteId),
  });
}

export function useReviewMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { notificationId: string; logId: string; athleteId: string; approve: boolean }) =>
      reviewMeasurement(v.notificationId, v.logId, v.approve),
    onSettled: (_r, _e, v) => invalidateReferences(qc, v.athleteId),
  });
}
