/**
 * Hooks React Query des séances énergie programmées chez un athlète :
 * adaptateurs de `src/api/energy.ts` (lectures, écritures, invalidation).
 */
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  assignEnergySession,
  completeEnergyAssignment,
  deleteEnergyAssignment,
  energyKeys,
  invalidateEnergy,
  isEnergyNotFound,
  listAthleteEnergyAssignments,
  reopenEnergyAssignment,
  setEnergyRpe,
  updateEnergyAssignment,
  type DateRange,
  type EnergyActivityType,
  type EnergyAssignment,
  type EnergyAssignmentPatch,
} from "@/api/energy";
import { syncDocAssignmentsFromEnergy } from "./fiches/syncDocAssignments";
import type {
  EnergySessionAssignmentRow,
  CreateAssignmentInput,
  AssignmentStatus,
  BlockLogs,
} from "@/types/energy";

export type { DateRange };

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ─────────────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────────────

export function useEnergyAssignments(athleteId: string | null | undefined, dateRange?: DateRange) {
  return useQuery<EnergyAssignment[]>({
    queryKey: energyKeys.assignments(athleteId ?? "", dateRange),
    queryFn: () => listAthleteEnergyAssignments(athleteId!, dateRange),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mises à jour optimistes (toutes les listes de l'athlète)
// ─────────────────────────────────────────────────────────────────────────────

type Snapshot = [readonly unknown[], EnergyAssignment[] | undefined][];

async function optimistic(
  qc: QueryClient,
  athleteId: string,
  change: (old: EnergyAssignment[]) => EnergyAssignment[],
): Promise<Snapshot> {
  const filters = { queryKey: energyKeys.assignments(athleteId) };
  await qc.cancelQueries(filters);
  const previous = qc.getQueriesData<EnergyAssignment[]>(filters);
  qc.setQueriesData<EnergyAssignment[]>(filters, (old) => (old ? change(old) : old));
  return previous;
}

function rollback(qc: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations (coach : planification)
// ─────────────────────────────────────────────────────────────────────────────

export function useAssignEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAssignmentInput) => assignEnergySession(input),
    onMutate: async (input) => {
      // Seulement la liste complète : une liste par plage ne doit pas recevoir
      // une séance hors de sa plage.
      const key = energyKeys.assignments(input.athlete_id);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EnergyAssignment[]>(key);
      const now = new Date().toISOString();
      const temp: EnergyAssignment = { id: `__optimistic_${Date.now()}`, created_at: now, updated_at: now, ...input };
      if (previous) qc.setQueryData<EnergyAssignment[]>(key, [...previous, temp]);
      return { snapshot: [[key, previous]] as Snapshot };
    },
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de l'assignation de la séance");
    },
    onSuccess: (_data, input) => {
      void invalidateEnergy(qc, input.athlete_id);
      void syncDocAssignmentsFromEnergy(input.athlete_id, qc);
      toast.success("Séance assignée");
    },
  });
}

type UpdateVars = Partial<EnergySessionAssignmentRow> & { id: string; athleteId: string };

/**
 * Modification d'une séance programmée (date, statut…). Une remise à
 * « prévue » qui efface les blocs (« Annuler la validation » des écrans
 * athlète) passe par la RPC de réouverture : elle efface aussi durée,
 * activité et distance (qui comptaient encore dans le volume de course).
 * Préférer `useReopenEnergyAssignment` pour ce cas.
 */
