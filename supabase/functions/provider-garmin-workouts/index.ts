/**
 * Envoi des séances Agon vers la montre (Garmin Training API, P35).
 *
 * Appelée par le cron `garmin-workouts` (`trigger_garmin_workouts()`, toutes
 * les 10 min, seulement quand un athlète Garmin est concerné). Pour chaque
 * connexion Garmin active :
 *   - envoi actif : les séances programmées sur 7 jours sont traduites
 *     (cibles calculées par Agon), comparées à ce qui est déjà sur Garmin
 *     (empreinte), puis créées / remplacées / retirées ;
 *   - envoi coupé : les séances encore publiées à venir sont retirées.
 * Une séance inchangée ne coûte aucun appel (quota Starter : 200 / athlète / 24 h).
 *
 * Réservée au cron : porteur = clé service_role (voir isServiceRoleBearer).
 * Un bail par connexion (`provider_sync_try_lock`, libre côté Garmin, qui est
 * en push pour les activités) empêche deux exécutions simultanées.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { garminFromEnv } from "../_shared/garminConfig.ts";
import { freshAccessToken, OAuthTokenError } from "../_shared/oauth.ts";
import { isServiceRoleBearer } from "../_shared/auth.ts";
import { garminTrainingClient } from "../_shared/garminTraining/client.ts";
import { ensureKnownScopes, parisDay, syncAthleteWorkouts, WORKOUT_IMPORT_MISSING } from "../_shared/garminTraining/sync.ts";
import { fetchGarminPermissions } from "../_shared/providers/garmin.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Au-delà, on s'arrête proprement : le passage suivant reprendra (10 min). */
const DEADLINE_MS = 100_000;

serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!(await isServiceRoleBearer(bearer))) {
    return json({ error: "Non autorisé" }, 401);
  }

  const adapter = garminFromEnv();
  if (!adapter) return json({ error: "secrets Garmin absents" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const started = Date.now();
  const today = parisDay();
  const report = { athletes: 0, noPermission: 0, created: 0, replaced: 0, removed: 0, rejected: 0, skipped: 0, errors: 0, stopped: 0 };

  try {
    const { data: conns, error } = await admin
      .from("provider_connections")
      .select("id, athlete_id, push_workouts, granted_scopes")
      .eq("provider", "garmin")
      .eq("status", "active");
    if (error) throw new Error(`connexions : ${error.message}`);

    for (const c of (conns ?? []) as Array<{ id: string; athlete_id: string; push_workouts: boolean; granted_scopes: string[] | null }>) {
      if (Date.now() - started > DEADLINE_MS) break;

      const { data: lock, error: lockError } = await admin.rpc("provider_sync_try_lock", { p_connection_id: c.id, p_ttl_seconds: 300 });
      if (lockError) throw new Error(`bail : ${lockError.message}`);
      if (!lock) {
        report.skipped++;
        continue;
      }
      report.athletes++;
      try {
        const token = await freshAccessToken(admin, adapter, c.id);
        // Permissions inconnues (connexions du 09/11) : relues une fois, puis rangées.
        const scopes = await ensureKnownScopes(admin, c.id, c.granted_scopes, () => fetchGarminPermissions(token));
        const r = await syncAthleteWorkouts(admin, garminTrainingClient(token), c.athlete_id, c.push_workouts, { today, scopes });
        report.created += r.created;
        report.replaced += r.replaced;
        report.removed += r.removed;
        report.rejected += r.rejected;
        report.errors += r.errors.length;
        if (r.stopped === WORKOUT_IMPORT_MISSING) report.noPermission++;
        else if (r.stopped) report.stopped++;
      } catch (e) {
        report.errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("provider-garmin-workouts:", msg.slice(0, 300));
        if (e instanceof OAuthTokenError && e.isReauthRequired) {
          await admin.from("provider_connections").update({
            status: "needs_reauth",
            last_error: "Garmin n'accepte plus notre autorisation. Reconnecte ton compte Garmin.",
          }).eq("id", c.id);
        }
      } finally {
        await admin.rpc("provider_sync_unlock", { p_connection_id: c.id, p_token: lock });
      }
    }
    return json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("provider-garmin-workouts:", msg.slice(0, 300));
    return json({ ...report, error: msg.slice(0, 300) }, 500);
  }
});
