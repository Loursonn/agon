import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";

/**
 * Services connectés de l'athlète (montres COROS, Garmin à venir).
 *
 * Tout ce qui est sensible se passe côté serveur : le `code_verifier` PKCE, le
 * `client_id`, l'échange du code, les jetons. Ce module ne fait que trois
 * choses — lire l'état des connexions, demander une URL d'autorisation, et
 * demander une déconnexion. Aucun jeton ne transite par ici, et
 * `provider_tokens` est de toute façon inaccessible depuis le navigateur (RLS
 * active, aucune politique).
 */

export type ProviderName = "garmin" | "coros";

/** Régions de compte COROS. Celle de l'athlète, pas celle de notre serveur. */
export const COROS_REGIONS = [
  { value: "eu", label: "Europe" },
  { value: "us", label: "États-Unis / reste du monde" },
  { value: "cn", label: "Chine continentale" },
] as const;

export type CorosRegion = (typeof COROS_REGIONS)[number]["value"];

export interface ProviderConnection {
  id: string;
  provider: ProviderName;
  status: "active" | "expired" | "revoked" | "consent_withdrawn" | "error";
  grantedScopes: string[];
  connectedAt: string;
  lastSyncAt: string | null;
  syncedThrough: string | null;
  lastError: string | null;
}

interface ConnectionRow {
  id: string;
  provider: ProviderName;
  status: ProviderConnection["status"];
  granted_scopes: string[] | null;
  connected_at: string;
  last_sync_at: string | null;
  synced_through: string | null;
  last_error: string | null;
}

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
    queryKey: QK.providerConnections(user?.id ?? "none"),
    enabled: !!user,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ProviderConnection[]> => {
      const { data, error } = await supabase
        .from("provider_connections")
        .select(
          "id, provider, status, granted_scopes, connected_at, last_sync_at, synced_through, last_error",
        )
        .eq("athlete_id", user!.id);

      if (error) throw error;

      return ((data ?? []) as ConnectionRow[]).map((r) => ({
        id: r.id,
        provider: r.provider,
        status: r.status,
        grantedScopes: r.granted_scopes ?? [],
        connectedAt: r.connected_at,
        lastSyncAt: r.last_sync_at,
        syncedThrough: r.synced_through,
        lastError: r.last_error,
      }));
    },
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
      const { data, error } = await supabase.functions.invoke<{ authorizeUrl?: string }>(
        "provider-coros-connect",
        { body: { region } },
      );
      if (error) throw new Error(error.message);
      if (!data?.authorizeUrl) throw new Error("URL d'autorisation absente");

      window.location.assign(data.authorizeUrl);
    },
  });
}

export interface DisconnectResult {
  success: boolean;
  /** Vrai si le fournisseur a confirmé la révocation de son côté. */
  revoked?: boolean;
  warnings?: string[];
}

/**
 * Déconnecte un service.
 *
 * `invoke()` porte le jeton de session : l'athlète déconnecté est forcément
 * celui qui demande. Le serveur ignore tout identifiant venu du corps de la
 * requête sauf s'il est appelé avec la clé service_role, ce que le navigateur
 * ne peut pas faire.
 *
 * Les activités déjà importées restent : ce sont les données d'entraînement de
 * l'athlète, pas celles de la montre. Les effacer parce qu'il débranche son
 * compte lui ferait perdre son historique sans l'avoir demandé.
 */
export function useDisconnectProvider() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation<DisconnectResult, Error, ProviderName>({
    mutationFn: async (provider) => {
      const { data, error } = await supabase.functions.invoke<DisconnectResult>(
        "provider-disconnect",
        { body: { provider } },
      );
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error("La déconnexion n'a pas abouti");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.providerConnections(user?.id ?? "none") });
    },
  });
}
