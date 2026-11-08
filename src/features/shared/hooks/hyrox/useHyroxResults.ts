import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  createHyroxResult,
  deleteHyroxResult,
  getHyroxResult,
  hyroxKeys,
  invalidateHyrox,
  listHyroxResults,
  updateHyroxResult,
} from "@/api/hyrox";
import type { HyroxResult, HyroxResultInsert } from "@/features/shared/types/hyrox";

export function useHyroxResults(athleteId: string | undefined) {
  return useQuery<HyroxResult[]>({
    queryKey: hyroxKeys.results(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listHyroxResults(athleteId as string),
  });
}

export function useHyroxResult(id: string | undefined) {
  return useQuery<HyroxResult | null>({
    queryKey: hyroxKeys.result(id ?? ""),
    enabled: !!id,
    queryFn: () => getHyroxResult(id as string),
  });
}

export function useCreateHyroxResult(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (result: HyroxResultInsert) => createHyroxResult(result, user?.id ?? null),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
      toast.success("Course HYROX enregistrée");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

export function useUpdateHyroxResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: Partial<HyroxResult> & { id: string }) => updateHyroxResult(id, fields),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
      toast.success("Course mise à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });
}

export function useDeleteHyroxResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHyroxResult(id),
    onSuccess: () => {
      void invalidateHyrox(qc, athleteId);
      toast.success("Course supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}
