/**
 * Hooks React Query pour le module Roadmap (adaptateurs de `src/api/appContent.ts`).
 * Tables : roadmap_phases, roadmap_items, roadmap_votes
 *
 * Accès : is_certified_coach OU is_admin (géré côté RLS).
 * Mutations admin uniquement pour phases ; coaches peuvent suggérer des items (status='idea').
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  appContentKeys, createRoadmapItem, createRoadmapPhase, deleteRoadmapItem, deleteRoadmapPhase, invalidateRoadmap,
  listMyRoadmapVotes, listRoadmapItems, listRoadmapPhases, roadmapVoteCounts, toggleRoadmapVote, updateRoadmapItem,
  updateRoadmapPhase,
} from "@/api/appContent";
import type { RoadmapPhase, RoadmapItem, RoadmapPhaseStatus } from "@/features/coach/types/roadmap";

export type { CreateItemInput, CreatePhaseInput, UpdateItemInput, UpdatePhaseInput } from "@/api/appContent";

const K = appContentKeys;

// ─── Phases ───────────────────────────────────────────────────────────────────

export function useRoadmapPhases() {
  return useQuery<RoadmapPhase[]>({
    queryKey: K.roadmapPhases,
    queryFn:  listRoadmapPhases,
    staleTime: 60_000,
  });
}

// ─── Items (toutes phases) ────────────────────────────────────────────────────

export function useRoadmapItems() {
  return useQuery<RoadmapItem[]>({
    queryKey: K.roadmapItems,
    queryFn:  listRoadmapItems,
    staleTime: 30_000,
  });
}

// ─── Votes (de l'utilisateur courant) ─────────────────────────────────────────

export function useMyRoadmapVotes(userId: string | undefined) {
  return useQuery<string[]>({
    queryKey: K.roadmapVotes(userId ?? ""),
    queryFn:  () => listMyRoadmapVotes(userId!),
    enabled:  !!userId,
    staleTime: 30_000,
  });
}

// ─── Vote toggle ──────────────────────────────────────────────────────────────

export function useToggleVote(userId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, voted }: { itemId: string; voted: boolean }) => {
      if (!userId) throw new Error("Non authentifié");
      await toggleRoadmapVote(userId, itemId, voted);
    },

    onMutate: async ({ itemId, voted }) => {
      const key = K.roadmapVotes(userId ?? "");
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key) ?? [];
      qc.setQueryData<string[]>(key, voted
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
      );
      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(K.roadmapVotes(userId ?? ""), ctx.prev);
      }
    },

    // Votes ET compteurs (avant : le compteur restait figé jusqu'au rechargement).
    onSettled: () => invalidateRoadmap(qc),
  });
}

// ─── Phases (admin) ───────────────────────────────────────────────────────────

export function useCreatePhase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createRoadmapPhase,
    onSuccess: () => { toast.success("Phase créée"); },
    onError:   () => { toast.error("Erreur lors de la création de la phase"); },
    onSettled: () => invalidateRoadmap(qc),
  });
}

export function useUpdatePhase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: updateRoadmapPhase,
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: K.roadmapPhases });
      const prev = qc.getQueryData<RoadmapPhase[]>(K.roadmapPhases);
      qc.setQueryData<RoadmapPhase[]>(K.roadmapPhases,
        (old) => old?.map((p) => p.id === id ? { ...p, ...updates } : p)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(K.roadmapPhases, ctx.prev);
      toast.error("Erreur lors de la mise à jour");
    },
    onSettled: () => invalidateRoadmap(qc),
  });
}

export function useDeletePhase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteRoadmapPhase,
    onSuccess: () => { toast.success("Phase supprimée"); },
    onError:   () => { toast.error("Erreur lors de la suppression"); },
    onSettled: () => invalidateRoadmap(qc),
  });
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function useCreateItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createRoadmapItem,
    onSuccess: () => { toast.success("Item ajouté"); },
    onError:   () => { toast.error("Erreur lors de l'ajout"); },
    onSettled: () => invalidateRoadmap(qc),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: updateRoadmapItem,
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: K.roadmapItems });
      const prev = qc.getQueryData<RoadmapItem[]>(K.roadmapItems);
      qc.setQueryData<RoadmapItem[]>(K.roadmapItems,
        (old) => old?.map((item) => item.id === id ? { ...item, ...updates } : item)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(K.roadmapItems, ctx.prev);
      toast.error("Erreur lors de la mise à jour");
    },
    onSettled: () => invalidateRoadmap(qc),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteRoadmapItem,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: K.roadmapItems });
      const prev = qc.getQueryData<RoadmapItem[]>(K.roadmapItems);
      qc.setQueryData<RoadmapItem[]>(K.roadmapItems, (old) => old?.filter((i) => i.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(K.roadmapItems, ctx.prev);
      toast.error("Erreur lors de la suppression");
    },
    onSuccess: () => { toast.success("Item supprimé"); },
    onSettled: () => invalidateRoadmap(qc),
  });
}

// ─── Compteurs de votes ───────────────────────────────────────────────────────

export const fetchVoteCounts = roadmapVoteCounts;

export function useVoteCounts() {
  return useQuery<Record<string, number>>({
    queryKey: K.roadmapVoteCounts,
    queryFn:  roadmapVoteCounts,
    staleTime: 30_000,
  });
}

// ─── Update phase status (admin shortcut) ─────────────────────────────────────

export function useUpdatePhaseStatus() {
  const update = useUpdatePhase();
  return (id: string, status: RoadmapPhaseStatus) => update.mutate({ id, status });
}
