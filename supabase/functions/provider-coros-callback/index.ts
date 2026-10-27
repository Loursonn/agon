/**
 * Seconde moitié de l'autorisation COROS : le retour de l'athlète.
 *
 * Cette fonction est appelée par le NAVIGATEUR, redirigé par COROS. Elle n'a
 * donc aucun en-tête `Authorization` à lire, et doit être déployée en
 * `verify_jwt = false` (voir `supabase/config.toml`). Ce qui tient lieu
 * d'authentification, c'est le `state` : une valeur de 256 bits que nous seuls
 * avons émise, stockée côté serveur, et consommée une seule fois.
 *
 * Conséquence du choix d'URL de retour : le `code` d'autorisation arrive sur
 * une Edge Function, pas sur une page React. Il ne traverse donc jamais notre
 * JavaScript, n'atterrit pas dans l'historique d'un composant ni dans un outil
 * de mesure d'audience. Le navigateur ne repart qu'avec une redirection vers
 * l'interface et un mot sur le résultat.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exchangeCode, fetchMetadata } from "../_shared/coros.ts";

/** Page de retour dans l'interface, avec le résultat en clair pour l'athlète. */
function back(outcome: string): Response {
  /*
    Destination issue de la configuration du serveur, jamais d'un paramètre de
    la requête. Un `return_to` accepté depuis l'URL ferait de cette fonction
    une redirection ouverte, utilisable pour faire croire qu'un site tiers est
    hébergé par Agon.
  */
  const appUrl = Deno.env.get("APP_URL") ?? "";
  // La page qui porte le panneau « Services connectés », donc celle où
  // l'athlète s'attend à retrouver le résultat de ce qu'il vient de faire.
  const target = new URL("/athlete/profil", appUrl || "http://localhost:5173");
  target.searchParams.set("coros", outcome);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");

  try {
    // L'athlète a refusé, ou COROS a interrompu. Rien à nettoyer : la ligne
    // d'état expirera d'elle-même et la purge quotidienne s'en chargera.
    if (providerError) return back("refus");
    if (!state || !code) return back("parametres_manquants");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /*
      Lecture et suppression en une seule opération SQL. Un `code`
      d'autorisation ne doit servir qu'une fois, et les Edge Functions étant
      sans état et concurrentes, un `select` suivi d'un `delete` laisserait une
      fenêtre où deux appels simultanés avec le même `state` réussiraient tous
      les deux.
    */
    const { data: states, error: consumeError } = await admin.rpc("consume_oauth_state", {
      p_state: state,
    });
    if (consumeError) throw new Error(`consommation du state : ${consumeError.message}`);

    const pending = (states ?? [])[0] as
      | {
        athlete_id: string;
        api_host: string;
        code_verifier: string;
        redirect_uri: string;
      }
      | undefined;

    /*
      Aucune ligne : `state` inconnu, déjà consommé, ou expiré. Les trois cas
      reçoivent la même réponse, volontairement — distinguer « jamais émis » de
      « déjà utilisé » renseignerait quelqu'un qui tâtonne.
    */
    if (!pending) return back("expire");

    const meta = await fetchMetadata(pending.api_host);

    const { data: client } = await admin
      .from("provider_oauth_clients")
      .select("client_id")
      .eq("provider", "coros")
      .eq("api_host", pending.api_host)
      .maybeSingle();
    if (!client?.client_id) return back("client_introuvable");

    const tokens = await exchangeCode(meta, {
      code,
      verifier: pending.code_verifier,
      clientId: client.client_id as string,
      redirectUri: pending.redirect_uri,
    });

    /*
      `offline_access` absent des scopes accordés veut dire : pas de
      `refresh_token`, donc une synchronisation qui s'arrêtera à l'expiration
      du jeton d'accès. On n'échoue pas — l'athlète a bien autorisé quelque
      chose — mais on l'inscrit dans `last_error` pour que l'interface puisse le
      dire, au lieu de laisser la connexion mourir silencieusement.
    */
    const sansRafraichissement = !tokens.scopes.includes("offline_access") ||
      !tokens.refresh_token;

    const { data: connection, error: connError } = await admin
      .from("provider_connections")
      .upsert(
        {
          athlete_id: pending.athlete_id,
          provider: "coros",
          api_host: pending.api_host,
          granted_scopes: tokens.scopes,
          status: "active",
          last_error: sansRafraichissement
            ? "COROS n'a pas accordé offline_access : la synchronisation s'arrêtera à l'expiration du jeton. Reconnecte le compte."
            : null,
        },
        { onConflict: "athlete_id,provider" },
      )
      .select("id")
      .single();

    /*
      Le déclencheur `require_sync_consent` refuse l'insertion si le
      consentement a été retiré entre le départ vers COROS et le retour. C'est
      un cas réel : dix minutes suffisent pour changer d'avis dans un autre
      onglet. Le jeton n'est alors jamais écrit.
    */
    if (connError || !connection) {
      console.error("provider-coros-callback: connexion refusée", connError?.message);
      return back("consentement_absent");
    }

    const { error: tokenError } = await admin.rpc("provider_token_write", {
      p_connection_id: connection.id,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null,
      p_expires_at: tokens.expires_at ?? null,
    });
    if (tokenError) throw new Error(`écriture du jeton : ${tokenError.message}`);

    return back(sansRafraichissement ? "partiel" : "ok");
  } catch (e) {
    /*
      Message tronqué et jamais renvoyé au navigateur. Les erreurs de cette
      fonction peuvent contenir des fragments de réponse de COROS ; la
      redirection ne porte qu'un mot.
    */
    const msg = e instanceof Error ? e.message : String(e);
    console.error("provider-coros-callback:", msg.slice(0, 500));
    return back("erreur");
  }
});
