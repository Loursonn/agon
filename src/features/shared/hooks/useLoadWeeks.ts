/** Charge YOXX : adaptateur React Query de `src/api/load.ts`. */
import { STALE_MS } from "@/lib/queryCache";
import { useQuery } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import { getLoadWeeks, loadKeys } from "@/api/load";
import type { LoadWeeks } from "@/lib/trainingLoadWeek";

export function useLoadWeeks(athleteId: string | null | undefined, lastMonday: IsoDay, count = 6) {
  return useQuery<LoadWeeks>({
    queryKey: loadKeys.weeks(athleteId ?? "", lastMonday, count),
    enabled: !!athleteId,
    staleTime: STALE_MS,
    queryFn: () => getLoadWeeks(athleteId!, lastMonday, count),
  });
}
