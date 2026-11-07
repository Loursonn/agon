/**
 * Entretien Garmin, appelé par le cron `garmin-maintenance`
 * (`trigger_garmin_maintenance()`, seulement quand il y a quelque chose à faire).
 *
 * Trois tâches :
 *   1. Traiter les notifications restées dans l'inbox (le `waitUntil` du
 *      webhook n'a pas abouti, ou une erreur passagère).
 *   2. Rafraîchir les jetons Garmin avant l'expiration du refresh token
 *      (~90 j). En push on n'appelle presque jamais Garmin : sans ce cron, au
 *      bout de 90 jours on ne pourrait plus appeler `DELETE /user/registration`
 *      à la déconnexion — c'est-à-dire tenir l'engagement de la déconnexion.
 *   3. Déconnecter les connexions Garmin dont l'athlète a retiré l'accord
 *      `garmin_sync` (`consent_withdrawn`) : Garmin impose l'appel à
 *      `DELETE /user/registration` dès que l'utilisateur pense retirer son
 *      consentement, et le retrait vaut déconnexion (données supprimées).
 *
 * Réservée au cron : le porteur doit être exactement la clé service_role
 * (comme `provider-coros-sync`). La passerelle vérifie le JWT avant nous.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findCrossSourceDuplicate } from "../_shared/activityDedup.ts";
import { garminFromEnv } from "../_shared/garminConfig.ts";
import { freshAccessToken, OAuthTokenError, refreshTokenDue, revokeAndForget } from "../_shared/oauth.ts";
import { drainInbox } from "../_shared/providers/garminIngest.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "Non autorisé" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const report = {
    inbox: {} as Record<string, number>,
    refreshed: 0,
    needsReauth: 0,
    refreshErrors: 0,
    withdrawn: 0,
    warnings: [] as string[],
  };

  try {
    // ── 1. Inbox ──────────────────────────────────────────────────────────
    report.inbox = await drainInbox(
      { db: admin, findDuplicate: (_db, c) => findCrossSourceDuplicate(admin, c) },
      { limit: 300, deadlineMs: 90_000 },
    );

    // ── 2 et 3 : jetons. Sans secrets Garmin, rien à faire (et rien à dire
    // tant qu'aucune connexion n'existe — c'est l'état normal avant l'approbation).
    const { data: conns, error: connError } = await admin
      .from("provider_connections")
      .select("id, athlete_id, status")
      .eq("provider", "garmin")
      .in("status", ["active", "consent_withdrawn"]);
    if (connError) throw new Error(`connexions : ${connError.message}`);
    const connections = (conns ?? []) as Array<{ id: string; athlete_id: string; status: string }>;
    if (connections.length === 0) return json(report);

    const adapter = garminFromEnv();
    if (!adapter) {
      report.warnings.push("secrets Garmin absents : jetons non rafraîchis");
      console.error("provider-garmin-maintenance: GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET absents");
      return json(report, 503);
    }

    const { data: toks, error: tokError } = await admin
      .from("provider_tokens")
      .select("connection_id, refresh_expires_at, updated_at, refresh_secret_id")
      .in("connection_id", connections.map((c) => c.id));
    if (tokError) throw new Error(`jetons : ${tokError.message}`);
    const tokens = new Map(
      ((toks ?? []) as Array<{ connection_id: string; refresh_expires_at: string | null; updated_at: string; refresh_secret_id: string | null }>)
        .map((t) => [t.connection_id, t]),
    );

    for (const c of connections) {
      if (c.status === "consent_withdrawn") {
        const r = await revokeAndForget(admin, adapter, { athleteId: c.athlete_id, connectionId: c.id });
        report.withdrawn++;
        if (!r.revoked) report.warnings.push("révocation non confirmée après retrait d'accord");
        continue;
      }

      const t = tokens.get(c.id);
      if (!t?.refresh_secret_id) continue;
      if (!refreshTokenDue({ refreshExpiresAt: t.refresh_expires_at, updatedAt: t.updated_at })) continue;

      try {
        await freshAccessToken(admin, adapter, c.id, { force: true });
        report.refreshed++;
      } catch (e) {
        /*
          Refus de Garmin (invalid_grant, 400/401) → reconnexion nécessaire.
          Panne réseau ou 5xx → on réessaie au prochain passage : on ne fait
          pas passer une connexion saine en `needs_reauth` pour une panne.
        */
        if (e instanceof OAuthTokenError && e.isReauthRequired) {
          report.needsReauth++;
          await admin.from("provider_connections").update({
            status: "needs_reauth",
            last_error: "Garmin n'accepte plus notre autorisation. Reconnecte ton compte Garmin.",
          }).eq("id", c.id);
        } else {
          report.refreshErrors++;
        }
      }
    }

    return json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("provider-garmin-maintenance:", msg.slice(0, 300));
    return json({ ...report, error: msg.slice(0, 300) }, 500);
  }
});
