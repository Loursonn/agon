import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Réclamation d'un compte athlète pré-créé par son coach.
 *
 * Appelée AVANT toute connexion (verify_jwt = false dans config.toml) : le jeton
 * secret du lien fait office d'autorisation. Il remplace l'email jetable et le
 * mot de passe aléatoire du compte fantôme par ceux choisis par l'athlète, puis
 * retire le jeton (usage unique). Le client se connecte ensuite normalement.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, email, password } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();

    if (typeof token !== "string" || token.length < 32) throw new Error("Lien invalide ou déjà utilisé");
    if (!EMAIL_RE.test(cleanEmail)) throw new Error("Email invalide");
    if (typeof password !== "string" || password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères");
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: claim } = await admin
      .from("athlete_claims")
      .select("athlete_id")
      .eq("token", token)
      .maybeSingle();
    if (!claim) throw new Error("Lien invalide ou déjà utilisé");

    const { data: athlete } = await admin
      .from("profiles")
      .select("id, is_pending")
      .eq("id", claim.athlete_id)
      .maybeSingle();
    if (!athlete?.is_pending) throw new Error("Lien invalide ou déjà utilisé");

    const { error: updateErr } = await admin.auth.admin.updateUserById(athlete.id, {
      email: cleanEmail,
      password,
      email_confirm: true,
    });
    if (updateErr) {
      const taken = /already|registered|exists/i.test(updateErr.message);
      throw new Error(taken ? "Cet email est déjà utilisé" : "Activation impossible");
    }

    await admin.from("profiles").update({ is_pending: false }).eq("id", athlete.id);
    await admin.from("athlete_claims").delete().eq("athlete_id", athlete.id);

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur" }, 400);
  }
});
