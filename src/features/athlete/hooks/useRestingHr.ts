import { useQuery } from "@tanstack/react-query";
import { getHealthDays, healthKeys } from "@/api/health";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { restingHrAverage } from "@/lib/athleteZones";

/** FC de repos : moyenne des 7 dernières nuits de la montre (14 jours lus). */
export function useRestingHr(athleteId: string | null | undefined) {
  const to = localIsoDay();
  const from = addDays(to, -13);
  return useQuery({
    queryKey: healthKeys.days(athleteId ?? "", from, to),
    queryFn: () => getHealthDays(athleteId!, from, to),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    select: (days) => restingHrAverage(days),
  });
}
