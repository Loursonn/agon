/**
 * Hooks React Query pour la banque de blocs spécifiques (src/api/specific.ts).
 * Banque privée par coach (RLS).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createSpecificBlock,
  deleteSpecificBlock,
  listSpecificBlocks,
  specificKeys,
  updateSpecificBlock,
  type CreateSpecificBlockInput,
  type SpecificBlockRow,
} from "@/api/specific";

const KEY = specificKeys.blocks;

export function useSpecificBlocks() {
  return useQuery<SpecificBlockRow[]>({
    queryKey: KEY,
    staleTime: 60_000,
    queryFn: listSpecificBlocks,
  });
}

export function useCreateSpecificBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSpecificBlockInput) => createSpecificBlock(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<SpecificBlockRow[]>(KEY);
      const optimistic: SpecificBlockRow = {
        id: `__optimistic_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...input,
      };
      qc.setQueryData<SpecificBlockRow[]>(KEY, (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(KEY, ctx.previous);
      toast.error("Erreur lors de l'enregistrement du bloc");
    },
    onSuccess: () => toast.success("Bloc enregistré dans la banque"),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSpecificBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<SpecificBlockRow> & { id: string }) => updateSpecificBlock(p),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<SpecificBlockRow[]>(KEY);
      qc.setQueryData<SpecificBlockRow[]>(KEY, (old = []) =>
        old.map((b) => (b.id === id ? { ...b, ...patch } : b))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(KEY, ctx.previous);
      toast.error("Erreur lors de la mise à jour du bloc");
    },
    onSuccess: () => toast.success("Bloc mis à jour"),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSpecificBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSpecificBlock(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<SpecificBlockRow[]>(KEY);
      qc.setQueryData<SpecificBlockRow[]>(KEY, (old = []) =>
        old.filter((b) => b.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(KEY, ctx.previous);
      toast.error("Erreur lors de la suppression du bloc");
    },
    onSuccess: () => toast.success("Bloc supprimé"),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
