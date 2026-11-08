import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  coachKeys, createCoachApiKey, invalidateCoachApiKeys, listCoachApiKeys, revokeCoachApiKey,
} from "@/api/coaches";

export type { CoachApiKey } from "@/api/coaches";

/** Clés API du coach connecté, révoquées comprises (le journal y renvoie). */
export function useCoachApiKeys() {
  const { user } = useAuth();
  return useQuery({
    queryKey: coachKeys.apiKeys(user?.id ?? "none"),
    enabled: !!user,
    queryFn: listCoachApiKeys,
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
      return createCoachApiKey(user.id, name);
    },
    onSuccess: () => invalidateCoachApiKeys(qc, user?.id ?? "none"),
  });
}

export function useRevokeCoachApiKey() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeCoachApiKey,
    onSuccess: () => invalidateCoachApiKeys(qc, user?.id ?? "none"),
  });
}