export function useUpdateEnergyAssignment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, athleteId: _aid, ...patch }: UpdateVars) => {
      const { status, block_logs, rpe_score, created_at: _c, updated_at: _u, energy_sessions: _e, athlete_id: _a, ...rest } = patch;
      if (status === "planned" && block_logs !== undefined) {
        const reopened = await reopenEnergyAssignment(id);
        return Object.keys(rest).length > 0 ? updateEnergyAssignment(id, rest as EnergyAssignmentPatch) : reopened;
      }
      const next: EnergyAssignmentPatch = { ...(rest as EnergyAssignmentPatch) };
      if (status !== undefined) next.status = status;
      if (block_logs !== undefined) next.block_logs = block_logs;
      if (rpe_score !== undefined) next.rpe_score = rpe_score;
      return updateEnergyAssignment(id, next);
    },
    onMutate: async ({ id, athleteId, ...patch }) => ({
      snapshot: await optimistic(qc, athleteId, (old) => old.map((a) => (a.id === id ? { ...a, ...patch } : a))),
    }),
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la mise à jour de l'assignation");
    },
    onSuccess: () => toast.success("Assignation mise à jour"),
    onSettled: (_d, _e, { athleteId }) => invalidateEnergy(qc, athleteId),
  });
}

export function useUnassignEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, athleteId }: { id: string; athleteId: string }) => {
      await deleteEnergyAssignment(id);
      return { id, athleteId };
    },
    onMutate: async ({ id, athleteId }) => ({
      snapshot: await optimistic(qc, athleteId, (old) => old.filter((a) => a.id !== id)),
    }),
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la suppression de l'assignation");
    },
    onSuccess: (_data, { athleteId }) => {
      void invalidateEnergy(qc, athleteId);
      void syncDocAssignmentsFromEnergy(athleteId, qc);
      toast.success("Assignation supprimée");
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations (athlète : saisie)
// ─────────────────────────────────────────────────────────────────────────────

export interface CompleteEnergyVars {
  id: string;
  athleteId: string;
  block_logs: BlockLogs;
  notes?: string;
  actual_duration_min?: number | null;
  activity_url?: string | null;
  /** Activité réellement faite (volume de course si « course ») */
  activity_type?: EnergyActivityType | null;
  distance_km?: number | null;
  /** RPE donné dans le même appel que la validation (une seule écriture). */
  rpe_score?: number | null;
}

/** Valide une séance énergie : statut, blocs, durée, activité (et RPE) en une écriture. */
export function useCompleteEnergyAssignment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, athleteId: _aid, ...input }: CompleteEnergyVars) => completeEnergyAssignment(id, input),
    onSuccess: (_data, { athleteId }) => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Séance validée !");
    },
    onError: (err, { athleteId }) => {
      console.error("[useCompleteEnergyAssignment] error:", err);
      if (isEnergyNotFound(err)) {
        // Séance retirée par le coach entre-temps : on rafraîchit pour qu'elle disparaisse.
        void invalidateEnergy(qc, athleteId);
        toast.error("Cette séance n'existe plus : ton coach l'a retirée.");
        return;
      }
      toast.error(`Validation échouée : ${errMsg(err)}`);
    },
  });
}

/** Annule la validation d'une séance énergie. */
export function useReopenEnergyAssignment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; athleteId: string }) => reopenEnergyAssignment(id),
    onSuccess: (_data, { athleteId }) => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Validation annulée");
    },
    onError: () => toast.error("Erreur lors de l'annulation"),
  });
}

/** Enregistre le RPE Foster d'une séance énergie. */
export function useUpsertEnergyRpe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, rpe_score }: { id: string; athleteId: string; rpe_score: number }) => setEnergyRpe(id, rpe_score),
    onSuccess: (_data, { athleteId }) => {
      void invalidateEnergy(qc, athleteId);
      toast.success("RPE enregistré");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement du RPE"),
  });
}

/** Raccourci pour mettre à jour uniquement le statut d'une assignation. */
export function useUpdateAssignmentStatus() {
  const update = useUpdateEnergyAssignment();
  return {
    ...update,
    mutate: (args: { id: string; athleteId: string; status: AssignmentStatus }) =>
      update.mutate(args),
    mutateAsync: (args: { id: string; athleteId: string; status: AssignmentStatus }) =>
      update.mutateAsync(args),
  };
}
