/** Feu du matin : adaptateur React Query de `src/api/wellnessLight.ts`. */
import { STALE_MS } from "@/lib/queryCache";
import { useQuery } from "@tanstack/react-query";
import { localIsoDay, type IsoDay } from "@shared/domain/dates";
import type { LightResult } from "@shared/domain/wellnessLight";
import { getWellnessLight, wellnessLightKeys } from "@/api/wellnessLight";

export function useWellnessLight(athleteId: string | null | undefined, day: IsoDay = localIsoDay()) {
  return useQuery<LightResult | null>({
    queryKey: wellnessLightKeys.day(athleteId ?? "", day),
    enabled: !!athleteId,
    staleTime: STALE_MS,
    queryFn: () => getWellnessLight(athleteId!, day),
  });
}
