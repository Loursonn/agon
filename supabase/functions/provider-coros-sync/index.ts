/**
 * Synchronisation COROS : va chercher les activités et les données
 * quotidiennes, et les range dans `provider_activities` / `provider_dailies`.
 *
 * Deux appelants, deux comportements :
 *
 *   - **le cron** (clé `service_role`) parcourt toutes les connexions actives
 *     et dispose du quota journalier entier, parce que c'est lui qui rattrape
 *     l'historique ;
 *   - **l'athlète** (jeton de session) ne synchronise que la sienne, avec un
 *     budget réduit. Un bouton « synchroniser maintenant » est un complément,
 *     pas un rattrapage : lui laisser les 50 fichiers quotidiens permettrait
 *     d'épuiser le quota en trois clics et de bloquer le cron du lendemain.
 *
 * Le chiffre affiché à l'athlète vient toujours d'un fichier FIT, jamais de la
 * prose des outils MCP. Les réponses textuelles ne servent qu'à deux choses :
 * trouver les URL des FIT, et conserver les données quotidiennes — qui n'ont
 * pas d'équivalent binaire — telles quelles, sans en extraire de nombre.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasConsent } from "../_shared/auth.ts";
import {
  COROS_FIT_LIMITS,
  COROS_TOOLS,
  daysBetween,
  extractFitUrls,
  fetchMetadata,
  planFitWindow,
  refreshTokens,
  shiftDay,
  ymd,
} from "../_shared/coros.ts";
import { McpClient, resolveTool } from "../_shared/mcp.ts";
import { looksLikeFit, parseFit } from "../_shared/activityFiles/fit.ts";
import type { ParsedActivity } from "../_shared/activityFiles/types.ts";

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

/*
  Profondeur d'historique récupérée à la première synchronisation. Réglable par
  variable d'environnement parce que la bonne valeur dépend de ce qu'on veut
  payer en quota : à 50 fichiers par jour, un an d'un athlète assidu représente
  environ cinq jours de rattrapage.
*/
const HISTORY_DAYS = Number(Deno.env.get("COROS_HISTORY_DAYS") ?? "365");

/*
  Les données quotidiennes ne consomment pas le quota de fichiers, mais chaque
  journée est un appel MCP. Une semaine couvre le cas réel — un athlète qui
  consulte son sommeil regarde les derniers jours — sans transformer chaque
  exécution en centaines d'allers-retours.
*/
const DAILY_DAYS = Number(Deno.env.get("COROS_DAILY_DAYS") ?? "7");

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
  rejected: Array<{ name: string; reason: string }>;
  dailies: number;
  syncedThrough: string | null;
  error?: string;
}

// ───────────────────────────────── Jetons ────────────────────────────────────

/**
 * Jeton d'accès utilisable, rafraîchi si besoin.
 *
 * La marge de 120 secondes n'est pas de la superstition : un jeton valide au
 * moment du contrôle peut expirer pendant la série de téléchargements qui
 * suit, et le rattrapage se solderait par une moitié de fenêtre importée et un
 * `synced_through` avancé quand même.
 */
async function freshAccessToken(
  admin: SupabaseClient,
  conn: Connection,
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

  if (stillGood) return row.access_token;

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
    throw new Error("jeton expiré, reconnexion nécessaire");
  }

  const host = conn.api_host;
  if (!host) throw new Error("hôte régional inconnu pour cette connexion");

  const { data: client } = await admin
    .from("provider_oauth_clients")
    .select("client_id")
    .eq("provider", "coros")
    .eq("api_host", host)
    .maybeSingle();
  if (!client?.client_id) throw new Error("client OAuth introuvable pour cet hôte");

  const meta = await fetchMetadata(host);

  let tokens;
  try {
    tokens = await refreshTokens(meta, {
      refreshToken: row.refresh_token,
      clientId: client.client_id,
    });
  } catch (e) {
    /*
      Un refus de rafraîchissement veut dire que l'athlète a retiré l'accès
      côté COROS, ou que le jeton a été révoqué. C'est `needs_reauth`, pas une
      panne passagère : réessayer n'y changera rien.
    */
    await admin
      .from("provider_connections")
      .update({
        status: "needs_reauth",
        last_error: "COROS a refusé le renouvellement : reconnecte ta montre.",
      })
      .eq("id", conn.id);
    throw e;
  }

  const { error: writeError } = await admin.rpc("provider_token_write", {
    p_connection_id: conn.id,
    p_access_token: tokens.access_token,
    p_refresh_token: tokens.refresh_token ?? null,
    p_expires_at: tokens.expires_at ?? null,
  });
  if (writeError) throw new Error(`écriture du jeton : ${writeError.message}`);

  return tokens.access_token;
}

// ──────────────────────────────── Ingestion ──────────────────────────────────

