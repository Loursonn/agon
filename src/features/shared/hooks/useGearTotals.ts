import { useQuery } from "@tanstack/react-query";
import { getGearOutings, providerKeys } from "@/api/providers";
import { gearTotals } from "@/lib/gearTotals";

/** Kilométrage par matériel (chaussures, vélo) d'un athlète, d'après ses sorties. */
export function useGearTotals(athleteId: string | undefined) {
  return useQuery({
    queryKey: providerKeys.gear(athleteId ?? "none"),
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => gearTotals(await getGearOutings(athleteId!)),
  });
}
