import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";

/**
 * Lien de première connexion d'un athlète pré-créé par son coach.
 * Renvoie null tant que `enabled` est faux, ou si le jeton n'existe plus
 * (compte déjà réclamé).
 */
export function useAthleteClaimLink(athleteId: string, enabled: boolean) {
  return useQuery({
    queryKey: QK.athleteClaim(athleteId),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_claims")
        .select("token")
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data ? `${window.location.origin}/claim/${data.token}` : null;
    },
  });
}

/** Infos affichées sur la page du lien, avant toute connexion. */
export function useClaimInfo(token: string) {
  return useQuery({
    queryKey: QK.claimInfo(token),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_claim_info", { p_token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}
