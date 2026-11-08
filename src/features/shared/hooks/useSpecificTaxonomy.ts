/**
 * Hooks React Query pour les référentiels de la Banque Spécifique
 * (src/api/specific.ts) : sports et qualités physiques.
 * Chaque référentiel = défauts globaux (coach_id NULL) + customs du coach.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createQuality,
  createSport,
  deleteQuality,
  deleteSport,
  listPhysicalQualities,
  listSpecificSports,
  specificKeys,
  type PhysicalQuality,
  type SpecificSport,
} from "@/api/specific";

// ── Sports ────────────────────────────────────────────────────────────────────

export function useSpecificSports() {
  return useQuery<SpecificSport[]>({
    queryKey: specificKeys.sports,
    staleTime: 5 * 60_000,
    queryFn: listSpecificSports,
  });
}

export function useCreateSport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { name: string; coachId: string; color?: string }) => createSport(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: specificKeys.sports });
      toast.success("Sport ajouté");
    },
    onError: () => toast.error("Erreur lors de l'ajout du sport"),
  });
}

export function useDeleteSport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: specificKeys.sports });
      toast.success("Sport supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression du sport"),
  });
}

// ── Qualités physiques ────────────────────────────────────────────────────────

export function usePhysicalQualities() {
  return useQuery<PhysicalQuality[]>({
    queryKey: specificKeys.qualities,
    staleTime: 5 * 60_000,
    queryFn: listPhysicalQualities,
  });
}

export function useCreateQuality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { name: string; coachId: string }) => createQuality(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: specificKeys.qualities });
      toast.success("Qualité ajoutée");
    },
    onError: () => toast.error("Erreur lors de l'ajout de la qualité"),
  });
}

export function useDeleteQuality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteQuality(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: specificKeys.qualities });
      toast.success("Qualité supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression de la qualité"),
  });
}
