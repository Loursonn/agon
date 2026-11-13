import { useQuery } from "@tanstack/react-query";
import { getHealthDays, healthKeys } from "@/api/health";
import { localIsoDay } from "@shared/domain/dates";
import { watchSleepOf } from "@/lib/watchSleep";

/** Nuit de la montre pour aujourd'hui (jour du réveil), null sans montre. */
export function useWatchSleep(athleteId: string | null | undefined) {
  const day = localIsoDay();
  return useQuery({
    queryKey: healthKeys.days(athleteId ?? "", day, day),
    queryFn: () => getHealthDays(athleteId!, day, day),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    select: (days) => watchSleepOf(days, day),
  });
}
