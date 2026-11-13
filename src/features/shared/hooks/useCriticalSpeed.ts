/** Vitesse critique de l'athlète : adaptateur React Query de `src/api/criticalSpeed.ts`. */
import { useQuery } from "@tanstack/react-query";
import { localIsoDay, type IsoDay } from "@shared/domain/dates";
import { criticalSpeedKeys, getAthleteCriticalSpeed, type AthleteCriticalSpeed } from "@/api/criticalSpeed";

export function useAthleteCriticalSpeed(athleteId: string | null | undefined, day: IsoDay = localIsoDay()) {
  return useQuery<AthleteCriticalSpeed>({
    queryKey: criticalSpeedKeys.current(athleteId ?? "", day),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
    queryFn: () => getAthleteCriticalSpeed(athleteId!, day),
  });
}
