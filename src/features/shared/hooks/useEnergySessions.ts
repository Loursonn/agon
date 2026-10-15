/**
 * Hooks React Query pour la banque de séances énergétiques.
 *
 * Repose sur energy_sessions (table partagée coach).
 * Computed totals (total_duration_s, total_distance_m) calculés via helpers purs
 * avant chaque insert/update.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { expandIntervals, computeTotals } from "@/lib/energy";
import type {
  EnergySessionRow,
  EnergyGroup,
  EnergyStep,
  CreateEnergySessionInput,
} from "@/types/energy";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convertit un EnergyStep[] en groupe racine virtuel pour computeTotals. */
function stepsToTotals(steps: EnergyStep[]) {
  const root: EnergyGroup = { type: 'group', id: '__root__', role: 'open', repeat: 1, children: steps };
  const flat = expandIntervals(root);
  return computeTotals(flat);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query functions
// ─────────────────────────────────────────────────────────────────────────────

export interface EnergySessionFilters {
  session_kind?: string;
  is_verified?: boolean;
  created_by?: string;
  athlete_id?: string | null;
  search?: string;
  /** Exclude athlete-specific copies from results (bank queries) */
  bank_only?: boolean;
}

async function fetchEnergySessions(filters?: EnergySessionFilters): Promise<EnergySessionRow[]> {
  let q = supabase
    .from('energy_sessions')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (filters?.session_kind) q = q.eq('session_kind', filters.session_kind);
  if (filters?.is_verified !== undefined) q = q.eq('is_verified', filters.is_verified);
  if (filters?.created_by) q = q.eq('created_by', filters.created_by);
  if (filters?.athlete_id !== undefined) {
    if (filters.athlete_id === null) q = q.is('athlete_id', null);
    else q = q.eq('athlete_id', filters.athlete_id);
  }
  if (filters?.bank_only) q = q.is('athlete_id', null);
  if (filters?.search) q = q.ilike('name', `%${filters.search}%`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as EnergySessionRow[];
}

async function fetchEnergySession(id: string): Promise<EnergySessionRow> {
  const { data, error } = await supabase
    .from('energy_sessions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as EnergySessionRow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export function useEnergySessions(filters?: EnergySessionFilters) {
  return useQuery<EnergySessionRow[]>({
    queryKey: filters
      ? [...QK.energySessions, filters]
      : QK.energySessions,
    queryFn: () => fetchEnergySessions(filters),
    staleTime: 60_000,
  });
}

export function useEnergySession(id: string | null | undefined) {
  return useQuery<EnergySessionRow>({
    queryKey: QK.energySession(id ?? ''),
    queryFn: () => fetchEnergySession(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEnergySessionInput) => {
      const totals = stepsToTotals(input.intervals ?? []);
      const { data, error } = await supabase
        .from('energy_sessions')
        .insert({
          ...input,
          total_duration_s: totals.durationS,
          total_distance_m: totals.distanceM,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EnergySessionRow;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: QK.energySessions });
      const previous = qc.getQueryData<EnergySessionRow[]>(QK.energySessions);
      const optimistic: EnergySessionRow = {
        id: `__optimistic_${Date.now()}`,
        is_public: false,
        is_verified: false,
        verified_by: null,
        verified_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...input,
      };
      qc.setQueryData<EnergySessionRow[]>(QK.energySessions, (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(QK.energySessions, ctx.previous);
      toast.error("Erreur lors de la création de la séance");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.energySessions });
      toast.success("Séance créée");
    },
  });
}

export function useUpdateEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<EnergySessionRow> & { id: string }) => {
      const totals = patch.intervals ? stepsToTotals(patch.intervals) : null;
      const { data, error } = await supabase
        .from('energy_sessions')
        .update({
          ...patch,
          ...(totals ? { total_duration_s: totals.durationS, total_distance_m: totals.distanceM } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EnergySessionRow;
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: QK.energySessions });
      await qc.cancelQueries({ queryKey: QK.energySession(id) });
      const previousList = qc.getQueryData<EnergySessionRow[]>(QK.energySessions);
      const previousItem = qc.getQueryData<EnergySessionRow>(QK.energySession(id));
      qc.setQueryData<EnergySessionRow[]>(QK.energySessions, (old = []) =>
        old.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
      if (previousItem) {
        qc.setQueryData<EnergySessionRow>(QK.energySession(id), { ...previousItem, ...patch });
      }
      return { previousList, previousItem };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previousList !== undefined) qc.setQueryData(QK.energySessions, ctx.previousList);
      if (ctx?.previousItem !== undefined) qc.setQueryData(QK.energySession(id), ctx.previousItem);
      toast.error("Erreur lors de la mise à jour de la séance");
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: QK.energySessions });
      qc.invalidateQueries({ queryKey: QK.energySession(id) });
      toast.success("Séance mise à jour");
    },
  });
}

