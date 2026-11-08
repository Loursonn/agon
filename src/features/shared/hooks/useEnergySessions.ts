/**
 * Hooks React Query de la bibliothèque de séances énergie (`energy_sessions`) :
 * adaptateurs de `src/api/energy.ts`. Les totaux (durée, distance) sont
 * calculés par le module à chaque création / modification des intervalles.
 */
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  createEnergySession,
  deleteEnergySession,
  energyKeys,
  getEnergySession,
  invalidateEnergy,
  listEnergySessions,
  setEnergySessionPublished,
  setEnergySessionVerified,
  updateEnergySession,
  type EnergySessionFilters,
} from "@/api/energy";
import type { EnergySessionRow, CreateEnergySessionInput } from "@/types/energy";

export type { EnergySessionFilters };

/** Id de l'utilisateur qui lit la bibliothèque (préfixe des clés). */
function useOwnerId(): string {
  return useAuth().user?.id ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export function useEnergySessions(filters?: EnergySessionFilters) {
  const owner = useOwnerId();
  return useQuery<EnergySessionRow[]>({
    queryKey: energyKeys.library(owner, filters),
    queryFn: () => listEnergySessions(filters),
    enabled: !!owner,
    staleTime: 60_000,
  });
}

/** `null` si la séance n'existe pas ou n'est pas visible. */
export function useEnergySession(id: string | null | undefined) {
  const owner = useOwnerId();
  return useQuery<EnergySessionRow | null>({
    queryKey: energyKeys.session(owner, id ?? ""),
    queryFn: () => getEnergySession(id!),
    enabled: !!id && !!owner,
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mises à jour optimistes
// ─────────────────────────────────────────────────────────────────────────────

type Snapshot = [readonly unknown[], unknown][];

/** Applique `change` à toutes les listes de la bibliothèque et à la séance `id`. */
async function optimistic(
  qc: QueryClient,
  owner: string,
  change: (s: EnergySessionRow) => EnergySessionRow | null,
  id?: string,
): Promise<Snapshot> {
  const lists = { queryKey: energyKeys.libraryAll(owner) };
  await qc.cancelQueries(lists);
  const snapshot: Snapshot = qc.getQueriesData<EnergySessionRow[]>(lists);
  qc.setQueriesData<EnergySessionRow[]>(lists, (old) =>
    old?.flatMap((s) => (id === undefined || s.id === id ? (change(s) ?? []) : [s])),
  );
  if (id) {
    const key = energyKeys.session(owner, id);
    await qc.cancelQueries({ queryKey: key });
    const item = qc.getQueryData<EnergySessionRow | null>(key);
    snapshot.push([key, item]);
    if (item) qc.setQueryData<EnergySessionRow | null>(key, change(item));
  }
  return snapshot;
}

function rollback(qc: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

/** La bibliothèque change : listes, séances ouvertes et séances programmées qui l'affichent. */
const invalidateLibrary = (qc: QueryClient) => invalidateEnergy(qc, null);

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateEnergySession() {
  const qc = useQueryClient();
  const owner = useOwnerId();

  return useMutation({
    mutationFn: (input: CreateEnergySessionInput) => createEnergySession(input),
    onMutate: async (input) => {
      const key = energyKeys.library(owner);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EnergySessionRow[]>(key);
      const now = new Date().toISOString();
      const temp: EnergySessionRow = {
        id: `__optimistic_${Date.now()}`,
        is_public: false,
        is_verified: false,
        verified_by: null,
        verified_at: null,
        created_at: now,
        updated_at: now,
        ...input,
      };
      if (previous) qc.setQueryData<EnergySessionRow[]>(key, [temp, ...previous]);
      return { snapshot: [[key, previous]] as Snapshot };
    },
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la création de la séance");
    },
    onSuccess: () => {
      void invalidateLibrary(qc);
      toast.success("Séance créée");
    },
  });
}

export function useUpdateEnergySession() {
  const qc = useQueryClient();
  const owner = useOwnerId();

  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<EnergySessionRow> & { id: string }) => updateEnergySession(id, patch),
    onMutate: async ({ id, ...patch }) => ({
      snapshot: await optimistic(qc, owner, (s) => ({ ...s, ...patch }), id),
    }),
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la mise à jour de la séance");
    },
    onSuccess: () => {
      void invalidateLibrary(qc);
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
  const owner = useOwnerId();

  return useMutation({
    mutationFn: (id: string) => deleteEnergySession(id),
    onMutate: async (id) => {
      const lists = { queryKey: energyKeys.libraryAll(owner) };
      await qc.cancelQueries(lists);
      const snapshot: Snapshot = qc.getQueriesData<EnergySessionRow[]>(lists);
      qc.setQueriesData<EnergySessionRow[]>(lists, (old) => old?.filter((s) => s.id !== id));
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la suppression de la séance");
    },
    onSuccess: (result) => {
      void invalidateLibrary(qc);
      toast.success(result === "archived"
        ? "Séance retirée de la banque — les séances déjà programmées restent dans le calendrier"
        : "Séance supprimée");
    },
  });
}

export function usePublishEnergySession() {
  const qc = useQueryClient();
  const owner = useOwnerId();

  return useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) => setEnergySessionPublished(id, publish),
    onMutate: async ({ id, publish }) => ({
      snapshot: await optimistic(qc, owner, (s) => ({ ...s, is_public: publish }), id),
    }),
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la publication de la séance");
    },
    onSuccess: (_data, { publish }) => {
      void invalidateLibrary(qc);
      toast.success(publish ? "Séance publiée dans la banque" : "Séance retirée de la banque");
    },
  });
}

export function useVerifyEnergySession() {
  const qc = useQueryClient();
  const owner = useOwnerId();

  return useMutation({
    mutationFn: ({ id, verify }: { id: string; verify: boolean }) => setEnergySessionVerified(id, verify),
    onMutate: async ({ id, verify }) => {
      const patch = { is_verified: verify, verified_at: verify ? new Date().toISOString() : null };
      return { snapshot: await optimistic(qc, owner, (s) => ({ ...s, ...patch }), id) };
    },
    onError: (_err, _vars, ctx) => {
      rollback(qc, ctx?.snapshot);
      toast.error("Erreur lors de la vérification de la séance");
    },
    onSuccess: (_data, { verify }) => {
      void invalidateLibrary(qc);
      toast.success(verify ? "Séance vérifiée" : "Vérification retirée");
    },
  });
}
