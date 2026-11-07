/**
 * Adaptateurs React Query du module `src/api/wellness.ts` : aucune requête,
 * aucun calcul ici (score et paliers : `@shared/domain/wellness`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import type { WellnessEntry } from "@shared/domain/wellness";
import {
  deleteWellnessEntry,
  getWellnessHistories,
  getWellnessHistory,
  invalidateWellness,
  saveWellnessEntry,
  wellnessKeys,
  type WellnessRange,
} from "@/api/wellness";

export function useWellnessHistory(athleteId: string | null | undefined, range: WellnessRange = {}) {
  return useQuery({
    queryKey: wellnessKeys.history(athleteId ?? "", range),
    queryFn: () => getWellnessHistory(athleteId!, range),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

/** Plusieurs athlètes en une requête (accueil coach, alertes). */
export function useWellnessHistories(athleteIds: readonly string[], opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: wellnessKeys.many(athleteIds),
    queryFn: () => getWellnessHistories(athleteIds),
    enabled: athleteIds.length > 0 && opts.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useSaveWellnessEntry(athleteId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: WellnessEntry) => saveWellnessEntry(athleteId!, entry),
    onSettled: () => (athleteId ? invalidateWellness(qc, athleteId) : undefined),
  });
}

export function useDeleteWellnessEntry(athleteId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (day: IsoDay) => deleteWellnessEntry(athleteId!, day),
    onSettled: () => (athleteId ? invalidateWellness(qc, athleteId) : undefined),
  });
}
