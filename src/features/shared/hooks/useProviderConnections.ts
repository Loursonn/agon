import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ConnectError, disconnectProvider, getConnections, invalidateProviders, providerKeys,
  startCorosAuthorization, startGarminAuthorization, syncCoros,
  type DisconnectResult, type ProviderConnection, type ProviderName, type ProviderStatus, type SyncReport,
} from "@/api/providers";
import { useAuth } from "@/hooks/useAuth";

export { ConnectError };
export type { DisconnectResult, ProviderConnection, ProviderName, ProviderStatus, SyncReport };

/**
 * Services connectés de l'athlète (montres COROS et Garmin).
 *
 * Tout ce qui est sensible se passe côté serveur : le `code_verifier` PKCE, le
 * `client_id`, l'échange du code, les jetons. Ce module ne fait que trois
 * choses — lire l'état des connexions, demander une URL d'autorisation, et
 * demander une déconnexion. Aucun jeton ne transite par ici, et
 * `provider_tokens` est de toute façon inaccessible depuis le navigateur (RLS
 * active, aucune politique).
 */

/**
 * Garmin ouvert dans l'interface ?
 *
 * Tant que Garmin n'a pas approuvé le dossier, la ligne Garmin s'affiche
 * « bientôt disponible », désactivée. Le jour de l'approbation : poser les
 * secrets serveur, déployer les fonctions, puis `VITE_GARMIN_ENABLED=true` sur
 * Vercel (redéploiement). Ce drapeau ne protège rien : s'il est activé trop
 * tôt, `provider-garmin-connect` répond 503 `garmin_indisponible` et le bouton
 * l'explique. Voir docs/integrations/GARMIN_DOSSIER.md, « Mise en service ».
 */
export const GARMIN_ENABLED = import.meta.env.VITE_GARMIN_ENABLED === "true";

/** Régions de compte COROS. Celle de l'athlète, pas celle de notre serveur. */
export const COROS_REGIONS = [
  { value: "eu", label: "Europe" },
  { value: "us", label: "États-Unis / reste du monde" },
  { value: "cn", label: "Chine continentale" },
] as const;

export type CorosRegion = (typeof COROS_REGIONS)[number]["value"];

/**
 * Connexions de l'athlète connecté.
 *
 * `api_host` n'est pas sélectionné : l'athlète n'a rien à faire de l'hôte
 * régional, et l'afficher ne ferait qu'exposer un détail d'implémentation dans
 * une interface.
 */
export function useProviderConnections() {
  const { user } = useAuth();

  return useQuery({
    queryKey: providerKeys.connections(user?.id ?? "none"),
    enabled: !!user,
    staleTime: 30 * 1000,
    queryFn: () => getConnections(user!.id),
  });
}

/** État d'un fournisseur donné, l'absence valant « pas connecté ». */
export function connectionFor(
  connections: ProviderConnection[] | undefined,
  provider: ProviderName,
): ProviderConnection | undefined {
  return connections?.find((c) => c.provider === provider);
}

/**
 * Démarre l'autorisation COROS.
 *
 * La fonction serveur renvoie une URL et c'est le navigateur qui y va : on ne
 * peut pas faire l'autorisation en arrière-plan, l'athlète doit s'authentifier
 * chez COROS et voir ce qu'il accorde. Une redirection complète plutôt qu'une
 * fenêtre surgissante, parce que les bloqueurs de pop-up la feraient échouer
 * sans message sur une bonne partie des navigateurs mobiles — notre cible.
 */
export function useConnectCoros() {
  return useMutation<void, Error, { region: CorosRegion }>({
    mutationFn: async ({ region }) => {
      window.location.assign(await startCorosAuthorization(region));
    },
  });
}

/**
 * Démarre l'autorisation Garmin (OAuth 2.0 PKCE). Même principe que COROS :
 * le serveur garde le `code_verifier` et le `client_secret`, le navigateur ne
 * reçoit qu'une URL et y part en redirection complète.
 */
export function useConnectGarmin() {
  return useMutation<void, ConnectError, void>({
    mutationFn: async () => {
      window.location.assign(await startGarminAuthorization());
    },
  });
}

/**
 * Synchronise maintenant, sans attendre le cron de la nuit.
 *
 * Le budget de fichiers est volontairement plus étroit que celui du cron :
 * COROS limite à 50 téléchargements par athlète et par 24 h, et laisser ce
 * quota entier à un bouton permettrait de l'épuiser en trois clics, puis de
 * bloquer le rattrapage automatique du lendemain. Le bouton est un complément,
 * pas un rattrapage — c'est le serveur qui applique cette distinction, pas
 * l'interface.
 */
export function useSyncCoros() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation<SyncReport | undefined, Error, void>({
    mutationFn: () => syncCoros(),
    // Connexion (« dernière synchro », « historique jusqu'au ») et sorties importées.
    onSuccess: () => { if (user) void invalidateProviders(qc, user.id); },
  });
}

/**
 * Déconnecte un service.
 *
 * L'athlète déconnecté est forcément celui qui demande (jeton de session) ; le
 * serveur ignore tout identifiant venu du corps de la requête sauf appel avec
 * la clé service_role, ce que le navigateur ne peut pas faire.
 *
 * Décision du 07/11/2026 : la déconnexion supprime les activités et données
 * quotidiennes importées PAR CE FOURNISSEUR (après révocation chez lui). Les
 * activités importées à la main par fichier restent. L'interface demande
 * confirmation avant, en le disant.
 */
export function useDisconnectProvider() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation<DisconnectResult, Error, ProviderName>({
    mutationFn: (provider) => disconnectProvider(provider),
    onSuccess: () => { if (user) void invalidateProviders(qc, user.id); },
  });
}
