/**
 * Hooks React Query pour la banque de méthodes d'entraînement (src/api/methods.ts).
 * Mutations avec optimistic updates + rollback sur erreur.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createTrainingMethod,
  deleteTrainingMethod,
  filterTrainingMethods,
  invalidateMethods,
  listTrainingMethods,
  methodKeys,
  updateTrainingMethod,
  type CreateTrainingMethodInput,
  type TrainingMethodFilters,
  type UpdateTrainingMethodInput,
} from "@/api/methods";
import type { TrainingMethod } from "@/types/trainingMethods";

export type { CreateTrainingMethodInput, TrainingMethodFilters, UpdateTrainingMethodInput };

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Une seule requête pour toute la banque ; les filtres s'appliquent à l'affichage. */
export function useTrainingMethods(filters?: TrainingMethodFilters) {
  return useQuery<TrainingMethod[]>({
    queryKey: methodKeys.list,
    queryFn: listTrainingMethods,
    staleTime: 60_000,
    select: (data) => filterTrainingMethods(data, filters),
  });
}

type Ctx = { prev: TrainingMethod[] | undefined };

function useOptimistic() {
  const qc = useQueryClient();
  return {
    qc,
    apply: async (fn: (old: TrainingMethod[]) => TrainingMethod[]): Promise<Ctx> => {
      await qc.cancelQueries({ queryKey: methodKeys.all });
      const prev = qc.getQueryData<TrainingMethod[]>(methodKeys.list);
      qc.setQueryData<TrainingMethod[]>(methodKeys.list, (old) => fn(old ?? []));
      return { prev };
    },
    rollback: (ctx: Ctx | undefined) => {
      if (ctx) qc.setQueryData(methodKeys.list, ctx.prev);
    },
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateTrainingMethod() {
  const { qc, apply, rollback } = useOptimistic();
  return useMutation({
    mutationFn: createTrainingMethod,
    onMutate: (input) => {
      const optimistic: TrainingMethod = {
        ...input,
        id: `optimistic-${Date.now()}`,
        is_official: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return apply((old) => [optimistic, ...old]);
    },
    onError: (_err, _vars, ctx) => {
      rollback(ctx);
      toast.error("Erreur lors de la création de la méthode");
    },
    onSuccess: (method) => {
      toast.success(`Méthode "${method.name}" créée`);
    },
    onSettled: () => invalidateMethods(qc),
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateTrainingMethod() {
  const { qc, apply, rollback } = useOptimistic();
  return useMutation({
    mutationFn: updateTrainingMethod,
    onMutate: ({ id, ...updates }) =>
      apply((old) => old.map((m) => (m.id === id ? { ...m, ...updates, updated_at: new Date().toISOString() } : m))),
    onError: (_err, _vars, ctx) => {
      rollback(ctx);
      toast.error("Erreur lors de la mise à jour de la méthode");
    },
    onSuccess: (method) => {
      toast.success(`Méthode "${method.name}" mise à jour`);
    },
    onSettled: () => invalidateMethods(qc),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteTrainingMethod() {
  const { qc, apply, rollback } = useOptimistic();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteTrainingMethod(id);
      return id;
    },
    onMutate: (id) => apply((old) => old.filter((m) => m.id !== id)),
    onError: (_err, _vars, ctx) => {
      rollback(ctx);
      toast.error("Erreur lors de la suppression de la méthode");
    },
    onSuccess: () => {
      toast.success("Méthode supprimée");
    },
    onSettled: () => invalidateMethods(qc),
  });
}

// ─── Duplicate ────────────────────────────────────────────────────────────────

export function useDuplicateTrainingMethod() {
  const create = useCreateTrainingMethod();

  return useMutation({
    mutationFn: async (method: TrainingMethod) => {
      return create.mutateAsync({
        name:        `${method.name} (copie)`,
        description: method.description,
        scope:       method.scope,
        category:    method.category,
        config:      method.config,
        created_by:  method.created_by,
        tags:        method.tags,
      });
    },
  });
}