/**
 * Supprime une séance de la banque (RPC delete_energy_session) :
 * jamais programmée → supprimée ; déjà programmée chez un athlète → archivée
 * (masquée des banques, les séances programmées et leur historique restent).
 */
export function useDeleteEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC absente des types générés
      const { data, error } = await (supabase as any).rpc('delete_energy_session', { p_session_id: id });
      if (error) throw error;
      return data as 'deleted' | 'archived' | 'not_found';
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QK.energySessions });
      const previous = qc.getQueryData<EnergySessionRow[]>(QK.energySessions);
      qc.setQueryData<EnergySessionRow[]>(QK.energySessions, (old = []) =>
        old.filter((s) => s.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(QK.energySessions, ctx.previous);
      toast.error("Erreur lors de la suppression de la séance");
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: QK.energySessions });
      toast.success(result === 'archived'
        ? "Séance retirée de la banque — les séances déjà programmées restent dans le calendrier"
        : "Séance supprimée");
    },
  });
}

export function usePublishEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { data, error } = await supabase
        .from('energy_sessions')
        .update({ is_public: publish, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EnergySessionRow;
    },
    onMutate: async ({ id, publish }) => {
      await qc.cancelQueries({ queryKey: QK.energySessions });
      await qc.cancelQueries({ queryKey: QK.energySession(id) });
      const previousList = qc.getQueryData<EnergySessionRow[]>(QK.energySessions);
      const previousItem = qc.getQueryData<EnergySessionRow>(QK.energySession(id));
      qc.setQueryData<EnergySessionRow[]>(QK.energySessions, (old = []) =>
        old.map((s) => (s.id === id ? { ...s, is_public: publish } : s))
      );
      if (previousItem) {
        qc.setQueryData<EnergySessionRow>(QK.energySession(id), { ...previousItem, is_public: publish });
      }
      return { previousList, previousItem };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previousList !== undefined) qc.setQueryData(QK.energySessions, ctx.previousList);
      if (ctx?.previousItem !== undefined) qc.setQueryData(QK.energySession(id), ctx.previousItem);
      toast.error("Erreur lors de la publication de la séance");
    },
    onSuccess: (_data, { publish }) => {
      qc.invalidateQueries({ queryKey: QK.energySessions });
      toast.success(publish ? "Séance publiée dans la banque" : "Séance retirée de la banque");
    },
  });
}

export function useVerifyEnergySession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, verify }: { id: string; verify: boolean }) => {
      const { data, error } = await supabase
        .from('energy_sessions')
        .update({
          is_verified: verify,
          verified_at: verify ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EnergySessionRow;
    },
    onMutate: async ({ id, verify }) => {
      await qc.cancelQueries({ queryKey: QK.energySessions });
      await qc.cancelQueries({ queryKey: QK.energySession(id) });
      const previousList = qc.getQueryData<EnergySessionRow[]>(QK.energySessions);
      const previousItem = qc.getQueryData<EnergySessionRow>(QK.energySession(id));
      const patch = { is_verified: verify, verified_at: verify ? new Date().toISOString() : null };
      qc.setQueryData<EnergySessionRow[]>(QK.energySessions, (old = []) =>
        old.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
      if (previousItem) {
        qc.setQueryData<EnergySessionRow>(QK.energySession(id), { ...previousItem, ...patch });
      }
      return { previousList, previousItem };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previousList !== undefined) qc.setQueryData(QK.energySessions, ctx.previousList);
      if (ctx?.previousItem !== undefined) qc.setQueryData(QK.energySession(id), ctx.previousItem);
      toast.error("Erreur lors de la vérification de la séance");
    },
    onSuccess: (_data, { verify }) => {
      qc.invalidateQueries({ queryKey: QK.energySessions });
      toast.success(verify ? "Séance vérifiée" : "Vérification retirée");
    },
  });
}
