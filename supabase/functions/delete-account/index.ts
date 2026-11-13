import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deleteAccount, type DeletionAdmin } from "../_shared/accountDeletion.ts";

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
 * Ordre des opérations (journal anonyme, fichiers, révocation des montres,
 * compte auth puis cascade) et raisons : `_shared/accountDeletion.ts`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Journal anonyme, fichiers, révocation des montres, compte auth (cascade) :
    // `_shared/accountDeletion.ts`, commun avec la purge `account-retention`.
    const { warnings } = await deleteAccount(admin as unknown as DeletionAdmin, user.id, "user");

    return new Response(
      JSON.stringify({
        success: true,
        // Remontés pour journalisation côté client, sans faire échouer
        // l'opération : le compte est bien supprimé.
        warnings,
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
