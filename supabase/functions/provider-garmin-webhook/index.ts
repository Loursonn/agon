/**
 * Point d'entrée des notifications push Garmin (Activity API, Health API,
 * désinscriptions, changements de permissions).
 *
 * Contrat Garmin : répondre 200 « en quelques secondes », accepter les
 * doublons ; une notification sans 200 est rejouée. Donc, avant de répondre,
 * une seule chose : écrire le brut dans `provider_webhook_inbox` (une ligne par
 * entrée, empreinte unique → idempotent). Le traitement vient après la
 * réponse, dans la même invocation via `EdgeRuntime.waitUntil` ; ce qui n'a pas
 * abouti est repris par le cron `garmin-maintenance`.
 *
 * Appelée par Garmin, sans JWT : `verify_jwt = false` (supabase/config.toml).
 * Garmin ne signe pas ses notifications (pas de HMAC documenté). Contrôles
 * d'origine, du plus fort au plus faible :
 *   1. `GARMIN_WEBHOOK_TOKEN` — secret de ≥ 32 caractères placé dans l'URL
 *      déclarée au portail (`?token=…` ou dernier segment du chemin). Sans
 *      secret configuré, l'endpoint répond 503 : il n'est jamais ouvert « en
 *      attendant ».
 *   2. En-tête `garmin-client-id` (SUPPOSÉ : présent sur les notifications des
 *      apps OAuth2) — s'il est là, il doit valoir notre `GARMIN_CLIENT_ID`.
 *   3. Au traitement : une entrée dont le `userId` Garmin n'est lié à aucune
 *      connexion est supprimée sans rien importer.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findCrossSourceDuplicate } from "../_shared/activityDedup.ts";
import { garminWebhookToken } from "../_shared/garminConfig.ts";
import { canonicalJson, sha256Hex, timingSafeEqual } from "../_shared/oauth.ts";
import { splitNotification } from "../_shared/providers/garmin.ts";
import { drainInbox } from "../_shared/providers/garminIngest.ts";

/** Taille maximale acceptée. Un `activityDetails` avec échantillons reste en dessous. */
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

function presentedToken(url: URL): string {
  const q = url.searchParams.get("token");
  if (q) return q;
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  return last === "provider-garmin-webhook" ? "" : decodeURIComponent(last);
}

type EdgeRuntimeLike = { waitUntil(p: Promise<unknown>): void };

serve(async (req) => {
  const url = new URL(req.url);

  const expected = garminWebhookToken();
  if (!expected) return text("garmin non configuré", 503);
  if (!timingSafeEqual(presentedToken(url), expected)) return text("non autorisé", 401);

  const clientIdHeader = req.headers.get("garmin-client-id");
  const clientId = Deno.env.get("GARMIN_CLIENT_ID") ?? "";
  if (clientIdHeader && clientId && clientIdHeader !== clientId) return text("non autorisé", 401);

  // Vérification d'accessibilité éventuelle (portail, outil de vérification).
  if (req.method === "GET" || req.method === "HEAD") return text("ok", 200);
  if (req.method !== "POST") return text("méthode non acceptée", 405);

  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return text("trop volumineux", 413);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return text("trop volumineux", 413);

  let entries;
  try {
    entries = splitNotification(JSON.parse(raw));
  } catch {
    return text("JSON invalide", 400);
  }
  if (entries.length === 0) return text("ok", 200);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rows = await Promise.all(entries.map(async (e) => ({
    provider: "garmin",
    type: e.type.slice(0, 60),
    external_user_id: e.userId,
    payload: e.entry,
    fingerprint: await sha256Hex(`${e.type}|${canonicalJson(e.entry)}`),
  })));

  const { data: inserted, error } = await admin
    .from("provider_webhook_inbox")
    .upsert(rows, { onConflict: "provider,fingerprint", ignoreDuplicates: true })
    .select("id");

  if (error) {
    // 500 : Garmin rejouera. Rien n'a été traité, rien n'est perdu.
    console.error("provider-garmin-webhook: stockage impossible", error.code ?? "");
    return text("stockage impossible", 500);
  }

  const ids = ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id);

  if (ids.length > 0) {
    const work = drainInbox(
      { db: admin, findDuplicate: (_db, c) => findCrossSourceDuplicate(admin, c) },
      { ids, limit: ids.length, deadlineMs: 50_000 },
    ).then((counts) => {
      // Décomptes seulement : aucune donnée personnelle dans les journaux.
      console.log("provider-garmin-webhook: traité", JSON.stringify(counts));
    }).catch((e) => {
      console.error("provider-garmin-webhook: traitement différé au cron", e instanceof Error ? e.message.slice(0, 200) : "");
    });

    const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
    // Sans waitUntil, on ne bloque pas la réponse : le cron reprendra.
    if (runtime?.waitUntil) runtime.waitUntil(work);
  }

  return text("ok", 200);
});
