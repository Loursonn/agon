import { useQuery } from "@tanstack/react-query";
import { accountKeys, getClaimInfo, getClaimToken } from "@/api/account";

/**
 * Lien de première connexion d'un athlète pré-créé par son coach.
 * Renvoie null tant que `enabled` est faux, ou si le jeton n'existe plus
 * (compte déjà réclamé).
 */
export function useAthleteClaimLink(athleteId: string, enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.claimLink(athleteId),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const token = await getClaimToken(athleteId);
      return token ? `${window.location.origin}/claim/${token}` : null;
    },
  });
}

/** Infos affichées sur la page du lien, avant toute connexion. */
export function useClaimInfo(token: string) {
  return useQuery({
    queryKey: accountKeys.claimInfo(token),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => getClaimInfo(token),
  });
}