/**
 * Insère une activité, en refusant les doublons inter-sources.
 *
 * `external_id` est l'empreinte du contenu du fichier, et la contrainte
 * d'unicité porte sur `(athlete_id, source, external_id)`. Un athlète qui a
 * importé son archive Strava *puis* connecté sa montre verrait donc deux fois
 * la même sortie, une par source — même octets, même empreinte, deux lignes.
 * Le contrôle explicite ci-dessous coûte une requête et évite un doublon
 * visible que personne ne saurait expliquer.
 */
async function insertActivity(
  admin: SupabaseClient,
  athleteId: string,
  act: ParsedActivity,
): Promise<"inserted" | "duplicate"> {
  const { data: already } = await admin
    .from("provider_activities")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("external_id", act.externalId)
    .limit(1);

  if (already && already.length > 0) return "duplicate";

  const { error } = await admin.from("provider_activities").insert({
    athlete_id: athleteId,
    source: "coros",
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
    // `ai_allowed` est délibérément absent : un trigger le pose depuis
    // `data_source_policies`. L'envoyer d'ici serait au mieux ignoré.
  });

  if (error) {
    // 23505 = violation d'unicité : deux exécutions concurrentes, pas une
    // erreur. Le résultat voulu est atteint.
    if ((error as { code?: string }).code === "23505") return "duplicate";
    throw new Error(`insertion de l'activité : ${error.message}`);
  }

  return "inserted";
}

