import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Suppression définitive du compte de l'appelant — droit à l'effacement
 * (art. 17 RGPD).
 *
 * Pourquoi une Edge Function et non un simple DELETE côté client : supprimer
 * une ligne de `auth.users` exige la clé service_role, qui ne doit jamais
 * atteindre le navigateur. La fonction ne supprime QUE le compte de l'appelant,
 * identifié par son JWT — jamais un identifiant fourni dans le corps de la
 * requête, ce qui permettrait à n'importe qui de supprimer n'importe qui.
 *
 * Ordre des opérations, et pourquoi :
 *
 *   1. Journal anonyme écrit en PREMIER. Si l'étape suivante échoue, on garde
 *      une trace de la tentative ; si on l'écrivait en dernier, une
 *      interruption laisserait un compte supprimé sans trace.
 *   2. Fichiers de stockage. Les cascades SQL ne couvrent pas `storage.objects`,
 *      donc sans cette étape des pièces jointes médicales survivraient au
 *      compte.
 *   3. Jetons des services connectés, révoqués auprès du fournisseur avant
 *      d'être effacés. Effacer un jeton sans le révoquer laisse un accès actif
 *      côté Garmin ou COROS.
 *   4. Utilisateur auth. La contrainte `profiles_id_fkey ON DELETE CASCADE`
 *      propage alors l'effacement aux ~45 tables applicatives.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Buckets susceptibles de contenir des fichiers rattachés à un utilisateur. */
const USER_BUCKETS = ["medical", "test-files", "garmin-screenshots", "test-media", "avatars"];

function errMessage(err: unknown, fallback = "Erreur"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err.trim() || fallback;
  return fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // L'identité vient du JWT, jamais du corps de la requête.
    const { data: { user }, error: authError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Non autorisé");

    /*
      Confirmation explicite. L'opération est irréversible : on exige que le
      client ait fait saisir le mot à l'utilisateur, de sorte qu'un appel
      accidentel (double-clic, rejeu de requête, script) ne détruise rien.
    */
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "SUPPRIMER") {
      throw new Error("Confirmation manquante");
    }

    // ---- 1. Journal anonyme -------------------------------------------------
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const { data: coreConsent } = await admin
      .from("current_consents")
      .select("granted, doc_version")
      .eq("user_id", user.id)
      .eq("purpose", "health_data")
      .maybeSingle();

    await admin.from("account_deletions").insert({
      role: profile?.role ?? null,
      consent_version: coreConsent?.doc_version ?? null,
      had_core_consent: coreConsent?.granted ?? false,
      initiated_by: "user",
    });

    // ---- 2. Fichiers --------------------------------------------------------
    /*
      On interroge la base pour la liste exacte plutôt que de deviner les
      chemins : les conventions de nommage ont varié selon les fonctionnalités,
      et un préfixe oublié laisserait des fichiers derrière.
    */
    const { data: objects } = await admin.rpc("list_user_storage_objects", {
      target_user: user.id,
    });

    const byBucket = new Map<string, string[]>();
    for (const o of (objects ?? []) as Array<{ bucket_id: string; object_name: string }>) {
      const list = byBucket.get(o.bucket_id) ?? [];
      list.push(o.object_name);
      byBucket.set(o.bucket_id, list);
    }

    const storageErrors: string[] = [];
    for (const [bucket, names] of byBucket) {
      if (!USER_BUCKETS.includes(bucket)) continue;
      // L'API Storage limite la taille des lots : on découpe.
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (error) storageErrors.push(`${bucket}: ${error.message}`);
      }
    }

    // ---- 3. Services connectés ---------------------------------------------
    /*
      Révocation auprès du fournisseur avant effacement local. Tolérant à
      l'échec : si Garmin est injoignable, on ne doit pas pour autant refuser à
      l'utilisateur la suppression de son compte — son droit ne dépend pas de la
      disponibilité d'un tiers. Le jeton local part dans tous les cas, et sa
      durée de vie limitée clôt l'accès résiduel.
    */
    const revocationErrors: string[] = [];
    const { data: connections } = await admin
      .from("provider_connections")
      .select("provider")
      .eq("user_id", user.id);

    for (const c of (connections ?? []) as Array<{ provider: string }>) {
      try {
        const { error } = await admin.functions.invoke("provider-disconnect", {
          body: { userId: user.id, provider: c.provider, internal: true },
        });
        if (error) revocationErrors.push(`${c.provider}: ${error.message}`);
      } catch (e) {
        revocationErrors.push(`${c.provider}: ${errMessage(e)}`);
      }
    }

    // ---- 4. Compte auth ----------------------------------------------------
    // Déclenche la cascade vers profiles puis vers toutes les tables liées.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(`Suppression impossible : ${deleteError.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        // Remontés pour journalisation côté client, sans faire échouer
        // l'opération : le compte est bien supprimé.
        warnings: [...storageErrors, ...revocationErrors],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: errMessage(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
