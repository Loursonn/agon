import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateExercises, setGarminEquivalent } from "@/api/exercises";

/** Choisit (ou efface) l'équivalent Garmin d'un exercice de la banque. */
export function useSetGarminEquivalent() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; pick: { category: string; name: string } | null }>({
    mutationFn: ({ id, pick }) => setGarminEquivalent(id, pick),
    onSuccess: () => { void invalidateExercises(qc); },
  });
}
