/**
 * Hooks React Query pour les assignations de séances énergétiques à un athlète.
 *
 * Repose sur energy_session_assignments.
 * RLS : athlète voit ses propres données, coach voit ses athlètes, admin voit tout.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { syncDocAssignmentsFromEnergy } from "./fiches/syncDocAssignments";
import type {
  EnergySessionAssignmentRow,
  CreateAssignmentInput,
  AssignmentStatus,
  BlockLogs,
} from "@/types/energy";

// ─────────────────────────────────────────────────────────────────────────────
// Query functions
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: string;  // ISO date YYYY-MM-DD
  to: string;    // ISO date YYYY-MM-DD
}

async function fetchEnergyAssignments(
  athleteId: string,
  dateRange?: DateRange,
): Promise<EnergySessionAssignmentRow[]> {
  let q = supabase
    .from('energy_session_assignments')
    .select('*, energy_sessions(*)')
    .eq('athlete_id', athleteId)
    .order('scheduled_date', { ascending: true });

  if (dateRange) {
    q = q.gte('scheduled_date', dateRange.from).lte('scheduled_date', dateRange.to);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as EnergySessionAssignmentRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────────────

export function useEnergyAssignments(athleteId: string | null | undefined, dateRange?: DateRange) {
  return useQuery<EnergySessionAssignmentRow[]>({
    queryKey: dateRange
      ? [...QK.energyAssignments(athleteId ?? ''), dateRange]
      : QK.energyAssignments(athleteId ?? ''),
    queryFn: () => fetchEnergyAssignments(athleteId!, dateRange),
    enabled: !!athleteId,
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useAssignEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAssignmentInput) => {
      const { data, error } = await supabase
        .from('energy_session_assignments')
        .insert(input)
        .select('*, energy_sessions(*)')
        .single();
      if (error) throw error;
      return data as unknown as EnergySessionAssignmentRow;
    },
    onMutate: async (input) => {
      const key = QK.energyAssignments(input.athlete_id);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EnergySessionAssignmentRow[]>(key);
      const optimistic: EnergySessionAssignmentRow = {
        id: `__optimistic_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...input,
      };
      qc.setQueryData<EnergySessionAssignmentRow[]>(key, (old = []) => [...old, optimistic]);
      return { previous, athleteId: input.athlete_id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(QK.energyAssignments(ctx.athleteId), ctx.previous);
      }
      toast.error("Erreur lors de l'assignation de la séance");
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: QK.energyAssignments(input.athlete_id) });
      // Invalide aussi le calendrier unifié pour que la vue mois se rafraîchisse
      qc.invalidateQueries({ queryKey: ["cal", input.athlete_id] });
      void syncDocAssignmentsFromEnergy(input.athlete_id, qc);
      toast.success("Séance assignée");
    },
  });
}

export function useUpdateEnergyAssignment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      athleteId,
      ...patch
    }: Partial<EnergySessionAssignmentRow> & { id: string; athleteId: string }) => {
      const { data, error } = await supabase
        .from('energy_session_assignments')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, energy_sessions(*)')
        .single();
      if (error) throw error;
      return data as unknown as EnergySessionAssignmentRow;
    },
    onMutate: async ({ id, athleteId, ...patch }) => {
      const key = QK.energyAssignments(athleteId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EnergySessionAssignmentRow[]>(key);
      qc.setQueryData<EnergySessionAssignmentRow[]>(key, (old = []) =>
        old.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
      return { previous, athleteId };
    },
    onError: (_err, { athleteId }, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(QK.energyAssignments(athleteId), ctx.previous);
      }
      toast.error("Erreur lors de la mise à jour de l'assignation");
    },
    onSuccess: (_data, { athleteId }) => {
      qc.invalidateQueries({ queryKey: QK.energyAssignments(athleteId) });
      qc.invalidateQueries({ queryKey: ["cal", athleteId] });
      toast.success("Assignation mise à jour");
    },
  });
}

export function useUnassignEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, athleteId }: { id: string; athleteId: string }) => {
      const { error } = await supabase
        .from('energy_session_assignments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { id, athleteId };
    },
    onMutate: async ({ id, athleteId }) => {
      const key = QK.energyAssignments(athleteId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EnergySessionAssignmentRow[]>(key);
      qc.setQueryData<EnergySessionAssignmentRow[]>(key, (old = []) =>
        old.filter((a) => a.id !== id)
      );
      return { previous, athleteId };
    },
    onError: (_err, { athleteId }, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(QK.energyAssignments(athleteId), ctx.previous);
      }
      toast.error("Erreur lors de la suppression de l'assignation");
    },
    onSuccess: (_data, { athleteId }) => {
      qc.invalidateQueries({ queryKey: QK.energyAssignments(athleteId) });
      qc.invalidateQueries({ queryKey: ["cal", athleteId] });
      void syncDocAssignmentsFromEnergy(athleteId, qc);
      toast.success("Assignation supprimée");
    },
  });
}

/** Valide une séance énergie : status=completed + block_logs + notes optionnels. */
export function useCompleteEnergyAssignment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      block_logs,
      notes,
      actual_duration_min,
      activity_url,
    }: { id: string; athleteId: string; block_logs: BlockLogs; notes?: string; actual_duration_min?: number | null; activity_url?: string | null }) => {
      const patch: Record<string, unknown> = {
        status: "completed",
        block_logs,
        updated_at: new Date().toISOString(),
      };
      if (notes != null) patch.notes = notes;
      if (actual_duration_min != null) patch.actual_duration_min = actual_duration_min;
      if (activity_url != null) patch.activity_url = activity_url;
      const { error } = await supabase
        .from("energy_session_assignments")
        .update(patch)
        .eq("id", id);
      if (error) {
        // Column may not exist yet — retry without actual_duration_min
        if (error.message?.includes("actual_duration_min")) {
          const { actual_duration_min: _drop, ...patchWithout } = patch as Record<string, unknown> & { actual_duration_min?: unknown };
          const { error: error2 } = await supabase
            .from("energy_session_assignments")
            .update(patchWithout)
            .eq("id", id);
          if (error2) throw error2;
        } else {
          throw error;
        }
      }
    },
    onSuccess: (_data, { athleteId }) => {
      qc.invalidateQueries({ queryKey: QK.energyAssignments(athleteId) });
      qc.invalidateQueries({ queryKey: ["cal", athleteId] });
      qc.invalidateQueries({ queryKey: QK.weeklyRetours() });
      qc.invalidateQueries({ queryKey: QK.monthlyRetours() });
      toast.success("Séance validée !");
    },
    onError: (err) => {
      console.error("[useCompleteEnergyAssignment] error:", err);
      const msg = (err as { message?: string })?.message ?? String(err);
      toast.error(`Validation échouée : ${msg}`);
    },
  });
}

/** Enregistre le RPE Foster d'une séance énergie. */
export function useUpsertEnergyRpe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      rpe_score,
    }: { id: string; athleteId: string; rpe_score: number }) => {
      const { error } = await supabase
        .from("energy_session_assignments")
        .update({ rpe_score, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { athleteId }) => {
      qc.invalidateQueries({ queryKey: QK.energyAssignments(athleteId) });
      qc.invalidateQueries({ queryKey: QK.weeklyRetours() });
      qc.invalidateQueries({ queryKey: QK.monthlyRetours() });
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
