import { useQuery } from "@tanstack/react-query";
import { energyKeys, getEnergyAssignment } from "@/api/energy";

/** Une séance d'énergie programmée (saisie de l'athlète comprise), lue par son id. */
export function useEnergyAssignment(athleteId: string | null | undefined, id: string | null | undefined) {
  return useQuery({
    queryKey: energyKeys.assignment(athleteId ?? "", id ?? ""),
    queryFn: () => getEnergyAssignment(id!),
    enabled: !!athleteId && !!id,
    staleTime: 60_000,
  });
}
