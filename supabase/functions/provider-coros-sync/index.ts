/**
 * Synchronisation COROS : va chercher les activités et les données
 * quotidiennes, et les range dans `provider_activities` / `provider_dailies`.
 *
 * Trois appelants :
 *
 *   - **le cron, une connexion par appel** (clé `service_role`, corps
 *     `{ connection_id }`) : `trigger_coros_sync()` émet un appel par
 *     connexion active, pour qu'un athlète lent ou en panne ne fasse pas
 *     dépasser le temps d'exécution aux suivants. Quota journalier entier ;
 *   - **le cron sans `connection_id`** (ancien déclencheur) : toutes les
 *     connexions actives à la suite. Gardé pour la transition ;
 *   - **l'athlète** (jeton de session) : la sienne seulement, budget réduit.
 *     Un bouton « synchroniser maintenant » est un complément, pas un
 *     rattrapage : lui laisser les 50 fichiers quotidiens permettrait
 *     d'épuiser le quota en trois clics et de bloquer le cron du lendemain.
 *
 * Une connexion n'est jamais synchronisée deux fois en même temps
 * (`provider_sync_try_lock`) : deux exécutions simultanées consommeraient deux
 * fois le même refresh token — COROS le fait tourner, la seconde se ferait
 * refuser et la connexion passerait pour morte — et deux fois le quota.
 *
 * Le chiffre affiché à l'athlète vient toujours d'un fichier FIT, jamais de la
 * prose des outils MCP. Les réponses textuelles ne servent qu'à deux choses :
 * trouver les URL des FIT, et conserver les données quotidiennes — qui n'ont
 * pas d'équivalent binaire — telles quelles, sans en extraire de nombre.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasConsent, isServiceRoleBearer } from "../_shared/auth.ts";
import {
  buildDateArgs,
  buildLookbackArgs,
  classifyFitListing,
  COROS_FIT_LIMITS,
  COROS_TOOLS,
  type DateArgsSpec,
  fetchMetadata,
  isRefreshRejected,
  lastSettledDay,
  nextSyncedThrough,
  planSync,
  refreshTokens,
  resolveDateArgs,
  shiftDay,
  ymd,
  isCorosAnomaly,
  type FitListing,
} from "../_shared/coros.ts";
import { McpClient, McpError, type McpTool, resolveTool } from "../_shared/mcp.ts";
import { looksLikeFit, parseFit } from "../_shared/activityFiles/fit.ts";
import type { ParsedActivity } from "../_shared/activityFiles/types.ts";
import { normalizeActivity } from "../_shared/activityFiles/normalize.ts";
import { detailPayload, type NormalizedActivity } from "../_shared/activityFiles/stream.ts";
import { type IngestOutcome, parseEnvNumber, type Rejection, type SweepResult, sweepFitWindows } from "./sweep.ts";

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

const envNumber = (name: string, fallback: number) => parseEnvNumber(Deno.env.get(name), fallback);

/*
  Profondeur d'historique récupérée à la première synchronisation. Réglable par
  variable d'environnement parce que la bonne valeur dépend de ce qu'on veut
  payer en quota : à 50 fichiers par jour, un an d'un athlète assidu représente
  environ cinq jours de rattrapage.
*/
const HISTORY_DAYS = envNumber("COROS_HISTORY_DAYS", 365);

/*
  Les données quotidiennes ne consomment pas le quota de fichiers, mais chaque
  journée est un appel MCP. Une semaine couvre le cas réel — un athlète qui
  consulte son sommeil regarde les derniers jours — sans transformer chaque
  exécution en centaines d'allers-retours.
*/
const DAILY_DAYS = envNumber("COROS_DAILY_DAYS", 7);

/*
  Jours terminés relus à chaque passage, en plus du jour en cours et de la
  veille : une montre peut remonter une sortie chez COROS avec du retard, et
  la date utilisée par COROS (locale ou UTC) n'est pas documentée.
*/
const RESCAN_DAYS = envNumber("COROS_RESCAN_DAYS", 2);

/*
  Temps de travail par connexion avant de s'arrêter proprement. Une Edge
  Function est coupée net à sa limite (150 s à 400 s selon l'offre) : mieux
  vaut enregistrer le curseur et le quota consommé avant.
*/
const DEADLINE_MS = envNumber("COROS_SYNC_DEADLINE_MS", 110_000);

/** Durée du verrou de synchronisation : plus long que la plus longue exécution. */
const LOCK_TTL_S = 600;

/** Délai maximal du téléchargement d'un FIT. */
const FIT_DOWNLOAD_TIMEOUT_MS = 30_000;

