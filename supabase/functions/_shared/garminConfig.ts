/**
 * Configuration Garmin lue dans l'environnement des Edge Functions.
 *
 * Séparé de `providers/garmin.ts` (pur, testé par Vitest) parce que ce module
 * lit `Deno.env`. Tant que les secrets ne sont pas posés — c'est-à-dire tant
 * que Garmin n'a pas approuvé le dossier — `garminFromEnv()` rend `null` et
 * chaque fonction Garmin répond 503 proprement.
 *
 * Secrets (supabase secrets set, le jour de l'approbation) :
 *   GARMIN_CLIENT_ID       — « Consumer key » du portail développeur
 *   GARMIN_CLIENT_SECRET   — « Consumer secret » (obligatoire chez Garmin)
 *   GARMIN_WEBHOOK_TOKEN   — chaîne aléatoire (≥ 32 caractères) ajoutée à
 *                            l'URL de webhook déclarée dans le portail ; c'est
 *                            ce qui authentifie l'origine des notifications.
 */
import type { ProviderAdapter } from "./oauth.ts";
import { garminAdapter } from "./providers/garmin.ts";

export function garminFromEnv(): ProviderAdapter | null {
  const clientId = Deno.env.get("GARMIN_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GARMIN_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) return null;
  return garminAdapter({ clientId, clientSecret });
}

export function garminWebhookToken(): string | null {
  const t = Deno.env.get("GARMIN_WEBHOOK_TOKEN") ?? "";
  // Un jeton court serait devinable : on préfère ne pas ouvrir l'endpoint.
  return t.length >= 32 ? t : null;
}

/** URL de retour déclarée dans le portail Garmin. */
export function garminCallbackUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/provider-garmin-callback`;
}
