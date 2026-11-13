/** Charge YOXX : adaptateur React Query de `src/api/load.ts`. */
import { useQuery } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import { getLoadWeeks, loadKeys } from "@/api/load";
import type { LoadWeeks } from "@/lib/trainingLoadWeek";

export function useLoadWeeks(athleteId: string | null | undefined, lastMonday: IsoDay, count = 6) {
  return useQuery<LoadWeeks>({
    queryKey: loadKeys.weeks(athleteId ?? "", lastMonday, count),
    enabled: !!athleteId,
    staleTime: 60_000,
    queryFn: () => getLoadWeeks(athleteId!, lastMonday, count),
  });
}
