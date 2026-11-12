import { useQuery } from "@tanstack/react-query";
import { getHealthDays, healthKeys } from "@/api/health";
import { addDays, type IsoDay } from "@shared/domain/dates";

/** Résumés montre des 56 jours jusqu'à `day` : 28 jours affichés + 28 de zone habituelle. */
export function useHealthWindow(athleteId: string | null | undefined, day: IsoDay) {
  const from = addDays(day, -56);
  return useQuery({
    queryKey: healthKeys.days(athleteId ?? "", from, day),
    queryFn: () => getHealthDays(athleteId!, from, day),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
  });
}
