/**
 * useAthleteReferences — valeurs des références actives d'un athlète, pour le
 * module énergie : map nom canonique → valeur (ex. { VMA: 18.5, FCmax: 192,
 * FCzone_Z1_max: 120 }).
 *
 * Même requête (et même cache) que `useActiveReferences` : une référence
 * modifiée n'importe où rafraîchit tout de suite les séances énergie.
 */
import { useQuery } from "@tanstack/react-query";
import { getActiveReferences, referenceKeys, referenceValues } from "@/api/references";

export type AthleteReferences = Record<string, number>;

export function useAthleteReferences(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: referenceKeys.active(athleteId ?? ""),
    queryFn: () => getActiveReferences(athleteId!),
    enabled: !!athleteId,
    staleTime: 60_000,
    select: referenceValues,
  });
}
