import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { QK } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { HyroxResult, HyroxResultInsert } from "@/features/shared/types/hyrox";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useHyroxResults(athleteId: string | undefined) {
  return useQuery<HyroxResult[]>({
    queryKey: QK.hyroxResults(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("hyrox_results")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as HyroxResult[];
    },
  });
}

export function useHyroxResult(id: string | undefined) {
  return useQuery<HyroxResult | null>({
    queryKey: QK.hyroxResult(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from("hyrox_results")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as HyroxResult;
    },
  });
}

export function useCreateHyroxResult(athleteId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (result: HyroxResultInsert) => {
      const { data, error } = await db
        .from("hyrox_results")
        .insert({ ...result, created_by: user?.id ?? null })
        .select("*")
        .single();
      if (error) throw error;
      return data as HyroxResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.hyroxResults(athleteId) });
      toast.success("Course HYROX enregistrée");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });
}

export function useUpdateHyroxResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: Partial<HyroxResult> & { id: string }) => {
      const { data, error } = await db
        .from("hyrox_results")
        .update(fields)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as HyroxResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QK.hyroxResults(athleteId) });
      qc.invalidateQueries({ queryKey: QK.hyroxResult(data.id) });
      toast.success("Course mise à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });
}

export function useDeleteHyroxResult(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("hyrox_results")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.hyroxResults(athleteId) });
      toast.success("Course supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}
