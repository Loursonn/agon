/**
 * Première moitié de l'autorisation COROS : construire l'URL vers laquelle
 * envoyer l'athlète.
 *
 * Ce que cette fonction ne fait pas, et pourquoi c'est important : elle ne
 * renvoie au navigateur ni `code_verifier`, ni `client_secret` (il n'en existe
 * pas), ni quoi que ce soit qui permette de terminer l'échange. Le navigateur
 * ne reçoit qu'une URL publique et un `state`. Tout le reste reste en base,
 * dans `provider_oauth_states`, lisible par `service_role` seul.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasConsent, requireUser } from "../_shared/auth.ts";
import {
  COROS_HOSTS,
  COROS_SCOPES,
  createPkce,
  fetchMetadata,
  randomToken,
  registerClient,
  resolveRegion,
} from "../_shared/coros.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** URL de retour que COROS appellera. Doit être identique à l'inscription. */
function callbackUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/provider-coros-callback`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireUser(req);

    /*
      Contrôle de configuration avant tout le reste. Sans `APP_URL`, la
      fonction de retour n'a pas d'interface où renvoyer l'athlète : il
      s'authentifierait chez COROS, accorderait l'accès, et se retrouverait sur
      une adresse morte — autorisation accordée, aucune trace visible, aucune
      idée de ce qui a échoué. Refuser de partir est le seul comportement
      honnête.
    */
    if (!Deno.env.get("APP_URL")) {
      console.error("provider-coros-connect: APP_URL non configuré");
      return json(
        {
          error: "configuration_incomplete",
          message:
            "La connexion aux montres n'est pas encore configurée côté serveur. Signale-le à ton coach.",
        },
        503,
      );
    }

    /*
      Le consentement est vérifié ici, avant même de parler à COROS. La base le
      revérifie à l'insertion de la connexion (`require_sync_consent`), donc ce
      contrôle n'est pas ce qui protège — mais sans lui, l'athlète irait
      s'authentifier chez COROS, accorderait l'accès, et verrait l'opération
      échouer au retour sans comprendre pourquoi. Refuser tôt est un refus
      lisible.
    */
    if (!(await hasConsent(user.id, "coros_sync"))) {
      return json(
        {
          error: "consentement_absent",
          message:
            "Autorise d'abord la synchronisation COROS dans tes paramètres de confidentialité.",
        },
        403,
      );
    }

    const body = await req.json().catch(() => ({}));
    const region = resolveRegion(body?.region);
    const host = COROS_HOSTS[region];
    const redirectUri = callbackUri();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const meta = await fetchMetadata(host);

    /*
      Un client enregistré par hôte, réutilisé ensuite. Enregistrer à chaque
      autorisation fonctionnerait aussi, et c'est le piège : on accumulerait un
      client COROS par connexion, sans moyen de savoir lequel appartient à qui
      le jour où il faut en révoquer un.
    */
    const { data: existing } = await admin
      .from("provider_oauth_clients")
      .select("client_id")
      .eq("provider", "coros")
      .eq("api_host", host)
      .maybeSingle();

    let clientId = existing?.client_id as string | undefined;
    if (!clientId) {
      const registered = await registerClient(meta, redirectUri);
      clientId = registered.client_id;
      /*
        `upsert` et non `insert` : deux athlètes qui se connectent dans la même
        seconde enregistreraient deux clients, et le second insert échouerait
        sur la clé primaire. Garder le dernier est sans conséquence — les deux
        `client_id` sont valides chez COROS — alors qu'une erreur 500 au visage
        de l'athlète en aurait une.
      */
      await admin.from("provider_oauth_clients").upsert(
        {
          provider: "coros",
          api_host: host,
          client_id: clientId,
          scope: registered.scope,
        },
        { onConflict: "provider,api_host" },
      );
    }

    const { verifier, challenge } = await createPkce();
    const state = randomToken(32);

    /*
      Écrit avant de renvoyer l'URL. Si l'insertion échoue, l'athlète ne part
      pas chez COROS : mieux vaut un bouton qui ne marche pas qu'une
      autorisation accordée dont le retour ne pourra jamais être validé.
    */
    const { error: stateError } = await admin.from("provider_oauth_states").insert({
      state,
      athlete_id: user.id,
      provider: "coros",
      api_host: host,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    if (stateError) throw new Error(`état d'autorisation : ${stateError.message}`);

    const authorizeUrl = new URL(meta.authorization_endpoint);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", COROS_SCOPES);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return json({ authorizeUrl: authorizeUrl.toString(), region });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Non autorisé") return json({ error: msg }, 401);
    console.error("provider-coros-connect:", msg);
    return json({ error: msg }, 500);
  }
});
