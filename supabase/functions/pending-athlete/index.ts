import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

/**
 * Athlète pré-créé par le coach, avant sa première connexion.
 *
 *  - action "create" : crée un compte auth « fantôme » + son profil rattaché au
 *    coach + un jeton de réclamation. Le coach peut programmer dessus aussitôt.
 *  - action "delete" : supprime un athlète encore non réclamé (compte auth
 *    compris, le profil et le jeton partent en cascade). Un athlète pré-créé n'a
 *    pas d'historique à conserver, et le laisser orphelin garderait un lien de
 *    réclamation valide vers un compte que le coach a abandonné.
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

/** Jeton non devinable : 2 UUID v4 sans tirets (≈ 244 bits d'aléa). */
function newToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: coach } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!coach || (coach.role !== "coach" && coach.role !== "coach_athlete")) {
      throw new Error("Réservé aux coachs");
    }

    const body = await req.json();

    if (body.action === "create") {
      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      if (!firstName || !lastName) throw new Error("Prénom et nom requis");
      if (firstName.length > 100 || lastName.length > 100) throw new Error("Nom trop long");

      const athleteId = crypto.randomUUID();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        id: athleteId,
        email: `pending-${athleteId}@pending.invalid`,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
      });
      if (createErr || !created.user) throw new Error("Création du compte impossible");

      const fullName = `${firstName} ${lastName}`;
      const { error: profileErr } = await admin.from("profiles").insert({
        id: created.user.id,
        role: "athlete",
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        coach_id: user.id,
        is_pending: true,
      });
      if (!profileErr) {
        const { error: claimErr } = await admin
          .from("athlete_claims")
          .insert({ athlete_id: created.user.id, token: newToken() });
        if (claimErr) {
          await admin.auth.admin.deleteUser(created.user.id);
          throw new Error("Création du lien impossible");
        }
      } else {
        await admin.auth.admin.deleteUser(created.user.id);
        throw new Error("Création du profil impossible");
      }

      return json({ athleteId: created.user.id });
    }

    if (body.action === "delete") {
      const athleteId = String(body.athleteId ?? "");
      const { data: athlete } = await admin
        .from("profiles")
        .select("id, coach_id, is_pending")
        .eq("id", athleteId)
        .maybeSingle();
      if (!athlete || athlete.coach_id !== user.id || !athlete.is_pending) {
        throw new Error("Athlète introuvable ou déjà activé");
      }
      const { error } = await admin.auth.admin.deleteUser(athleteId);
      if (error) throw new Error("Suppression impossible");
      return json({ success: true });
    }

    throw new Error("Action inconnue");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur" }, 400);
  }
});
