import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getMorphoObservations, invalidateMorpho, morphoKeys, saveMorphoObservations } from "@/api/morpho";
import { EMPTY_OBSERVATIONS, type MorphoObservations } from "@/lib/morpho";

/** Observations morpho d'un athlète (lecture + enregistrement immédiat, optimiste). */
export function useMorphoObservations(athleteId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: morphoKeys.observations(athleteId),
    queryFn: () => getMorphoObservations(athleteId),
    enabled: !!athleteId,
  });
  const save = useMutation({
    mutationFn: (next: MorphoObservations) => saveMorphoObservations(athleteId, user!.id, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: morphoKeys.observations(athleteId) });
      qc.setQueryData(morphoKeys.observations(athleteId), next);
    },
    onError: (e: Error) => { toast.error(e.message); void invalidateMorpho(qc, athleteId); },
  });
  const obs = query.data ?? EMPTY_OBSERVATIONS;
  return { obs, update: (patch: Partial<MorphoObservations>) => save.mutate({ ...obs, ...patch }) };
}
