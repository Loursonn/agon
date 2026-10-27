/**
 * Déconnexion d'un service tiers.
 *
 * Deux appelants, un seul chemin :
 *   - l'athlète depuis ses paramètres, avec son jeton de session ;
 *   - `delete-account`, qui révoque avant d'effacer le compte, avec la clé
 *     `service_role`.
 *
 * Ordre des opérations : révoquer chez le fournisseur D'ABORD, effacer nos
 * jetons ENSUITE. Dans l'autre sens, un échec de révocation nous laisserait
 * sans le jeton nécessaire pour réessayer — et un accès COROS resterait ouvert
 * sans que personne ne puisse plus le fermer.
 *
 * Ce que la déconnexion n'efface pas : les activités et données quotidiennes
 * déjà importées. Ce sont les données d'entraînement de l'athlète, pas celles
 * du fournisseur ; les supprimer parce qu'il débranche sa montre lui ferait
 * perdre son historique sans qu'il l'ait demandé. Pour tout effacer, il y a la
 * suppression de compte.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchMetadata, revokeToken } from "../_shared/coros.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const bearer = authHeader.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === "string" ? body.provider : "";
    if (provider !== "coros" && provider !== "garmin") {
      return json({ error: "fournisseur inconnu" }, 400);
    }

    /*
      Qui est déconnecté, et comment on le décide.

      `delete-account` passe un `userId` dans le corps. Faire confiance à ce
      champ sans condition rendrait cette fonction capable de déconnecter
      n'importe qui sur simple requête, puisque la clé publiable suffit à
      atteindre une Edge Function — exactement le trou qui existait dans
      `ai-program` avant d'être bouché.
      Le `userId` du corps n'est donc retenu que si l'appelant a présenté la
      clé `service_role`, qui n'existe que côté serveur. Sinon, l'athlète
      déconnecté est celui du jeton de session, et le corps est ignoré. Le
      champ `internal: true` que `delete-account` envoie n'entre pas dans la
      décision : une requête qui se déclare interne ne l'est pas pour autant.
    */
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServerCall = bearer === serviceKey;

    let athleteId: string;
    if (isServerCall) {
      athleteId = typeof body?.userId === "string" ? body.userId : "";
      if (!athleteId) return json({ error: "userId requis" }, 400);
    } else {
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data.user) return json({ error: "Non autorisé" }, 401);
      athleteId = data.user.id;
    }

    const { data: connection, error: connError } = await admin
      .from("provider_connections")
      .select("id, api_host")
      .eq("athlete_id", athleteId)
      .eq("provider", provider)
      .maybeSingle();
    if (connError) throw new Error(`lecture de la connexion : ${connError.message}`);

    // Déjà déconnecté : succès, pas erreur. La déconnexion est idempotente —
    // un double clic ne doit pas afficher un échec sur une opération réussie.
    if (!connection) return json({ success: true, revoked: false, alreadyGone: true });

    // ---- 1. Révocation chez le fournisseur ---------------------------------
    let revoked = false;
    const warnings: string[] = [];

    if (provider === "coros" && connection.api_host) {
      try {
        const { data: tokenRows } = await admin.rpc("provider_token_read", {
          p_connection_id: connection.id,
        });
        const tokens = (tokenRows ?? [])[0] as
          | { access_token: string | null; refresh_token: string | null }
          | undefined;

        const { data: client } = await admin
          .from("provider_oauth_clients")
          .select("client_id")
          .eq("provider", "coros")
          .eq("api_host", connection.api_host)
          .maybeSingle();

        if (tokens?.access_token && client?.client_id) {
          const meta = await fetchMetadata(connection.api_host as string);
          /*
            Les deux jetons, séparément. Révoquer le jeton d'accès ne révoque
            pas forcément le `refresh_token` : la RFC 7009 laisse le serveur
            libre sur ce point, et laisser vivre un jeton de rafraîchissement
            revient à ne pas avoir révoqué du tout.
          */
          revoked = await revokeToken(meta, {
            token: tokens.access_token,
            clientId: client.client_id as string,
          });
          if (tokens.refresh_token) {
            await revokeToken(meta, {
              token: tokens.refresh_token,
              clientId: client.client_id as string,
            });
          }
          if (!revoked) warnings.push("COROS n'a pas confirmé la révocation");
        } else {
          warnings.push("aucun jeton à révoquer");
        }
      } catch (e) {
        /*
          Tolérant à l'échec, et c'est un choix assumé. Le droit de l'athlète à
          débrancher sa montre ne dépend pas de la disponibilité de COROS. Nos
          jetons partent dans tous les cas, et leur durée de vie limitée clôt
          l'accès résiduel ; l'avertissement remonte pour qu'on ne confonde pas
          « l'accès est coupé » avec « j'ai jeté ma copie de la clé ».
        */
        warnings.push(
          `révocation impossible : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // ---- 2. Effacement local -----------------------------------------------
    /*
      La suppression de la connexion cascade vers `provider_tokens`, dont le
      déclencheur `provider_tokens_drop_secrets` supprime les secrets du Vault.
      Sans ce déclencheur, les jetons resteraient chiffrés dans le Vault pour
      toujours — conservés après que l'athlète a demandé le contraire.
    */
    const { error: deleteError } = await admin
      .from("provider_connections")
      .delete()
      .eq("id", connection.id);
    if (deleteError) throw new Error(`effacement : ${deleteError.message}`);

    return json({ success: true, revoked, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("provider-disconnect:", msg.slice(0, 500));
    return json({ error: msg }, 500);
  }
});
