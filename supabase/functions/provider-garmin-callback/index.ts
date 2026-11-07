/**
 * Seconde moitié de l'autorisation Garmin : le retour de l'athlète.
 *
 * Appelée par le NAVIGATEUR, redirigé par Garmin : pas d'en-tête
 * `Authorization`, donc `verify_jwt = false` (supabase/config.toml). Ce qui
 * authentifie l'appel est le `state` (256 bits, émis par nous, consommé une
 * seule fois, 10 minutes, et émis pour Garmin — un `state` COROS ne passe pas).
 *
 * Étapes : échange du code (avec `client_secret`), `GET /user/id` pour
 * l'identifiant Garmin qui rattachera les webhooks, `GET /user/permissions`
 * pour savoir ce que l'athlète a réellement autorisé, enregistrement de la
 * connexion puis des jetons (Vault). Le navigateur repart vers `APP_URL` avec
 * un mot sur le résultat — jamais le code, jamais un jeton.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { garminFromEnv } from "../_shared/garminConfig.ts";
import { consumeAuthorization, exchangeCode, storeTokens } from "../_shared/oauth.ts";
import { fetchGarminPermissions, GARMIN_API_HOST, GARMIN_PERMISSIONS } from "../_shared/providers/garmin.ts";

/** Destination issue de la configuration, jamais d'un paramètre (pas de redirection ouverte). */
function back(outcome: string): Response {
  const appUrl = Deno.env.get("APP_URL") ?? "";
  const target = new URL("/athlete/profil", appUrl || "http://localhost:5173");
  target.searchParams.set("garmin", outcome);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  try {
    if (url.searchParams.get("error")) return back("refus");
    if (!state || !code) return back("parametres_manquants");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Inconnu, déjà consommé, expiré ou émis pour un autre fournisseur : même réponse.
    const pending = await consumeAuthorization(admin, state, "garmin");
    if (!pending) return back("expire");

    const adapter = garminFromEnv();
    if (!adapter) return back("indisponible");

    const tokens = await exchangeCode(adapter, {
      code,
      verifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });

    const externalUserId = await adapter.fetchUserId(tokens.accessToken);

    /*
      Les permissions accordées. Une lecture qui échoue n'annule pas la
      connexion (l'athlète a bien autorisé) : liste vide = inconnue, et le
      webhook `userPermissionsChange` la corrigera.
    */
    let permissions: string[] = [];
    try {
      permissions = await fetchGarminPermissions(tokens.accessToken);
    } catch (e) {
      console.warn("provider-garmin-callback: permissions illisibles", e instanceof Error ? e.message : "");
    }
    const partiel = permissions.length > 0 &&
      !permissions.includes(GARMIN_PERMISSIONS.activity) &&
      !permissions.includes(GARMIN_PERMISSIONS.health);

    const { data: connection, error: connError } = await admin
      .from("provider_connections")
      .upsert(
        {
          athlete_id: pending.athleteId,
          provider: "garmin",
          api_host: GARMIN_API_HOST,
          external_user_id: externalUserId,
          granted_scopes: permissions,
          status: "active",
          connected_at: new Date().toISOString(),
          last_error: partiel
            ? "Garmin n'a autorisé ni les activités ni les données de santé : rien ne sera importé. Reconnecte le compte en cochant ces autorisations."
            : null,
        },
        { onConflict: "athlete_id,provider" },
      )
      .select("id")
      .single();

    if (connError || !connection) {
      /*
        23505 sur (provider, external_user_id) : ce compte Garmin est déjà lié
        à un autre athlète Agon. Surtout PAS de DELETE /user/registration ici :
        l'enregistrement est par utilisateur Garmin et par application, on
        couperait la connexion de l'autre athlète. On jette simplement les
        jetons obtenus.
      */
      if (connError?.code === "23505") return back("compte_deja_lie");
      // Le déclencheur `require_sync_consent` : accord retiré pendant l'aller-retour.
      console.error("provider-garmin-callback: connexion refusée", connError?.code ?? "");
      return back("consentement_absent");
    }

    await storeTokens(admin, connection.id as string, tokens);

    return back(partiel ? "partiel" : "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("provider-garmin-callback:", msg.slice(0, 300));
    return back("erreur");
  }
});