/** Largeur initiale de la fenêtre de dates demandée pour les FIT. */
const WINDOW_SPAN = 30;

interface Connection {
  id: string;
  athlete_id: string;
  api_host: string | null;
  status: string;
  synced_through: string | null;
  connected_at: string;
}

interface SyncReport {
  athleteId: string;
  imported: number;
  duplicates: number;
  rejected: Rejection[];
  dailies: number;
  syncedThrough: string | null;
  /** Erreur lisible : la synchronisation n'a pas tout fait, le curseur n'a pas dépassé la panne. */
  error?: string;
  /** Avertissements non bloquants (données quotidiennes, liste possiblement tronquée…). */
  warnings?: string[];
  /** Ce qui reste à faire et quand (quota, budget, temps) — pas une erreur. */
  pending?: string;
  /**
   * Où le temps est passé (compteurs et durées, aucune donnée d'athlète) : sans
   * cela, « interrompue avant la limite de temps » ne dit pas quelle étape est
   * lente — l'ouverture de session, la liste des fichiers ou leur téléchargement.
   */
  timing?: SyncTiming;
  /**
   * L'appel de liste des FIT tel qu'il est fait : outil, paramètres publiés
   * (nom, type, format, début de description) et arguments envoyés pour la
   * fenêtre récente. Aucune donnée d'athlète ; sert à confronter le schéma
   * réel de COROS à ce qu'on envoie quand COROS refuse l'appel.
   */
  fitCall?: {
    tool: string;
    params: Record<string, string>;
    required: string[];
    args: Record<string, unknown>;
  };
  /**
   * Refus « anomalies » de COROS sur la liste des FIT : variantes essayées une
   * fois, résultat réduit à sa forme (`urls:N`, `vide`, `erreur:…`). Aucun
   * fichier n'est téléchargé par la sonde.
   */
  fitProbe?: Record<string, string>;
}

interface CallStats {
  calls: number;
  totalMs: number;
  maxMs: number;
}

interface SyncTiming {
  /** Jeton + ouverture de session MCP + liste des outils. */
  setupMs: number;
  list: CallStats;
  ingest: CallStats;
  /** Fenêtres terminées : récentes, rattrapage. */
  windows: { recent: number; backfill: number };
  totalMs: number;
}

const newStats = (): CallStats => ({ calls: 0, totalMs: 0, maxMs: 0 });

/** Chronomètre un appel asynchrone dans `stats`, même s'il lève. */
function timed<A extends unknown[], R>(stats: CallStats, fn: (...a: A) => Promise<R>) {
  return async (...a: A): Promise<R> => {
    const t = Date.now();
    try {
      return await fn(...a);
    } finally {
      const d = Date.now() - t;
      stats.calls++;
      stats.totalMs += d;
      stats.maxMs = Math.max(stats.maxMs, d);
    }
  };
}

const emptyReport = (conn: Connection): SyncReport => ({
  athleteId: conn.athlete_id,
  imported: 0,
  duplicates: 0,
  rejected: [],
  dailies: 0,
  syncedThrough: conn.synced_through,
  warnings: [],
});

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ───────────────────────────────── Jetons ────────────────────────────────────

/**
 * Jeton d'accès utilisable, rafraîchi si besoin (ou si `force`).
 *
 * Appelé sous le verrou de la connexion : deux rafraîchissements simultanés
 * présenteraient le même refresh token, et COROS — qui le fait tourner —
 * refuserait le second.
 *
 * La marge de 120 secondes n'est pas de la superstition : un jeton valide au
 * moment du contrôle peut expirer pendant la série de téléchargements qui
 * suit.
 */
