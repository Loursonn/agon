/**
 * Garmin Connect Developer Program — adaptateur OAuth et traduction des
 * notifications push vers le schéma Agon.
 *
 * Module pur : ni `Deno.*`, ni base. Les secrets et `fetch` sont injectés, ce
 * qui le rend testable par Vitest avec des exemples de payloads.
 *
 * VÉRIFIÉ dans la spec officielle « OAuth2.0 PKCE Specification » (PDF du
 * portail Garmin, v2.0 du 15/10/2026, relue le 09/11/2026) :
 *   - autorisation : GET https://connect.garmin.com/oauth2Confirm
 *     (response_type=code, client_id, code_challenge, code_challenge_method=S256,
 *     redirect_uri, state) ;
 *   - jeton : POST https://diauth.garmin.com/di-oauth2-service/oauth/token,
 *     formulaire, `client_secret` OBLIGATOIRE (≠ COROS) ;
 *   - expires_in = 86 400 s (24 h), refresh_token_expires_in ≈ 7 776 000 s
 *     (90 j), nouveau refresh token à chaque rafraîchissement, marge
 *     recommandée de 600 s ;
 *   - scope imposé par Garmin, non paramétrable (« PARTNER_WRITE PARTNER_READ
 *     CONNECT_READ CONNECT_WRITE ») : on n'en demande pas ;
 *   - GET  /partner-gateway/rest/user/id          → {"userId": "…"} (stable d'un
 *     jeton à l'autre) ;
 *   - DELETE /partner-gateway/rest/user/registration — OBLIGATOIRE quand l'app
 *     offre « Disconnect » ou « Delete my account » ;
 *   - GET  /partner-gateway/rest/user/permissions → {"permissions": ["ACTIVITY_EXPORT",
 *     "HEALTH_EXPORT", "WORKOUT_IMPORT", …].
 *
 * VÉRIFIÉ dans Health API 2.1 et Activity API 2.1 (PDF du portail, lus le
 * 09/11/2026) — forme des notifications push :
 *   - objet JSON dont chaque clé de premier niveau est un type de résumé
 *     (`activities`, `dailies`, `sleeps`, `hrv`, `deregistrations`,
 *     `userPermissionsChange`…) portant un tableau d'entrées ;
 *   - chaque entrée porte `userId` ; les résumés portent `summaryId` ;
 *   - noms de champs du résumé d'activité : `startTimeInSeconds`,
 *     `startTimeOffsetInSeconds`, `durationInSeconds`, `distanceInMeters`,
 *     `averageHeartRateInBeatsPerMinute`, `maxHeartRateInBeatsPerMinute`,
 *     `totalElevationGainInMeters`, `activeKilocalories`, `activityType`,
 *     `deviceName` ;
 *   - en mode « ping » une entrée porte `callbackURL` au lieu des données.
 * À confronter aux premiers payloads réels (clé Personal ou premier athlète) :
 * les fonctions ci-dessous ne lisent que des champs nommés, et une mesure
 * absente donne `null`, jamais 0.
 */
import { sportFromLabel } from "../activityFiles/sports.ts";
import type { FetchLike, OAuthClientConfig, ProviderAdapter } from "../oauth.ts";

// ─────────────────────────────── Endpoints ───────────────────────────────────

export const GARMIN_ENDPOINTS = {
  authorize: "https://connect.garmin.com/oauth2Confirm",
  token: "https://diauth.garmin.com/di-oauth2-service/oauth/token",
  userId: "https://apis.garmin.com/partner-gateway/rest/user/id",
  permissions: "https://apis.garmin.com/partner-gateway/rest/user/permissions",
  registration: "https://apis.garmin.com/partner-gateway/rest/user/registration",
} as const;

/** Hôte conservé dans `provider_connections.api_host` et l'état OAuth. */
export const GARMIN_API_HOST = "https://apis.garmin.com";

/** Permissions Garmin, telles que renvoyées par /user/permissions. */
export const GARMIN_PERMISSIONS = {
  activity: "ACTIVITY_EXPORT",
  health: "HEALTH_EXPORT",
  workoutImport: "WORKOUT_IMPORT",
} as const;