/** Télécharge et décode un FIT. Ne lève pas : un fichier illisible est un refus. */
async function ingestFit(
  admin: SupabaseClient,
  athleteId: string,
  url: string,
): Promise<{ imported: number; duplicates: number; rejected: SyncReport["rejected"] }> {
  const name = url.split("/").pop()?.split("?")[0] || "fichier.fit";
  const rejected: SyncReport["rejected"] = [];

  let bytes: Uint8Array;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { imported: 0, duplicates: 0, rejected: [{ name, reason: `téléchargement refusé (${res.status})` }] };
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { imported: 0, duplicates: 0, rejected: [{ name, reason: `téléchargement impossible : ${msg}` }] };
  }

  /*
    Contrôle avant décodage. Les URL sont trouvées dans de la prose : la
    sélection est volontairement large, donc elle peut ramener un lien qui
    n'est pas un FIT. Le constater ici donne un refus lisible au lieu d'une
    exception du décodeur.
  */
  if (!looksLikeFit(bytes)) {
    return { imported: 0, duplicates: 0, rejected: [{ name, reason: "le contenu téléchargé n'est pas un fichier FIT" }] };
  }

  let parsed;
  try {
    parsed = await parseFit(bytes, name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { imported: 0, duplicates: 0, rejected: [{ name, reason: msg }] };
  }

  rejected.push(...parsed.rejected);

  let imported = 0;
  let duplicates = 0;
  for (const act of parsed.activities) {
    try {
      const outcome = await insertActivity(admin, athleteId, act);
      if (outcome === "inserted") imported++;
      else duplicates++;
    } catch (e) {
      rejected.push({ name, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return { imported, duplicates, rejected };
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
 */
async function ingestDailies(
  admin: SupabaseClient,
  athleteId: string,
  mcp: McpClient,
  tool: string,
  today: string,
): Promise<number> {
  let stored = 0;

  for (let i = 1; i <= DAILY_DAYS; i++) {
    const day = shiftDay(today, -i);
    let text: string;
    try {
      const result = await mcp.callTool(tool, { startDate: day, endDate: day });
      if (result.isError || !result.text.trim()) continue;
      text = result.text;
    } catch {
      // Une journée indisponible n'empêche pas les autres.
      continue;
    }

    const { error } = await admin.from("provider_dailies").upsert(
      {
        athlete_id: athleteId,
        source: "coros",
        day,
        raw: { tool, text, queried_at: new Date().toISOString() },
      },
      { onConflict: "athlete_id,source,day" },
    );
    if (!error) stored++;
  }

  return stored;
}

// ─────────────────────────── Une connexion ───────────────────────────────────

async function syncConnection(
  admin: SupabaseClient,
  conn: Connection,
  budget: number,
): Promise<SyncReport> {
  const report: SyncReport = {
    athleteId: conn.athlete_id,
    imported: 0,
    duplicates: 0,
    rejected: [],
    dailies: 0,
    syncedThrough: conn.synced_through,
  };

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

  const accessToken = await freshAccessToken(admin, conn);
  const mcp = new McpClient({ host, accessToken });

  /*
    La liste réelle des outils, demandée une fois par exécution. Nos noms
    viennent de la documentation : les confronter au serveur évite de passer
    une nuit à chercher pourquoi un appel échoue, et les journaliser donne
    enfin une réponse observée à mettre dans la doc.
  */
  const tools = await mcp.listTools();
  console.log(
    `provider-coros-sync: outils disponibles (${tools.length}) :`,
    tools.map((t) => t.name).join(", "),
  );

  const fitTool = resolveTool(tools, COROS_TOOLS.fitUrls, /fit.*(url|file)|download.*fit/i);
  const dailyTool = resolveTool(tools, COROS_TOOLS.dailies, /daily|sleep/i);

  const today = ymd(new Date());

  // ─── Activités ───
  if (!fitTool) {
    report.rejected.push({
      name: "—",
      reason: `aucun outil de téléchargement FIT dans la liste publiée par COROS (${
        tools.map((t) => t.name).join(", ") || "liste vide"
      })`,
    });
  } else {
    /*
      Point de reprise. `synced_through` absent veut dire première
      synchronisation : on part en arrière de `HISTORY_DAYS` depuis la
      connexion, pas depuis aujourd'hui, pour que la profondeur d'historique
      soit la même pour un athlète connecté hier et un athlète connecté il y a
      six mois.
    */
    let cursor = conn.synced_through
      ? shiftDay(conn.synced_through, 1)
      : shiftDay(ymd(new Date(conn.connected_at)), -HISTORY_DAYS);

    let remaining = budget;

    while (remaining > 0 && daysBetween(cursor, today) >= 0) {
      /*
        La fenêtre se resserre jusqu'à tenir dans le budget restant. Lister est
        gratuit, télécharger est compté : il vaut donc mieux relister une
        fenêtre plus étroite que choisir arbitrairement dix URL sur trente et
        laisser des trous datés dans l'historique.
      */
      let range = planFitWindow(cursor, today, WINDOW_SPAN);
      let urls: string[] = [];

      for (let span = WINDOW_SPAN; range; span = Math.max(1, Math.floor(span / 2))) {
        const result = await mcp.callTool(fitTool, {
          startDate: range.from,
          endDate: range.to,
          // Le nom du paramètre de pagination n'est pas documenté de façon
          // fiable ; la fenêtre de dates est ce qui borne réellement.
          limit: COROS_FIT_LIMITS.perCall,
        });
        urls = result.isError ? [] : extractFitUrls(result.text);

        if (urls.length <= remaining || span <= 1) break;
        range = planFitWindow(cursor, today, Math.max(1, Math.floor(span / 2)));
      }
      if (!range) break;

      const take = urls.slice(0, remaining);
      for (const url of take) {
        const r = await ingestFit(admin, conn.athlete_id, url);
        report.imported += r.imported;
        report.duplicates += r.duplicates;
        report.rejected.push(...r.rejected);
        remaining--;
      }

      /*
        Le bord n'avance que si la fenêtre a été traitée en entier. Sinon il
        reste où il est : la prochaine exécution reprendra la même fenêtre, les
        fichiers déjà connus seront reconnus comme doublons, et rien ne manque.
        Avancer malgré une fenêtre tronquée créerait un trou définitif.
      */
      if (take.length < urls.length) break;
      report.syncedThrough = range.to;
      cursor = shiftDay(range.to, 1);
    }
  }

  // ─── Données quotidiennes ───
  if (dailyTool) {
    report.dailies = await ingestDailies(admin, conn.athlete_id, mcp, dailyTool, today);
  }

  /*
    `last_error` porte les refus plutôt que d'être vidé : « 12 importées » sans
    mention des 3 fichiers illisibles laisse croire à un succès complet, et
    l'athlète cherche ensuite pourquoi une sortie manque.
  */
  const summary = report.rejected.length > 0
    ? `${report.rejected.length} fichier(s) non lu(s) : ${
      report.rejected.slice(0, 3).map((r) => r.reason).join(" ; ")
    }`
    : null;

  await admin
    .from("provider_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      synced_through: report.syncedThrough,
      last_error: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return report;
}

// ───────────────────────────────── Entrée ────────────────────────────────────

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
    clé `service_role` autorise à agir pour quelqu'un d'autre. Rien dans le
    corps de la requête n'entre dans cette décision — un indicateur
    `internal: true` envoyé par un client serait une porte ouverte.
  */
  const isCron = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let connections: Connection[];
  let budget: number;

  const select = "id, athlete_id, api_host, status, synced_through, connected_at";

  if (isCron) {
    budget = COROS_FIT_LIMITS.perDay;
    const { data, error } = await admin
      .from("provider_connections")
      .select(select)
      .eq("provider", "coros")
      .eq("status", "active");
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

  const reports: SyncReport[] = [];
  for (const conn of connections) {
    try {
      reports.push(await syncConnection(admin, conn, budget));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`provider-coros-sync: ${conn.athlete_id} :`, msg);
      /*
        Une connexion en panne n'arrête pas les autres. Le cron traite tout le
        monde : laisser une exception remonter ferait dépendre la
        synchronisation de chaque athlète de la santé du précédent.
      */
      await admin
        .from("provider_connections")
        .update({ last_sync_at: new Date().toISOString(), last_error: msg.slice(0, 500) })
        .eq("id", conn.id);
      reports.push({
        athleteId: conn.athlete_id,
        imported: 0,
        duplicates: 0,
        rejected: [],
        dailies: 0,
        syncedThrough: conn.synced_through,
        error: msg,
      });
    }
  }

  return json({ connections: reports.length, reports });
});