async function freshAccessToken(
  admin: SupabaseClient,
  conn: Connection,
  force = false,
): Promise<string> {
  const { data, error } = await admin.rpc("provider_token_read", {
    p_connection_id: conn.id,
  });
  if (error) throw new Error(`lecture du jeton : ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
  } | undefined;

  if (!row?.access_token) throw new Error("aucun jeton enregistré");

  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  const stillGood = Number.isNaN(expiresAt)
    ? true // Pas de date d'expiration connue : on tente, COROS tranchera.
    : expiresAt - Date.now() > 120_000;

  if (stillGood && !force) return row.access_token;

  if (!row.refresh_token) {
    /*
      Jeton expiré et aucun moyen de le renouveler : la connexion est morte et
      doit le dire. La laisser `active` ferait réessayer le cron chaque nuit
      pendant des mois, et l'athlète ne verrait jamais qu'il doit reconnecter.
    */
    await admin
      .from("provider_connections")
      .update({
        status: "needs_reauth",
        last_error: "Jeton expiré sans rafraîchissement possible : reconnecte ta montre.",
      })
      .eq("id", conn.id);
    throw new Error("Jeton COROS expiré sans rafraîchissement possible : reconnecte ta montre.");
  }

  const host = conn.api_host;
  if (!host) throw new Error("hôte régional inconnu pour cette connexion");

  const { data: client, error: clientError } = await admin
    .from("provider_oauth_clients")
    .select("client_id")
    .eq("provider", "coros")
    .eq("api_host", host)
    .maybeSingle();
  if (clientError) throw new Error(`lecture du client OAuth : ${clientError.message}`);
  if (!client?.client_id) throw new Error("client OAuth introuvable pour cet hôte");

  let tokens;
  try {
    const meta = await fetchMetadata(host);
    tokens = await refreshTokens(meta, {
      refreshToken: row.refresh_token,
      clientId: client.client_id,
    });
  } catch (e) {
    if (isRefreshRejected(e)) {
      /*
        Refus explicite (`invalid_grant`…) : l'athlète a retiré l'accès côté
        COROS, ou le jeton a été révoqué. Réessayer n'y changera rien.
      */
      await admin
        .from("provider_connections")
        .update({
          status: "needs_reauth",
          last_error: "COROS a refusé le renouvellement : reconnecte ta montre.",
        })
        .eq("id", conn.id);
      throw new Error("COROS a refusé le renouvellement du jeton : reconnecte ta montre.");
    }
    /*
      Panne réseau, 5xx, 429, réponse illisible : la connexion reste active.
      La marquer « reconnexion requise » obligerait l'athlète à refaire
      l'autorisation pour un hoquet de COROS — et, sans action de sa part,
      arrêterait sa synchronisation pour de bon.
    */
    throw new Error(
      `Renouvellement du jeton COROS impossible pour l'instant (${errMsg(e).slice(0, 160)}) : nouvel essai à la prochaine synchronisation.`,
    );
  }

  /*
    COROS vient peut-être de faire tourner le refresh token : l'ancien est
    mort. Perdre l'écriture du nouveau tuerait la connexion, d'où un second
    essai avant d'abandonner.
  */
  const write = () =>
    admin.rpc("provider_token_write", {
      p_connection_id: conn.id,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null,
      p_expires_at: tokens.expires_at ?? null,
    });
  let { error: writeError } = await write();
  if (writeError) ({ error: writeError } = await write());
  if (writeError) {
    console.error("provider-coros-sync: jeton renouvelé mais non enregistré", conn.id);
    throw new Error(`écriture du jeton renouvelé : ${writeError.message}`);
  }

  return tokens.access_token;
}

// ──────────────────────────────── Ingestion ──────────────────────────────────

/**
 * Fusionne une activité (P42) : si la même sortie est déjà là (archive
 * Strava, fichier, Garmin), elle est complétée au lieu d'être écartée. Même
 * règle et même verrou que l'import de fichiers : `merge_provider_activity`.
 * « inserted » = nouvelle sortie ; « duplicate » = sortie déjà connue
 * (complétée ou déjà complète).
 */
async function insertActivity(
  admin: SupabaseClient,
  athleteId: string,
  act: ParsedActivity,
  detail: NormalizedActivity | null = null,
): Promise<"inserted" | "duplicate" | { rejected: string }> {
  const { data, error } = await admin.rpc("merge_provider_activity", {
    p_athlete: athleteId,
    p_source: "coros",
    p_tag: "coros",
    p_activity: {
      external_id: act.externalId,
      started_at: act.startedAt,
      local_date: act.localDate,
      sport: act.sport,
      duration_s: act.durationS,
      distance_m: act.distanceM,
      elevation_gain_m: act.elevationGainM,
      avg_hr: act.avgHr,
      max_hr: act.maxHr,
      avg_pace_s_per_km: act.avgPaceSPerKm,
      calories: act.calories,
      details: act.details,
      raw: act.raw,
      origin_quality: "fit",
      // `ai_allowed` est délibérément absent : posé en base.
    },
  });

  if (error) {
    const code = (error as { code?: string }).code ?? "";
    /*
      22xxx / 23xxx (valeur hors bornes, contrainte de vraisemblance) : le
      fichier est en cause, pas la base. Réessayer donnerait le même refus et
      bloquerait le curseur indéfiniment : c'est un refus, nommé.
    */
    if (code.startsWith("22") || code.startsWith("23")) {
      return { rejected: `activité refusée par la base : ${error.message}` };
    }
    throw new Error(`fusion de l'activité : ${error.message}`);
  }
  const res = (data ?? {}) as { id?: string; status?: string; stream_rank?: number };

  /*
    Détail (série seconde par seconde, tours) : seulement s'il est meilleur
    que celui déjà rangé. Meilleur effort : le résumé est déjà enregistré.
  */
  if (detail && res.id && (res.stream_rank ?? 0) < 3) {
    const { error: e2 } = await admin.rpc("activity_detail_upsert", {
      p_activity: res.id,
      p_detail: detailPayload(detail),
    });
    if (e2) console.error("provider-coros-sync: détail non rangé", e2.code ?? "");
  }

  return res.status === "created" ? "inserted" : "duplicate";
}

