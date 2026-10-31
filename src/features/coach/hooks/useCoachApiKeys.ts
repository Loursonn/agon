import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { generateApiKey, keyPrefix, sha256Hex } from "@/lib/coachApiKey";

export interface CoachApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Clés API du coach connecté, révoquées comprises (le journal y renvoie). */
export function useCoachApiKeys() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QK.coachApiKeys(user?.id ?? "none"),
    enabled: !!user,
    queryFn: async (): Promise<CoachApiKey[]> => {
      const { data, error } = await supabase
        .from("coach_api_keys")
        .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Crée une clé et la renvoie en clair — c'est la seule fois où elle existe
 * hors de la mémoire de l'appelant.
 */
export function useCreateCoachApiKey() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      if (!user) throw new Error("Non connecté");
      const key = generateApiKey();
      const { error } = await supabase.from("coach_api_keys").insert({
        coach_id: user.id,
        name: name.trim().slice(0, 60),
        key_prefix: keyPrefix(key),
        key_hash: await sha256Hex(key),
      });
      if (error) throw error;
      return key;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.coachApiKeys(user?.id ?? "none") }),
  });
}

export function useRevokeCoachApiKey() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("coach_api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .is("revoked_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.coachApiKeys(user?.id ?? "none") }),
  });
}
