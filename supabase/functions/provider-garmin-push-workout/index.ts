/**
 * « Envoyer sur ma montre » : l'athlète envoie une séance précise vers Garmin,
 * tout de suite, sans attendre le cron `garmin-workouts` (10 min) et même
 * au-delà des 7 jours que le cron envoie tout seul.
 *
 * Appelée par l'athlète avec son jeton de session (jamais pour quelqu'un
 * d'autre : l'athlète est celui du jeton, le corps ne désigne que la séance).
 *
 * Mêmes règles que le cron (décision d'Hugo, 14/11/2026) :
 *   - envoi coupé (`push_workouts = false`) → rien n'est envoyé (`envoi_coupe`) ;
 *   - sans la permission « Workout Import » → rien (`permission_absente`) ;
 *   - seule une séance prévue, à venir, de l'athlète part sur la montre.
 * L'envoi passe par `syncAthleteWorkouts` (même traduction, même suivi,
 * même bail que le cron) : la séance demandée est forcée, le reste de la
 * fenêtre est remis à jour au passage, sans appel pour ce qui n'a pas changé.
 *
 * Corps : `{ kind: "energy" | "strength", sourceId: uuid }`.
 * Réponse : `{ status: "sent" | "rejected" | "error", message, warnings }`,
 * ou une erreur `{ error: code, message }`.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { garminFromEnv } from "../_shared/garminConfig.ts";
import { freshAccessToken, OAuthTokenError } from "../_shared/oauth.ts";
import { garminTrainingClient } from "../_shared/garminTraining/client.ts";
import {
  checkPushable, ensureKnownScopes, parisDay, syncAthleteWorkouts, workoutImportPermission, WORKOUT_IMPORT_MISSING,
  type WorkoutSource,
} from "../_shared/garminTraining/sync.ts";
import { fetchGarminPermissions } from "../_shared/providers/garmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const refuse = (error: string, message: string, status = 409) => json({ error, message }, status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_PUSHABLE: Record<string, string> = {
  introuvable: "Séance introuvable.",
  deja_faite: "Cette séance n'est plus à faire : elle ne part pas sur la montre.",
  passee: "Cette séance est passée : elle ne part pas sur la montre.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let userId: string;
  try {
    userId = (await requireUser(req)).id;
  } catch {
    return json({ error: "non_autorise", message: "Non autorisé" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind;
  const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
  if ((kind !== "energy" && kind !== "strength") || !UUID.test(sourceId)) {
    return refuse("requete_invalide", "Séance non reconnue.", 400);
  }
  const source: WorkoutSource = { kind, id: sourceId };

  const adapter = garminFromEnv();
  if (!adapter) return refuse("garmin_indisponible", "Garmin n'est pas disponible pour le moment.", 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = parisDay();

  try {
    const { data: conn, error } = await admin
      .from("provider_connections")
      .select("id, push_workouts, granted_scopes")
      .eq("provider", "garmin")
      .eq("athlete_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(`connexion : ${error.message}`);
    if (!conn) return refuse("pas_de_garmin", "Aucune montre Garmin connectée.");
    if (!conn.push_workouts) {
      return refuse("envoi_coupe", "L'envoi des séances sur ta montre est coupé. Active-le dans Montres.");
    }
    if (workoutImportPermission(conn.granted_scopes) === "missing") {
      return refuse("permission_absente", "Garmin n'autorise pas l'import de séances. Reconnecte Garmin en cochant « Workout Import ».");
    }

    const blocked = await checkPushable(admin, userId, source, today);
    if (blocked) return refuse(blocked, NOT_PUSHABLE[blocked]);

    const { data: lock, error: lockError } = await admin.rpc("provider_sync_try_lock", { p_connection_id: conn.id, p_ttl_seconds: 120 });
    if (lockError) throw new Error(`bail : ${lockError.message}`);
    if (!lock) return refuse("occupe", "Un envoi est déjà en cours. Réessaie dans une minute.");

    try {
      const token = await freshAccessToken(admin, adapter, conn.id);
      const scopes = await ensureKnownScopes(admin, conn.id, conn.granted_scopes, () => fetchGarminPermissions(token));
      const report = await syncAthleteWorkouts(admin, garminTrainingClient(token), userId, true, { today, scopes, include: [source] });
      if (report.stopped === WORKOUT_IMPORT_MISSING) {
        return refuse("permission_absente", "Garmin n'autorise pas l'import de séances. Reconnecte Garmin en cochant « Workout Import ».");
      }
    } catch (e) {
      if (e instanceof OAuthTokenError && e.isReauthRequired) {
        await admin.from("provider_connections").update({
          status: "needs_reauth",
          last_error: "Garmin n'accepte plus notre autorisation. Reconnecte ton compte Garmin.",
        }).eq("id", conn.id);
        return refuse("reconnexion", "Garmin n'accepte plus notre autorisation. Reconnecte ton compte Garmin.");
      }
      throw e;
    } finally {
      await admin.rpc("provider_sync_unlock", { p_connection_id: conn.id, p_token: lock });
    }

    // Ce que le suivi dit maintenant de cette séance.
    const { data: row, error: rowError } = await admin
      .from("provider_workout_pushes")
      .select("status, last_error, warnings")
      .eq("provider", "garmin")
      .eq("athlete_id", userId)
      .eq("source_kind", source.kind)
      .eq("source_id", source.id)
      .maybeSingle();
    if (rowError) throw new Error(`suivi : ${rowError.message}`);
    if (!row) return json({ status: "error", message: "La séance n'a pas pu être envoyée. Réessaie plus tard.", warnings: [] });
    const message =
      row.status === "sent" ? "Séance envoyée dans ton calendrier Garmin Connect. Elle arrive sur la montre à la prochaine synchronisation."
      : row.status === "rejected" ? `Garmin ne peut pas recevoir cette séance : ${row.last_error ?? "format non pris en charge"}.`
      : "Garmin a refusé l'envoi pour le moment. Nouvel essai automatique dans 10 minutes.";
    return json({ status: row.status, message, warnings: row.warnings ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("provider-garmin-push-workout:", msg.slice(0, 300));
    return json({ error: "erreur", message: "L'envoi n'a pas abouti. Réessaie plus tard." }, 500);
  }
});