// ─────────────────────────────── Adaptateur ──────────────────────────────────

export function garminAdapter(client: OAuthClientConfig, fetchImpl: FetchLike = fetch): ProviderAdapter {
  if (!client.clientSecret) {
    // Garmin exige le secret à l'échange : un client sans secret échouerait au
    // retour de l'athlète, après qu'il a accordé l'accès. On refuse avant.
    throw new Error("Garmin : client_secret obligatoire");
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: "application/json" });

  return {
    provider: "garmin",
    label: "Garmin",
    endpoints: { authorize: GARMIN_ENDPOINTS.authorize, token: GARMIN_ENDPOINTS.token },
    client,
    async fetchUserId(accessToken) {
      const res = await fetchImpl(GARMIN_ENDPOINTS.userId, { headers: bearer(accessToken) });
      if (!res.ok) throw new Error(`Garmin user/id : ${res.status}`);
      const body = (await res.json()) as { userId?: unknown };
      if (typeof body.userId !== "string" || body.userId === "") {
        throw new Error("Garmin user/id : userId absent");
      }
      return body.userId;
    },
    /*
      Chez Garmin, couper l'accès = supprimer l'enregistrement de l'utilisateur
      (`DELETE /user/registration`). Il n'y a pas de point de révocation RFC 7009.
      2xx = confirmé ; 404 = l'enregistrement n'existe déjà plus chez Garmin
      (l'athlète l'a retiré depuis Garmin Connect) : l'accès est coupé, on le
      compte comme confirmé. 401 = notre jeton ne vaut plus : rien n'est
      prouvé, donc non confirmé (l'interface le dit).
    */
    async revoke({ accessToken }) {
      try {
        const res = await fetchImpl(GARMIN_ENDPOINTS.registration, {
          method: "DELETE",
          headers: bearer(accessToken),
        });
        return res.ok || res.status === 404;
      } catch {
        return false;
      }
    },
  };
}

