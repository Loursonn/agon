import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";

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

export type ProviderName = "garmin" | "coros";

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

/** Erreur renvoyée par une fonction de connexion, avec son code serveur. */
export class ConnectError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

/**
 * Lit le corps JSON d'une erreur d'Edge Function. `supabase.functions.invoke`
 * ne rend qu'un message générique (« non-2xx status code ») ; le code serveur
 * (`garmin_indisponible`, `consentement_absent`…) est dans la réponse.
 */
async function connectError(error: { message: string; context?: unknown }): Promise<ConnectError> {
  const ctx = error.context as { json?: () => Promise<unknown> } | undefined;
  try {
    const body = (await ctx?.json?.()) as { error?: unknown; message?: unknown } | undefined;
    if (body && typeof body === "object") {
      return new ConnectError(
        typeof body.message === "string" ? body.message : error.message,
        typeof body.error === "string" ? body.error : null,
      );
    }
  } catch {
    /* corps illisible : message générique */
  }
  return new ConnectError(error.message, null);
}

/** Régions de compte COROS. Celle de l'athlète, pas celle de notre serveur. */
export const COROS_REGIONS = [
  { value: "eu", label: "Europe" },
  { value: "us", label: "États-Unis / reste du monde" },
  { value: "cn", label: "Chine continentale" },
] as const;

export type CorosRegion = (typeof COROS_REGIONS)[number]["value"];

/**
 * États possibles d'une connexion, repris à l'identique de l'énumération
 * `provider_status` en base.
 *
 * Écrit de mémoire la première fois, avec un `expired` et un `error` qui
 * n'existent pas et sans `needs_reauth` qui existe : l'interface ne pouvait
 * donc pas réagir au seul état qui demande une action de l'athlète. Les quatre
 * valeurs sont distinctes exprès — `needs_reauth` est un refus du fournisseur,
 * `consent_withdrawn` une décision de l'athlète, et les confondre ferait
 * afficher « reconnecte ta montre » à quelqu'un qui vient justement de retirer
 * son accord.
 */
export type ProviderStatus =
  | "active"
  | "needs_reauth"
  | "consent_withdrawn"
  | "revoked";

export interface ProviderConnection {
  id: string;
  provider: ProviderName;
  status: ProviderStatus;
  grantedScopes: string[];
  connectedAt: string;
  lastSyncAt: string | null;
  syncedThrough: string | null;
  lastError: string | null;
}

interface ConnectionRow {
  id: string;
  provider: ProviderName;
  status: ProviderStatus;
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

/**
 * Démarre l'autorisation Garmin (OAuth 2.0 PKCE). Même principe que COROS :
 * le serveur garde le `code_verifier` et le `client_secret`, le navigateur ne
 * reçoit qu'une URL et y part en redirection complète.
 */
export function useConnectGarmin() {
  return useMutation<void, ConnectError, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ authorizeUrl?: string }>(
        "provider-garmin-connect",
        { body: {} },
      );
      if (error) throw await connectError(error);
      if (!data?.authorizeUrl) throw new ConnectError("URL d'autorisation absente", null);
      window.location.assign(data.authorizeUrl);
    },
  });
}

export interface SyncReport {
  athleteId: string;
  imported: number;
  duplicates: number;
  rejected: Array<{ name: string; reason: string }>;
  dailies: number;
  syncedThrough: string | null;
  error?: string;
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
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ reports?: SyncReport[] }>(
        "provider-coros-sync",
        { body: {} },
      );
      if (error) throw new Error(error.message);
      return data?.reports?.[0];
    },
    onSuccess: () => {
      /*
        Les activités importées changent aussi, mais leur clé de requête
        dépend de la page qui les lit : invalider la connexion suffit pour que
        « dernière synchro » et « historique jusqu'au » soient à jour, et le
        reste se rafraîchira à la navigation.
      */
      qc.invalidateQueries({ queryKey: QK.providerConnections(user?.id ?? "none") });
    },
  });
}

export interface DisconnectResult {
  success: boolean;
  /** Vrai si le fournisseur a confirmé la révocation de son côté. */
  revoked?: boolean;
  warnings?: string[];
  /** Ce qui a été supprimé chez nous (activités, journées, connexion). */
  deleted?: { activities: number; dailies: number; inbox: number; connection: number };
}

/**
 * Déconnecte un service.
 *
 * `invoke()` porte le jeton de session : l'athlète déconnecté est forcément
 * celui qui demande. Le serveur ignore tout identifiant venu du corps de la
 * requête sauf s'il est appelé avec la clé service_role, ce que le navigateur
 * ne peut pas faire.
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
      // Les sorties de ce fournisseur viennent d'être supprimées.
      qc.invalidateQueries({ queryKey: QK.providerActivities(user?.id ?? "none") });
    },
  });
}
