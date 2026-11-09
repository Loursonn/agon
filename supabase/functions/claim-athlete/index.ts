import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { birthDateError, MIN_AGE_MESSAGE } from "../_shared/domain/age.ts";

/**
 * Réclamation d'un compte athlète pré-créé par son coach.
 *
 * Appelée AVANT toute connexion (verify_jwt = false dans config.toml) : le jeton
 * secret du lien fait office d'autorisation. Il remplace l'email jetable et le
 * mot de passe aléatoire du compte fantôme par ceux choisis par l'athlète, puis
 * retire le jeton (usage unique). Le client se connecte ensuite normalement.
 *
 * Âge minimum (15 ans) : la date de naissance (`birthDate`, "YYYY-MM-DD") est
 * vérifiée AVANT de toucher au compte, puis enregistrée sur le profil. Le
 * trigger `enforce_min_age_on_signup` refait le contrôle en base.
 */

/**
 * Phase 2 (2026-11-09) : le client de prod (`main`) envoie `birthDate`, donc
 * une activation sans date est refusée. À déployer en même temps que la
 * migration 20261109170000 (date obligatoire côté base).
 */
const BIRTH_DATE_REQUIRED = true;

/**
 * « Aujourd'hui » le plus avancé sur Terre (UTC+14) : personne n'est refusé
 * la veille de ses 15 ans à cause du fuseau du serveur. Même règle en SQL.
 */
function latestToday(now = new Date()): string {
  return new Date(now.getTime() + 14 * 3600_000).toISOString().slice(0, 10);
}

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
    const { token, email, password, birthDate } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();

    if (typeof token !== "string" || token.length < 32) throw new Error("Lien invalide ou déjà utilisé");
    if (!EMAIL_RE.test(cleanEmail)) throw new Error("Email invalide");
    if (typeof password !== "string" || password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères");
    }
    const hasBirthDate = birthDate !== undefined && birthDate !== null && birthDate !== "";
    if (hasBirthDate || BIRTH_DATE_REQUIRED) {
      const msg = birthDateError(birthDate, latestToday());
      if (msg) throw new Error(msg);
    }
    const cleanBirthDate = hasBirthDate ? String(birthDate).trim() : null;

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
      .select("id, is_pending, birth_date")
      .eq("id", claim.athlete_id)
      .maybeSingle();
    if (!athlete?.is_pending) throw new Error("Lien invalide ou déjà utilisé");
    // Sans date fournie (ancien client), celle que le coach a pu saisir compte.
    if (!cleanBirthDate && athlete.birth_date && birthDateError(athlete.birth_date, latestToday()) === MIN_AGE_MESSAGE) {
      throw new Error(MIN_AGE_MESSAGE);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(athlete.id, {
      email: cleanEmail,
      password,
      email_confirm: true,
    });
    if (updateErr) {
      const taken = /already|registered|exists/i.test(updateErr.message);
      throw new Error(taken ? "Cet email est déjà utilisé" : "Activation impossible");
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update(cleanBirthDate ? { is_pending: false, birth_date: cleanBirthDate } : { is_pending: false })
      .eq("id", athlete.id);
    if (profileErr) {
      // Refus du trigger d'âge (ne devrait pas arriver : vérifié plus haut).
      throw new Error(/15 ans/.test(profileErr.message) ? MIN_AGE_MESSAGE : "Activation impossible");
    }
    await admin.from("athlete_claims").delete().eq("athlete_id", athlete.id);

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur" }, 400);
  }
});