/** Permissions accordées par l'utilisateur (liste vide si illisible). */
export async function fetchGarminPermissions(accessToken: string, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const res = await fetchImpl(GARMIN_ENDPOINTS.permissions, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Garmin user/permissions : ${res.status}`);
  return normalizePermissions(await res.json());
}

/**
 * La spec montre un exemple mal formé (`{["ACTIVITY_EXPORT", …]}`) : on accepte
 * un tableau nu, ou un objet portant un tableau `permissions`.
 */
export function normalizePermissions(body: unknown): string[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { permissions?: unknown }).permissions)
    ? (body as { permissions: unknown[] }).permissions
    : [];
  return [...new Set(list.filter((p): p is string => typeof p === "string" && p !== ""))];
}

// ─────────────────────────── Notifications push ──────────────────────────────

/** Types transformés en activités Agon (`provider_activities`). */
export const ACTIVITY_TYPES = ["activities", "manuallyUpdatedActivities", "activityDetails"] as const;
/** Types fusionnés dans `provider_dailies`. */
export const DAILY_TYPES = ["dailies", "sleeps", "hrv"] as const;
export const CONTROL_TYPES = ["deregistrations", "userPermissionsChange"] as const;

/**
 * Tous les types relevant de la permission ACTIVITY_EXPORT. Tout autre type
 * de données (dailies, epochs, sleeps, stressDetails, userMetrics, bodyComps,
 * pulseox, allDayRespiration, healthSnapshot, hrv, bloodPressures, skinTemp,
 * nutrition, hydration…, et ceux que Garmin ajoutera) relève de HEALTH_EXPORT.
 * Chaque résumé reçu est stocké brut (`provider_raw_records`), traité ou non.
 */
export const ACTIVITY_PERMISSION_TYPES = [...ACTIVITY_TYPES, "activityFiles", "moveIQActivities"] as const;

/** Types dont un fichier lourd est rangé dans le bucket `provider-raw`. */
export const RAW_FILE_TYPES = ["activityDetails", "activityFiles"] as const;

export type GarminSummaryKind =
  | (typeof ACTIVITY_TYPES)[number]
  | (typeof DAILY_TYPES)[number]
  | (typeof CONTROL_TYPES)[number];

export interface NotificationEntry {
  type: string;
  userId: string | null;
  entry: Record<string, unknown>;
}

/**
 * Éclate une notification en entrées. Tolérant : une clé inconnue est gardée
 * (stockée puis ignorée), une valeur qui n'est pas un tableau d'objets est
 * écartée. Lève seulement si le corps n'est pas un objet JSON.
 */
export function splitNotification(body: unknown): NotificationEntry[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("notification Garmin : objet JSON attendu");
  }
  const out: NotificationEntry[] = [];
  for (const [type, value] of Object.entries(body as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const entry = item as Record<string, unknown>;
      out.push({ type, userId: typeof entry.userId === "string" && entry.userId ? entry.userId : null, entry });
    }
  }
  return out;
}

/** Une entrée en mode ping (URL de rappel au lieu des données). */
export function isPingEntry(entry: Record<string, unknown>): boolean {
  return typeof entry.callbackURL === "string";
}

// ─────────────────────────────── Mapping ─────────────────────────────────────

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Entier ≥ 0, ou null. */
const count = (v: unknown): number | null => {
  const n = finite(v);
  return n === null || n < 0 ? null : Math.round(n);
};

/** Strictement positif, ou null : une durée ou une distance à 0 n'est pas une mesure. */
const positive = (v: unknown): number | null => {
  const n = finite(v);
  return n === null || n <= 0 ? null : n;
};

/** FC plausible (bornes de la contrainte `provider_activities_hr_sane`), sinon null. */
const heartRate = (v: unknown, min = 20, max = 250): number | null => {
  const n = finite(v);
  return n === null || n < min || n > max ? null : Math.round(n);
};

const text = (v: unknown, maxLen = 120): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, maxLen) : null;

/*
  `activityType` Garmin → slug Agon. Les slugs sont ceux des décodeurs de
  fichiers (`activityFiles/sports.ts`, granularité FIT) : la même sortie
  importée en FIT puis reçue de Garmin doit porter le même sport, sinon le
  rapprochement ±2 min (qui refuse deux sports différents) laisserait passer le
  doublon. Ce qui n'est pas listé passe par `sportFromLabel`.
*/
const GARMIN_SPORTS: Record<string, string> = {
  RUNNING: "running",
  TRAIL_RUNNING: "running",
  TREADMILL_RUNNING: "running",
  TRACK_RUNNING: "running",
  STREET_RUNNING: "running",
  INDOOR_RUNNING: "running",
  VIRTUAL_RUN: "running",
  ULTRA_RUN: "running",
  CYCLING: "cycling",
  ROAD_BIKING: "cycling",
  MOUNTAIN_BIKING: "cycling",
  GRAVEL_CYCLING: "cycling",
  INDOOR_CYCLING: "cycling",
  VIRTUAL_RIDE: "cycling",
  CYCLOCROSS: "cycling",
  TRACK_CYCLING: "cycling",
  E_BIKE_FITNESS: "e_biking",
  E_BIKE_MOUNTAIN: "e_biking",
  LAP_SWIMMING: "swimming",
  OPEN_WATER_SWIMMING: "swimming",
  SWIMMING: "swimming",
  WALKING: "walking",
  CASUAL_WALKING: "walking",
  SPEED_WALKING: "walking",
  HIKING: "hiking",
  STRENGTH_TRAINING: "training",
  INDOOR_CARDIO: "fitness_equipment",
  ELLIPTICAL: "fitness_equipment",
  STAIR_CLIMBING: "fitness_equipment",
  INDOOR_ROWING: "rowing",
  ROWING: "rowing",
  HIIT: "hiit",
  YOGA: "meditation",
  BREATHWORK: "meditation",
  MULTI_SPORT: "multisport",
  TRIATHLON: "multisport",
  CROSS_COUNTRY_SKIING_WS: "cross_country_skiing",
  RESORT_SKIING_SNOWBOARDING_WS: "alpine_skiing",
  BACKCOUNTRY_SKIING_SNOWBOARDING_WS: "alpine_skiing",
  SNOW_SHOE_WS: "snowshoeing",
  STAND_UP_PADDLEBOARDING: "stand_up_paddleboarding",
  KAYAKING: "kayaking",
  BOULDERING: "rock_climbing",
  INDOOR_CLIMBING: "rock_climbing",
  BOXING: "boxing",
};

export function garminSport(activityType: unknown): string | null {
  if (typeof activityType !== "string" || activityType.trim() === "") return null;
  const key = activityType.trim().toUpperCase();
  return GARMIN_SPORTS[key] ?? sportFromLabel(activityType);
}

/** Jour local `YYYY-MM-DD` d'un instant (secondes UTC) et de son décalage. */
export function localDay(startSec: number, offsetSec: number | null): string {
  return new Date((startSec + (offsetSec ?? 0)) * 1000).toISOString().slice(0, 10);
}

/** Ligne `provider_activities` (hors athlete_id) issue d'un résumé Garmin. */
export interface GarminActivityRow {
  source: "garmin";
  external_id: string;
  started_at: string;
  local_date: string;
  sport: string | null;
  duration_s: number | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_pace_s_per_km: number | null;
  calories: number | null;
  device_name: string | null;
  details: Record<string, unknown>;
  raw: Record<string, unknown>;
}

/**
 * Résumé d'activité Garmin → ligne `provider_activities`.
 *
 * `null` si l'entrée n'est pas exploitable (pas d'identifiant ou pas d'heure de
 * départ) : mieux vaut ne rien importer qu'une sortie datée au 1er janvier 1970.
 * `activityDetails` porte le résumé dans `summary` ; on le lit au même titre.
 */
export function mapGarminActivity(input: Record<string, unknown>): GarminActivityRow | null {
  const nested = input.summary && typeof input.summary === "object" && !Array.isArray(input.summary)
    ? input.summary as Record<string, unknown>
    : null;
  const s: Record<string, unknown> = nested
    ? { ...nested, summaryId: input.summaryId ?? nested.summaryId, activityId: input.activityId ?? nested.activityId }
    : input;

  /*
    `activityId` d'abord : c'est l'identifiant de l'activité, commun au résumé
    (`activities`), à sa correction (`manuallyUpdatedActivities`) et au détail
    (`activityDetails`, dont le `summaryId` est distinct). Clé sur `summaryId`,
    la même sortie reçue par deux types ferait deux lignes.
  */
  const activityId = finite(s.activityId) !== null ? String(s.activityId) : text(s.activityId, 200);
  const id = activityId ?? text(s.summaryId, 200);
  const start = finite(s.startTimeInSeconds);
  if (!id || start === null || start <= 0) return null;

  const offset = finite(s.startTimeOffsetInSeconds);
  const duration = positive(s.durationInSeconds);
  const distance = positive(s.distanceInMeters);
  const elevation = finite(s.totalElevationGainInMeters);
  const pace = duration !== null && distance !== null && distance >= 100
    ? Math.round((duration / (distance / 1000)) * 100) / 100
    : null;

  return {
    source: "garmin",
    external_id: id,
    started_at: new Date(start * 1000).toISOString(),
    local_date: localDay(start, offset),
    sport: garminSport(s.activityType),
    duration_s: duration === null ? null : Math.round(duration),
    distance_m: distance === null ? null : Math.round(distance * 100) / 100,
    // 0 m de dénivelé sur du plat est une vraie mesure : on le garde.
    elevation_gain_m: elevation === null || elevation < 0 ? null : Math.round(elevation * 100) / 100,
    avg_hr: heartRate(s.averageHeartRateInBeatsPerMinute),
    max_hr: heartRate(s.maxHeartRateInBeatsPerMinute),
    avg_pace_s_per_km: pace,
    calories: count(s.activeKilocalories),
    // « unknown » = activité saisie à la main sur Garmin Connect (Activity API 2.1).
    device_name: /^unknown$/i.test(String(s.deviceName ?? "").trim()) ? null : text(s.deviceName),
    details: {
      provider: "garmin",
      activityName: text(s.activityName, 200),
      activityType: text(s.activityType, 80),
      manual: s.manual === true,
    },
    raw: withoutSamples(input),
  };
}

/*
  Les échantillons seconde par seconde d'un `activityDetails` pèsent des
  mégaoctets et aucun écran ne les lit : on ne les garde pas dans `raw`, on
  note seulement combien il y en avait.
*/
function withoutSamples(input: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(input.samples)) return input;
  const { samples, ...rest } = input;
  return { ...rest, samplesDropped: (samples as unknown[]).length };
}

/** Champs de `provider_dailies` renseignés par un type de résumé. */
export type DailyFields = Partial<Record<
  | "resting_hr" | "hrv_ms" | "sleep_total_min" | "sleep_deep_min" | "sleep_rem_min" | "sleep_score"
  | "steps" | "stress_avg" | "body_battery_min" | "body_battery_max" | "vo2max" | "training_load",
  number | null
>>;

export interface GarminDaily {
  kind: "dailies" | "sleeps" | "hrv";
  day: string;
  fields: DailyFields;
  raw: Record<string, unknown>;
}

const minutes = (sec: unknown): number | null => {
  const n = finite(sec);
  return n === null || n < 0 ? null : Math.round(n / 60);
};

const calendarDate = (e: Record<string, unknown>): string | null => {
  const d = e.calendarDate;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const start = finite(e.startTimeInSeconds);
  return start !== null && start > 0 ? localDay(start, finite(e.startTimeOffsetInSeconds)) : null;
};

/**
 * Résumé quotidien Garmin → champs `provider_dailies`.
 *
 * Seuls les champs que ce type de résumé sait renseigner sont présents dans
 * `fields` : un résumé de sommeil ne doit pas effacer les pas de la journée
 * (voir `provider_daily_merge`). Une mesure absente vaut `null`.
 */
export function mapGarminDaily(kind: string, e: Record<string, unknown>): GarminDaily | null {
  const day = calendarDate(e);
  if (!day) return null;

  if (kind === "dailies") {
    const steps = count(e.steps);
    const stress = finite(e.averageStressLevel);
    return {
      kind,
      day,
      fields: {
        resting_hr: heartRate(e.restingHeartRateInBeatsPerMinute, 20, 150),
        steps,
        // Garmin code « pas de mesure » par -1 / -2 sur le stress : pas un niveau.
        stress_avg: stress === null || stress < 0 || stress > 100 ? null : Math.round(stress),
        // Body battery mini/maxi : absent des `dailies` (Health API 2.1 n'y met
        // que bodyBatteryChargedValue / DrainedValue) ; il faudrait les
        // `stressDetails`. Non affiché aujourd'hui : on ne l'invente pas.
      },
      raw: e,
    };
  }

  if (kind === "sleeps") {
    const total = minutes(e.durationInSeconds);
    const score = e.overallSleepScore && typeof e.overallSleepScore === "object"
      ? finite((e.overallSleepScore as Record<string, unknown>).value)
      : finite(e.sleepScore);
    return {
      kind,
      day,
      fields: {
        sleep_total_min: total === null || total === 0 || total > 1440 ? null : total,
        sleep_deep_min: minutes(e.deepSleepDurationInSeconds),
        sleep_rem_min: minutes(e.remSleepInSeconds ?? e.remSleepDurationInSeconds),
        sleep_score: score === null || score < 0 || score > 100 ? null : Math.round(score),
      },
      raw: e,
    };
  }

  if (kind === "hrv") {
    const avg = finite(e.lastNightAvg);
    return {
      kind,
      day,
      fields: { hrv_ms: avg === null || avg <= 0 || avg > 500 ? null : Math.round(avg * 100) / 100 },
      raw: e,
    };
  }

  return null;
}

/** Permission nécessaire pour importer un type de résumé. */
export function permissionFor(kind: string): string | null {
  if ((CONTROL_TYPES as readonly string[]).includes(kind)) return null;
  if ((ACTIVITY_PERMISSION_TYPES as readonly string[]).includes(kind)) return GARMIN_PERMISSIONS.activity;
  return GARMIN_PERMISSIONS.health;
}
