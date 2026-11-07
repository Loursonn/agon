/**
 * Première moitié de l'autorisation Garmin (OAuth 2.0 PKCE) : construire l'URL
 * vers laquelle envoyer l'athlète.
 *
 * Le navigateur ne reçoit qu'une URL publique. Le `code_verifier` reste dans
 * `provider_oauth_states` (service_role seul, 10 minutes) ; le
 * `client_secret`, obligatoire chez Garmin, ne quitte jamais le serveur.
 *
 * Tant que les secrets Garmin ne sont pas posés (dossier en cours d'examen),
 * la fonction répond 503 `garmin_indisponible` : l'interface l'affiche comme
 * « bientôt disponible » au lieu d'une erreur.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasConsent, requireUser } from "../_shared/auth.ts";
import { garminCallbackUri, garminFromEnv } from "../_shared/garminConfig.ts";
import { startAuthorization } from "../_shared/oauth.ts";
import { GARMIN_API_HOST } from "../_shared/providers/garmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireUser(req);

    const adapter = garminFromEnv();
    if (!adapter) {
      return json(
        {
          error: "garmin_indisponible",
          message: "La connexion Garmin n'est pas encore ouverte : Agon attend la validation de Garmin.",
        },
        503,
      );
    }

    // Sans APP_URL, le retour n'aurait nulle part où renvoyer l'athlète.
    if (!Deno.env.get("APP_URL")) {
      console.error("provider-garmin-connect: APP_URL non configuré");
      return json(
        {
          error: "configuration_incomplete",
          message: "La connexion aux montres n'est pas encore configurée côté serveur. Signale-le à ton coach.",
        },
        503,
      );
    }

    // Refuser tôt est un refus lisible ; la base revérifie à l'insertion.
    if (!(await hasConsent(user.id, "garmin_sync"))) {
      return json(
        {
          error: "consentement_absent",
          message: "Autorise d'abord la synchronisation Garmin.",
        },
        403,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { authorizeUrl } = await startAuthorization(admin, adapter, {
      athleteId: user.id,
      redirectUri: garminCallbackUri(),
      apiHost: GARMIN_API_HOST,
    });

    return json({ authorizeUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Non autorisé") return json({ error: msg }, 401);
    console.error("provider-garmin-connect:", msg.slice(0, 300));
    return json({ error: "erreur", message: "Impossible de démarrer la connexion Garmin." }, 500);
  }
});