/**
 * Télécharge, décode et insère un FIT.
 *
 * Deux sortes d'échec, traitées à l'opposé :
 *   - **passager** (réseau, réponse non 2xx, base indisponible) → `retry` :
 *     la fenêtre sera reprise, le curseur n'avance pas ;
 *   - **définitif** (contenu qui n'est pas un FIT, décodage impossible) →
 *     refus nommé : réessayer donnerait le même résultat, et bloquerait la
 *     synchronisation sur ce fichier pour toujours.
 */
async function ingestFit(
  admin: SupabaseClient,
  athleteId: string,
  url: string,
): Promise<IngestOutcome> {
  const name = url.split("/").pop()?.split("?")[0] || "fichier.fit";

  let bytes: Uint8Array;
  try {
    // Un fichier qui ne vient pas ne doit pas manger tout le temps de l'exécution.
    const res = await fetch(url, { signal: AbortSignal.timeout(FIT_DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) {
      return { kind: "retry", reason: `téléchargement refusé (${res.status})`, quota: res.status === 429 };
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return { kind: "retry", reason: `téléchargement impossible : ${errMsg(e).slice(0, 160)}` };
  }

  /*
    Contrôle avant décodage. Les URL sont trouvées dans de la prose : la
    sélection est volontairement large, donc elle peut ramener un lien qui
    n'est pas un FIT. Le constater ici donne un refus lisible au lieu d'une
    exception du décodeur.
  */
  if (!looksLikeFit(bytes)) {
    return { kind: "ok", imported: 0, duplicates: 0, rejected: [{ name, reason: "le contenu téléchargé n'est pas un fichier FIT" }] };
  }

  let parsed;
  try {
    parsed = await parseFit(bytes, name);
  } catch (e) {
    return { kind: "ok", imported: 0, duplicates: 0, rejected: [{ name, reason: errMsg(e) }] };
  }

  const rejected: Rejection[] = [...parsed.rejected];
  let imported = 0;
  let duplicates = 0;
  // Détail seulement pour un fichier d'une seule séance (pas de multisport).
  let detail: NormalizedActivity | null = null;
  if (parsed.activities.length === 1) {
    try {
      detail = normalizeActivity({ kind: "fit", bytes });
    } catch {
      detail = null;
    }
  }

  for (const act of parsed.activities) {
    try {
      const outcome = await insertActivity(admin, athleteId, act, detail);
      if (outcome === "inserted") imported++;
      else if (outcome === "duplicate") duplicates++;
      else rejected.push({ name, reason: outcome.rejected });
    } catch (e) {
      return { kind: "retry", reason: errMsg(e).slice(0, 200) };
    }
  }

  return { kind: "ok", imported, duplicates, rejected };
}

// ───────────────────────── Données quotidiennes ──────────────────────────────

/**
 * Enregistre les données quotidiennes, sans en extraire de chiffre.
 *
 * Sommeil, VFC et FC de repos n'existent qu'en prose chez COROS. Les colonnes
 * typées de `provider_dailies` restent donc vides : remplir `hrv_ms` à partir
 * d'une phrase par expression régulière produirait un nombre d'apparence
 * fiable, affiché à côté de vraies mesures et impossible à distinguer d'elles.
 * Le texte est conservé dans `raw` — exploitable plus tard si COROS documente
 * un format, perdu si on ne le garde pas.
 *
 * Meilleur effort : les sept derniers jours sont relus à chaque passage et
 * l'upsert est idempotent, donc une journée manquée est rattrapée au suivant.
 */
async function ingestDailies(
  admin: SupabaseClient,
  athleteId: string,
  mcp: McpClient,
  spec: DateArgsSpec,
  today: string,
): Promise<number> {
  let stored = 0;

  /*
    Outil « N derniers jours » (`days`), sans dates : un seul appel, et la
    réponse n'est pas ventilée par jour. Elle est rangée sous le jour de
    l'appel, avec la période demandée, pour ne pas laisser croire qu'elle
    décrit un seul jour. Même règle que le reste : prose brute, pas d'IA.
  */
  if (spec.lookbackKey) {
    const args = buildLookbackArgs(spec, DAILY_DAYS);
    const result = await mcp.callTool(spec.tool, args);
    if (result.isError || !result.text.trim()) return 0;
    const { error } = await admin.from("provider_dailies").upsert(
      {
        athlete_id: athleteId,
        source: "coros",
        day: today,
        raw: {
          tool: spec.tool,
          text: result.text,
          window_days: args[spec.lookbackKey],
          queried_at: new Date().toISOString(),
        },
      },
      { onConflict: "athlete_id,source,day" },
    );
    return error ? 0 : 1;
  }

  for (let i = 1; i <= DAILY_DAYS; i++) {
    const day = shiftDay(today, -i);
    let text: string;
    try {
      const result = await mcp.callTool(spec.tool, buildDateArgs(spec, day, day));
      if (result.isError || !result.text.trim()) continue;
      text = result.text;
    } catch {
      continue;
    }

    const { error } = await admin.from("provider_dailies").upsert(
      {
        athlete_id: athleteId,
        source: "coros",
        day,
        raw: { tool: spec.tool, text, queried_at: new Date().toISOString() },
      },
      { onConflict: "athlete_id,source,day" },
    );
    if (!error) stored++;
  }

  return stored;
}

// ─────────────────────────── Une connexion ───────────────────────────────────

/** Décalage UTC (s) du dernier FIT de l'athlète, pour savoir quand ses journées finissent. */
async function athleteUtcOffset(admin: SupabaseClient, athleteId: string): Promise<number | null> {
  const { data, error } = await admin
    .from("provider_activities")
    .select("utc:raw->utcOffsetS")
    .eq("athlete_id", athleteId)
    .not("raw->utcOffsetS", "is", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const v = Number((data as Array<{ utc: unknown }> | null)?.[0]?.utc);
  return Number.isFinite(v) ? v : null;
}

async function listToolsWithRetry(
  admin: SupabaseClient,
  conn: Connection,
  host: string,
): Promise<{ mcp: McpClient; tools: McpTool[] }> {
  let mcp = new McpClient({ host, accessToken: await freshAccessToken(admin, conn) });
  try {
    return { mcp, tools: await mcp.listTools() };
  } catch (e) {
    /*
      401 avec un jeton qu'on croyait valide (révoqué ou expiré plus tôt
      qu'annoncé) : un seul rafraîchissement forcé, puis on laisse l'erreur
      remonter.
    */
    if (!(e instanceof McpError) || e.code !== 401) throw e;
    mcp = new McpClient({ host, accessToken: await freshAccessToken(admin, conn, true) });
    return { mcp, tools: await mcp.listTools() };
  }
}

async function syncConnection(
  admin: SupabaseClient,
  conn: Connection,
  budget: number,
): Promise<SyncReport> {
  const startedAt = Date.now();
  const report = emptyReport(conn);
  const warnings = report.warnings!;

  /*
    Le consentement est revérifié à chaque exécution, et pas seulement à la
    connexion. Un athlète qui retire son accord l'a retiré pour la suite : si
    le cron continuait à puiser chez COROS avec un jeton encore valide, la case
    décochée ne serait qu'un affichage.
  */
  if (!(await hasConsent(conn.athlete_id, "coros_sync"))) {
    await admin
      .from("provider_connections")
      .update({
        status: "consent_withdrawn",
        last_error: "Synchronisation arrêtée : le consentement a été retiré.",
      })
      .eq("id", conn.id);
    report.error = "consentement retiré";
    return report;
  }

  const host = conn.api_host;
  if (!host) {
    report.error = "hôte régional inconnu";
    return report;
  }

  const { mcp, tools } = await listToolsWithRetry(admin, conn, host);
  /*
    Session utilisée pour la liste des FIT. Remplacée par une session neuve si
    COROS refuse avec sa garde « anomalies » et que la session neuve passe.
  */
  let fitMcp = mcp;
  const timing: SyncTiming = {
    setupMs: Date.now() - startedAt,
    list: newStats(),
    ingest: newStats(),
    windows: { recent: 0, backfill: 0 },
    totalMs: 0,
  };
  report.timing = timing;

  /*
    La liste réelle des outils, demandée une fois par exécution, avec le schéma
    de leurs paramètres. Nos noms viennent de la documentation : les
    confronter au serveur évite de passer une nuit à chercher pourquoi un
    appel échoue, et les journaliser donne enfin une réponse observée à mettre
    dans la doc.
  */
  console.log(
    `provider-coros-sync: outils disponibles (${tools.length}) :`,
    tools.map((t) => `${t.name}(${Object.keys(t.inputSchema?.properties ?? {}).join(",")})`).join(", "),
  );

  const fitToolName = resolveTool(tools, COROS_TOOLS.fitUrls, /fit.*(url|file)|download.*fit/i);
  const dailyToolName = resolveTool(tools, COROS_TOOLS.dailies, /daily|sleep/i);
  const toolByName = (n: string | null) => (n ? tools.find((t) => t.name === n) ?? null : null);

  const now = new Date();
  const today = ymd(now);

  // ─── Activités ───
  let fitSpec: DateArgsSpec | null = null;
  if (!fitToolName) {
    report.error = `aucun outil de téléchargement FIT dans la liste publiée par COROS (${
      tools.map((t) => t.name).join(", ") || "liste vide"
    })`;
  } else {
    try {
      fitSpec = resolveDateArgs(toolByName(fitToolName)!);
    } catch (e) {
      report.error = errMsg(e);
    }
  }

  if (fitSpec) {
    const spec = fitSpec;
    const historyStart = shiftDay(ymd(new Date(conn.connected_at)), -HISTORY_DAYS);
    const plan = planSync({
      syncedThrough: conn.synced_through,
      historyStart,
      today,
      settled: lastSettledDay(now, await athleteUtcOffset(admin, conn.athlete_id)),
      rescanDays: RESCAN_DAYS,
    });

    {
      const props = toolByName(fitToolName)?.inputSchema?.properties ?? {};
      report.fitCall = {
        tool: spec.tool,
        params: Object.fromEntries(
          Object.entries(props).map(([k, v]) => {
            const p = v as { type?: unknown; format?: string; description?: string };
            return [k, [String(p.type ?? "?"), p.format ?? "", (p.description ?? "").slice(0, 120)].filter(Boolean).join(" · ")];
          }),
        ),
        required: (toolByName(fitToolName)?.inputSchema as { required?: string[] } | undefined)?.required ?? [],
        args: buildDateArgs(spec, plan.recent.from, plan.recent.to, COROS_FIT_LIMITS.perCall),
      };
    }

    const deps = {
      list: timed(timing.list, async (range: { from: string; to: string }) => {
        const args = buildDateArgs(spec, range.from, range.to, COROS_FIT_LIMITS.perCall);
        const listing = classifyFitListing(await fitMcp.callTool(spec.tool, args));
        if (listing.kind !== "error" || !isCorosAnomaly(listing.reason) || report.fitProbe) return listing;

        // Une seule fois par exécution : variantes, pour savoir ce que la garde refuse.
        const probe: Record<string, string> = {};
        report.fitProbe = probe;
        const shape = (l: FitListing) =>
          l.kind === "urls" ? `urls:${l.urls.length}` : l.kind === "empty" ? "vide" : `erreur:${l.reason.slice(0, 80)}`;
        const token = await freshAccessToken(admin, conn);
        const fresh = () => new McpClient({ host, accessToken: token });
        let adopted: FitListing | null = null;
        try {
          const s1 = fresh();
          const l1 = classifyFitListing(await s1.callTool(spec.tool, args));
          probe.nouvelleSession = shape(l1);
          if (l1.kind !== "error") {
            fitMcp = s1;
            adopted = l1;
          }
        } catch (e) {
          probe.nouvelleSession = `exception:${errMsg(e).slice(0, 80)}`;
        }
        try {
          const day = spec.format === "iso" ? range.to : range.to.replace(/-/g, "");
          const l2 = classifyFitListing(await fresh().callTool(spec.tool, { [spec.start]: day }));
          probe.unJourSansLimit = shape(l2);
        } catch (e) {
          probe.unJourSansLimit = `exception:${errMsg(e).slice(0, 80)}`;
        }
        const recordsTool = resolveTool(tools, COROS_TOOLS.sportRecords, /sport.*record|activit(y|ies).*list/i);
        if (recordsTool) {
          try {
            const r = await fresh().callTool(recordsTool, {});
            probe.listeActivites = r.isError
              ? `erreur:${r.text.slice(0, 80)}`
              : isCorosAnomaly(r.text) ? `anomalie` : `ok:${r.text.length} car.`;
          } catch (e) {
            probe.listeActivites = `exception:${errMsg(e).slice(0, 80)}`;
          }
        }
        console.log(`provider-coros-sync: connexion ${conn.id} : sonde`, JSON.stringify(probe));
        return adopted ?? listing;
      }),
      quotaRemaining: async () => {
        const { data, error } = await admin.rpc("provider_fit_quota_remaining", {
          p_connection_id: conn.id,
          p_limit: COROS_FIT_LIMITS.perDay,
        });
        if (error) throw new Error(`lecture du quota : ${error.message}`);
        return Number(data ?? 0);
      },
      reserve: async (count: number) => {
        const { data, error } = await admin.rpc("provider_fit_quota_reserve", {
          p_connection_id: conn.id,
          p_count: count,
          p_limit: COROS_FIT_LIMITS.perDay,
        });
        if (error) throw new Error(`réservation du quota : ${error.message}`);
        return data === true;
      },
      exhaustQuota: async () => {
        await admin.rpc("provider_fit_quota_exhaust", {
          p_connection_id: conn.id,
          p_limit: COROS_FIT_LIMITS.perDay,
        });
      },
      ingest: timed(timing.ingest, (url: string) => ingestFit(admin, conn.athlete_id, url)),
      hasTime: () => Date.now() - startedAt < DEADLINE_MS,
    };
    const opts = { span: WINDOW_SPAN, perCall: COROS_FIT_LIMITS.perCall, budget };

    const absorb = (r: SweepResult) => {
      report.imported += r.imported;
      report.duplicates += r.duplicates;
      report.rejected.push(...r.rejected);
      warnings.push(...r.warnings);
    };

    let recent: SweepResult | null = null;
    let backfill: SweepResult | null = null;
    try {
      // D'abord les derniers jours : ce que le coach regarde le matin.
      recent = await sweepFitWindows(deps, plan.recent.from, plan.recent.to, opts);
      absorb(recent);

      // Puis le rattrapage, avec ce qu'il reste de budget — sauf si COROS est en panne.
      if (plan.backfill && recent.stop === "done") {
        backfill = await sweepFitWindows(deps, plan.backfill.from, plan.backfill.to, {
          ...opts,
          budget: Math.max(0, budget - recent.used),
        });
        absorb(backfill);
      }
    } catch (e) {
      // Base indisponible pour le quota : rien n'a été téléchargé hors réservation.
      report.error = `Synchronisation interrompue : ${errMsg(e).slice(0, 200)}`;
    }

    timing.windows = { recent: recent?.windows ?? 0, backfill: backfill?.windows ?? 0 };
    report.syncedThrough = nextSyncedThrough(plan, {
      backfillThrough: backfill?.processedThrough ?? null,
      recentThrough: recent?.processedThrough ?? null,
    });

    const stops = [recent, backfill].filter((r): r is SweepResult => r !== null);
    const failed = stops.find((r) => r.stop === "error");
    if (failed && !report.error) report.error = failed.error;
    const quotaHit = stops.find((r) => r.stop === "quota");
    if (quotaHit?.error) warnings.push(quotaHit.error);

    /*
      Quota, budget et temps ne sont pas des erreurs : le curseur est resté sur
      la dernière fenêtre complète, et la suite viendra d'elle-même. Dit à
      l'athlète (compte rendu), pas écrit dans `last_error`, affiché en rouge.
    */
    if (stops.some((r) => r.stop === "quota")) {
      report.pending = "Quota COROS du jour atteint (50 fichiers) : la suite de l'historique sera récupérée demain.";
    } else if (stops.some((r) => r.stop === "budget")) {
      report.pending = "Limite de fichiers de la synchronisation manuelle atteinte : la suite sera récupérée cette nuit.";
    } else if (stops.some((r) => r.stop === "deadline")) {
      report.pending = "Synchronisation longue interrompue avant la limite de temps : elle reprendra au prochain passage.";
    }
  }

  // ─── Données quotidiennes ───
  const dailyTool = toolByName(dailyToolName);
  if (dailyTool) {
    try {
      report.dailies = await ingestDailies(admin, conn.athlete_id, mcp, resolveDateArgs(dailyTool, { allowSingleDay: true }), today);
    } catch (e) {
      warnings.push(`données quotidiennes non lues : ${errMsg(e).slice(0, 200)}`);
    }
  }

  timing.totalMs = Date.now() - startedAt;
  console.log(`provider-coros-sync: connexion ${conn.id} : durées`, JSON.stringify(timing));

  await admin
    .from("provider_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      synced_through: report.syncedThrough,
      last_error: summarize(report),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return report;
}

/*
  `last_error` porte l'erreur, les refus et les avertissements plutôt que
  d'être vidé : « 12 importées » sans mention des 3 fichiers illisibles laisse
  croire à un succès complet, et l'athlète cherche ensuite pourquoi une sortie
  manque. Un passage propre le remet à null.
*/
function summarize(r: SyncReport): string | null {
  const parts: string[] = [];
  if (r.error) parts.push(r.error);
  if (r.rejected.length > 0) {
    parts.push(`${r.rejected.length} fichier(s) non lu(s) : ${r.rejected.slice(0, 3).map((x) => x.reason).join(" ; ")}`);
  }
  if (r.warnings && r.warnings.length > 0) parts.push(r.warnings.slice(0, 2).join(" ; "));
  return parts.length > 0 ? parts.join(" · ").slice(0, 500) : null;
}

/** Synchronise une connexion sous verrou ; ne lève pas. */
async function syncLocked(
  admin: SupabaseClient,
  conn: Connection,
  budget: number,
): Promise<SyncReport> {
  const { data: token, error: lockError } = await admin.rpc("provider_sync_try_lock", {
    p_connection_id: conn.id,
    p_ttl_seconds: LOCK_TTL_S,
  });
  if (lockError) {
    return { ...emptyReport(conn), error: `verrou de synchronisation indisponible : ${lockError.message}` };
  }
  if (!token) {
    return {
      ...emptyReport(conn),
      error: "Une synchronisation est déjà en cours pour cette montre : réessaie dans quelques minutes.",
    };
  }

  try {
    return await syncConnection(admin, conn, budget);
  } catch (e) {
    const msg = errMsg(e);
    console.error(`provider-coros-sync: connexion ${conn.id} :`, msg);
    /*
      Le curseur n'est pas touché : il reste sur la dernière fenêtre traitée
      en entier. Seuls l'heure de tentative et le message changent.
    */
    await admin
      .from("provider_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: msg.slice(0, 500) })
      .eq("id", conn.id);
    return { ...emptyReport(conn), error: msg };
  } finally {
    await admin.rpc("provider_sync_unlock", { p_connection_id: conn.id, p_token: token });
  }
}

// ───────────────────────────────── Entrée ────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!bearer) return json({ error: "Non autorisé" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  /*
    Même distinction que dans `provider-disconnect` : seule l'égalité avec la
    clé `service_role` autorise à agir pour quelqu'un d'autre. Le
    `connection_id` du corps n'est lu que dans ce cas — venant d'un client, ce
    serait une porte ouverte.
  */
  const isCron = await isServiceRoleBearer(bearer);

  let body: { connection_id?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Corps vide ou illisible : traité comme `{}`.
  }

  let connections: Connection[];
  let budget: number;

  const select = "id, athlete_id, api_host, status, synced_through, connected_at";

  if (isCron) {
    budget = COROS_FIT_LIMITS.perDay;
    let query = admin
      .from("provider_connections")
      .select(select)
      .eq("provider", "coros")
      .eq("status", "active");
    if (typeof body.connection_id === "string") {
      if (!UUID_RE.test(body.connection_id)) return json({ error: "connection_id invalide" }, 400);
      query = query.eq("id", body.connection_id);
    }
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    connections = (data ?? []) as Connection[];
  } else {
    budget = COROS_FIT_LIMITS.perCall;
    const { data: auth, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !auth.user) return json({ error: "Non autorisé" }, 401);

    const { data, error } = await admin
      .from("provider_connections")
      .select(select)
      .eq("provider", "coros")
      .eq("athlete_id", auth.user.id);
    if (error) return json({ error: error.message }, 500);
    connections = (data ?? []) as Connection[];

    if (connections.length === 0) {
      return json({ error: "aucune_connexion", message: "Aucune montre COROS connectée." }, 404);
    }
    if (connections[0].status !== "active") {
      return json({
        error: "connexion_inactive",
        message: "La connexion COROS doit être rétablie avant de synchroniser.",
        status: connections[0].status,
      }, 409);
    }
  }

  /*
    Une connexion en panne n'arrête pas les autres (mode « toutes les
    connexions » de l'ancien déclencheur) : `syncLocked` ne lève pas.
  */
  const reports: SyncReport[] = [];
  for (const conn of connections) {
    reports.push(await syncLocked(admin, conn, budget));
  }

  return json({ connections: reports.length, reports });
});
