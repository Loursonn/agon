/**
 * Hooks React Query des séances énergie programmées chez un athlète :
 * adaptateurs de `src/api/energy.ts` (lectures, écritures, invalidation).
 *
 * Saisie de l'athlète (validation, RPE) : passe par la file hors ligne
 * (`submitWrite`). Sans réseau, la saisie est gardée sur le téléphone et
 * l'écran la montre tout de suite (mise à jour optimiste de toutes les listes
 * de l'athlète) ; la file rafraîchit tout une fois envoyée.
 */
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  assignEnergySession,
  deleteEnergyAssignment,
  energyKeys,
  invalidateEnergy,
  isEnergyNotFound,
  listAthleteEnergyAssignments,
  reopenEnergyAssignment,
  updateEnergyAssignment,
  type DateRange,
  type EnergyActivityType,
  type EnergyAssignment,
  type EnergyAssignmentPatch,
} from "@/api/energy";
import { planningKeys, type ActivePlanResult, type UnifiedCalendarEvent } from "@/api/planning";
import { applyEnergyCompletion, applyEnergyRpe, isPartialBlockLogs } from "@/lib/energy/completion";
import {
  assertNoPendingValidation, isPendingWriteError, notifyQueued, PENDING_VALIDATION_MESSAGE, submitWrite,
} from "@/lib/offline/writes";
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

function rollback(qc: QueryClient, snapshot: readonly (readonly [readonly unknown[], unknown])[] | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

type CacheSnapshot = [readonly unknown[], unknown][];

/**
 * Saisie de l'athlète sur UNE séance, appliquée partout où l'athlète la voit :
 * listes de séances énergie, calendrier unifié (accueil) et semaine du plan
 * actif (programme). Renvoie de quoi revenir en arrière.
 */
async function optimisticEntry(
  qc: QueryClient,
  athleteId: string,
  id: string,
  change: (a: EnergyAssignment) => EnergyAssignment,
): Promise<CacheSnapshot> {
  const lists = [energyKeys.assignments(athleteId), [...energyKeys.owner(athleteId), "list"]] as const;
  const calendar = planningKeys.calendarAll(athleteId);
  const plan = ["activePlan", athleteId] as const;
  const families: readonly (readonly unknown[])[] = [...lists, calendar, plan];

  await Promise.all(families.map((queryKey) => qc.cancelQueries({ queryKey })));
  const snapshot: CacheSnapshot = families.flatMap((queryKey) => qc.getQueriesData<unknown>({ queryKey }));

  for (const queryKey of lists) {
    qc.setQueriesData<EnergyAssignment[]>({ queryKey }, (old) =>
      Array.isArray(old) ? old.map((a) => (a.id === id ? change(a) : a)) : old);
  }

  qc.setQueriesData<UnifiedCalendarEvent[]>({ queryKey: calendar }, (old) =>
    Array.isArray(old)
      ? old.map((e) => {
          if (e.type !== "energy" || e.id !== id) return e;
          const base = (e.raw ?? { id, status: e.status, rpe_score: e.rpe }) as unknown as EnergyAssignment;
          const next = change(base);
          return {
            ...e,
            status: next.status,
            rpe: next.rpe_score ?? null,
            partial: isPartialBlockLogs(next.block_logs),
            raw: e.raw ? (next as unknown as Record<string, unknown>) : e.raw,
          };
        })
      : old);

  qc.setQueriesData<ActivePlanResult>({ queryKey: plan }, (old) =>
    old && Array.isArray(old.weekDays)
      ? {
          ...old,
          weekDays: old.weekDays.map((d) => ({
            ...d,
            sessions: d.sessions.map((s) =>
              s.kind === "energy" && s.id === id
                ? { ...s, status: change({ id, status: s.status } as EnergyAssignment).status }
                : s),
          })),
        }
      : old);

  return snapshot;
}

/** Même toast pour toute saisie gardée (un seul affiché à la fois). */
const showQueued = notifyQueued;

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
        assertNoPendingValidation(id);
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
    onError: (err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error(isPendingWriteError(err) ? PENDING_VALIDATION_MESSAGE : "Erreur lors de la mise à jour de l'assignation");
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
  /** Absent = blocs inchangés (la RPC fusionne bloc par bloc). */
  block_logs?: BlockLogs;
  notes?: string;
  actual_duration_min?: number | null;
  activity_url?: string | null;
  /** Activité réellement faite (volume de course si « course ») */
  activity_type?: EnergyActivityType | null;
  distance_km?: number | null;
  /** RPE donné dans le même appel que la validation (une seule écriture). */
  rpe_score?: number | null;
}

/**
 * Valide une séance énergie : statut, blocs, durée, activité (et RPE) en une
 * écriture. Sans réseau : gardée sur le téléphone, l'écran la montre validée.
 */
export function useCompleteEnergyAssignment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, athleteId, ...input }: CompleteEnergyVars) =>
      submitWrite("energy.complete", { athleteId, id, input }),
    onMutate: async ({ id, athleteId, ...input }) => ({
      snapshot: await optimisticEntry(qc, athleteId, id, (a) => applyEnergyCompletion(a, input)),
    }),
    onSuccess: (res, { athleteId }) => {
      // Gardée : pas d'invalidation (elle viderait l'affichage hors ligne) ;
      // la file rafraîchit tout une fois la saisie envoyée.
      if (res.status === "queued") {
        showQueued();
        return;
      }
      void invalidateEnergy(qc, athleteId);
      toast.success("Séance validée !");
    },
    onError: (err, { athleteId }, ctx) => {
      console.error("[useCompleteEnergyAssignment] error:", err);
      rollback(qc, ctx?.snapshot);
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
    mutationFn: async ({ id }: { id: string; athleteId: string }) => {
      assertNoPendingValidation(id);
      return reopenEnergyAssignment(id);
    },
    onSuccess: (_data, { athleteId }) => {
      void invalidateEnergy(qc, athleteId);
      toast.success("Validation annulée");
    },
    onError: (err) => toast.error(isPendingWriteError(err) ? PENDING_VALIDATION_MESSAGE : "Erreur lors de l'annulation"),
  });
}

/** Enregistre le RPE Foster d'une séance énergie (gardé sur le téléphone sans réseau). */
export function useUpsertEnergyRpe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, athleteId, rpe_score }: { id: string; athleteId: string; rpe_score: number }) =>
      submitWrite("energy.rpe", { athleteId, id, rpe: rpe_score }),
    onMutate: async ({ id, athleteId, rpe_score }) => ({
      snapshot: await optimisticEntry(qc, athleteId, id, (a) => applyEnergyRpe(a, rpe_score)),
    }),
    onSuccess: (res, { athleteId }) => {
      if (res.status === "queued") {
        showQueued();
        return;
      }
      void invalidateEnergy(qc, athleteId);
      toast.success("RPE enregistré");
    },
    onError: (err, { athleteId }, ctx) => {
      console.error("[useUpsertEnergyRpe] error:", err);
      rollback(qc, ctx?.snapshot);
      if (isEnergyNotFound(err)) {
        void invalidateEnergy(qc, athleteId);
        toast.error("Cette séance n'existe plus : ton coach l'a retirée.");
        return;
      }
      toast.error("Erreur lors de l'enregistrement du RPE");
    },
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
