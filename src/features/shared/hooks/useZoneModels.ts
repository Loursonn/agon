/**
 * Modèles de zones FC d'un athlète : adaptateurs React Query de
 * `src/api/zoneModels.ts`. Écritures réservées au coach (la base vérifie).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyZoneModelToPast, decideZoneModel, getBoundsAt, getZoneModels, invalidateZoneModels, saveZoneModel,
  zoneModelKeys, type BoundsAt, type ZoneModelRow,
} from "@/api/zoneModels";
import { invalidateActivityDetail } from "@/api/activityDetail";
import { invalidatePlanLinks } from "@/api/plannedVsDone";
import type { QueryClient } from "@tanstack/react-query";
import type { ZoneModelKind } from "@shared/domain/hrZones";
import type { IsoDay } from "@shared/domain/dates";

export type { ZoneModelRow } from "@/api/zoneModels";

/** Modèles, bornes datées, puis tout ce qui affiche des zones (séance, planning). */
function refreshAll(qc: QueryClient, athleteId: string) {
  return Promise.all([invalidateZoneModels(qc, athleteId), invalidateActivityDetail(qc, athleteId), invalidatePlanLinks(qc, athleteId)]);
}

export function useZoneModels(athleteId: string | null | undefined) {
  return useQuery<ZoneModelRow[]>({
    queryKey: zoneModelKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getZoneModels(athleteId!),
  });
}

/** Bornes valides à une date (y compris le 5 zones lu dans les références). */
export function useZoneBoundsAt(athleteId: string | null | undefined, day: IsoDay) {
  return useQuery<BoundsAt | null>({
    queryKey: zoneModelKeys.boundsAt(athleteId ?? "", day),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getBoundsAt(athleteId!, day),
  });
}

export function useSaveZoneModel(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: ZoneModelKind; bounds: number[]; validFrom: IsoDay }) =>
      saveZoneModel(athleteId, v.kind, v.bounds, v.validFrom),
    onSettled: () => refreshAll(qc, athleteId),
  });
}

export function useDecideZoneModel(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => decideZoneModel(v.id, v.accept),
    onSettled: () => refreshAll(qc, athleteId),
  });
}

export function useApplyZoneModelToPast(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applyZoneModelToPast(id),
    onSettled: () => refreshAll(qc, athleteId),
  });
}
