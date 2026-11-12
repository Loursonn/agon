/**
 * `activities.csv` de l'archive Strava (export de compte, RGPD art. 20).
 *
 * Ce fichier porte ce que la montre ne sait pas : le titre et la description
 * que l'athlète a écrits, l'effort ressenti (RPE 1-10), le matériel, le
 * drapeau « trajet », et les sorties saisies à la main sans fichier
 * (« Musculation 1 h »). Il ne remplace jamais le fichier d'activité : il le
 * complète, ligne par ligne, par le nom de fichier.
 *
 * Trois pièges, tous rencontrés dans de vrais exports :
 *  1. les en-têtes suivent la langue du compte : on repère les colonnes par
 *     nom (anglais ET français), jamais par position ;
 *  2. plusieurs en-têtes sont en double (« Distance », « Elapsed Time »,
 *     « Max Heart Rate », « Commute ») : la première occurrence est dans
 *     l'unité d'affichage du compte (km ou miles), la dernière en unités
 *     brutes (mètres, secondes). On lit toujours la dernière ;
 *  3. les descriptions contiennent des virgules, des guillemets et des
 *     retours à la ligne : un vrai lecteur CSV (RFC 4180), pas un `split`.
 *
 * Ce qui n'est PAS lu, volontairement : la note privée (« Activity Private
 * Note » : pas destinée au coach, décision d'Hugo du 2026-11-12), le poids,
 * la météo, les médias. Le contenu lu est une donnée affichée telle quelle,
 * jamais une instruction.
 */
import { sportFromLabel } from "./sports.ts";

/** Au-delà, l'archive est refusée : aucun athlète n'a 50 000 sorties. */
export const MAX_CSV_ROWS = 50_000;
/** Champ texte gardé au plus (une description de 20 000 caractères est un collage). */
const MAX_TEXT = 4_000;

export class StravaCsvError extends Error {}

/** Une ligne d'`activities.csv`, réduite à la sortie elle-même. */
export interface StravaCsvActivity {
  stravaId: string;
  /** ISO 8601 UTC (Strava écrit la date de départ en UTC). */
  startedAt: string;
  name: string | null;
  /** Libellé Strava tel qu'écrit (« Run », « Course à pied »…). */
  type: string | null;
  /** Sport Agon (`running`, `cycling`…), `null` si le type est inconnu. */
  sport: string | null;
  description: string | null;
  elapsedS: number | null;
  movingS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  maxSpeedMps: number | null;
  avgCadence: number | null;
  avgPowerW: number | null;
  calories: number | null;
  /** Effort ressenti 1-10 (« Perceived Exertion »), entier. */
  rpe: number | null;
  gear: string | null;
  /** `activities/123.fit.gz`, ou `null` pour une sortie saisie à la main. */
  filename: string | null;
  commute: boolean;
}

export interface StravaCsvResult {
  activities: StravaCsvActivity[];
  /** Lignes écartées (sans identifiant ou sans date lisible), avec la raison. */
  rejected: Array<{ name: string; reason: string }>;
  /** Langue reconnue des en-têtes. */
  language: "en" | "fr";
}

// ─────────────────────────────── CSV (RFC 4180) ──────────────────────────────

/**
 * Découpe un CSV en lignes de champs. Guillemets doublés, retours à la ligne
 * dans un champ entre guillemets, CRLF, BOM. Séparateur deviné sur la
 * première ligne (`,` ou `;`, ce dernier si le fichier est passé par Excel).
 */
export function parseCsv(text: string, maxRows = MAX_CSV_ROWS): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sep = guessSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const n = text.length;

  const endRow = () => {
    row.push(field);
    field = "";
    // Ligne vide (fin de fichier, ligne blanche) : ignorée.
    if (!(row.length === 1 && row[0] === "")) {
      rows.push(row);
      if (rows.length > maxRows + 1) {
        throw new StravaCsvError(`activities.csv : plus de ${maxRows} lignes, archive refusée`);
      }
    }
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      i++;
    } else if (c === sep) {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      endRow();
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

function guessSeparator(text: string): "," | ";" {
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (let i = 0; i < text.length && text[i] !== "\n"; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === ",") commas++;
    else if (!quoted && c === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

// ─────────────────────────────── En-têtes ────────────────────────────────────

/** Clé d'en-tête comparable : minuscules, sans accent ni ponctuation. */
export function headerKey(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type Field =
  | "id" | "date" | "name" | "type" | "description" | "elapsed" | "moving" | "distance"
  | "gain" | "loss" | "avgHr" | "maxHr" | "maxSpeed" | "cadence" | "power" | "calories"
  | "rpe" | "gear" | "filename" | "commute";

/*
  Anglais : en-têtes réels de l'export Strava. Français : libellés de
  l'interface Strava en français, à confirmer sur une vraie archive d'un
  compte en français (le parseur refuse clairement un en-tête inconnu plutôt
  que de deviner). Les colonnes sans équivalent ici sont ignorées.
*/
const ALIASES: Record<Field, { en: string[]; fr: string[] }> = {
  id: { en: ["Activity ID"], fr: ["ID de l'activité", "Identifiant de l'activité"] },
  date: { en: ["Activity Date"], fr: ["Date de l'activité"] },
  name: { en: ["Activity Name"], fr: ["Nom de l'activité"] },
  type: { en: ["Activity Type"], fr: ["Type d'activité", "Type de l'activité"] },
  description: { en: ["Activity Description"], fr: ["Description de l'activité"] },
  elapsed: { en: ["Elapsed Time"], fr: ["Temps écoulé", "Durée totale"] },
  moving: { en: ["Moving Time"], fr: ["Temps de déplacement", "Temps en mouvement"] },
  distance: { en: ["Distance"], fr: ["Distance"] },
  gain: { en: ["Elevation Gain"], fr: ["Dénivelé positif", "Gain d'altitude", "Dénivelé"] },
  loss: { en: ["Elevation Loss"], fr: ["Dénivelé négatif", "Perte d'altitude"] },
  avgHr: { en: ["Average Heart Rate"], fr: ["Fréquence cardiaque moyenne"] },
  maxHr: { en: ["Max Heart Rate"], fr: ["Fréquence cardiaque max.", "Fréquence cardiaque maximale", "Fréquence cardiaque max"] },
  maxSpeed: { en: ["Max Speed"], fr: ["Vitesse max.", "Vitesse maximale", "Vitesse max"] },
  cadence: { en: ["Average Cadence"], fr: ["Cadence moyenne"] },
  power: { en: ["Average Watts"], fr: ["Puissance moyenne", "Watts moyens"] },
  calories: { en: ["Calories"], fr: ["Calories"] },
  rpe: { en: ["Perceived Exertion"], fr: ["Effort perçu", "Effort ressenti"] },
  gear: { en: ["Activity Gear"], fr: ["Équipement de l'activité", "Matériel de l'activité", "Équipement"] },
  filename: { en: ["Filename"], fr: ["Nom du fichier", "Nom de fichier"] },
  commute: { en: ["Commute"], fr: ["Trajet domicile-travail", "Trajet"] },
};

/**
 * Position de chaque champ dans l'en-tête. Pour un en-tête en double, la
 * DERNIÈRE occurrence (unités brutes : mètres, secondes) ; « Distance » seule
 * (anciens exports, unité d'affichage inconnue : km ou miles) n'est pas lue.
 */
export function mapHeader(header: string[]): { columns: Partial<Record<Field, number>>; language: "en" | "fr" } {
  const keys = header.map(headerKey);
  const lastIndexOf = (names: string[]): { at: number; count: number } => {
    let at = -1;
    let count = 0;
    const wanted = new Set(names.map(headerKey));
    keys.forEach((k, i) => {
      if (wanted.has(k)) {
        at = i;
        count++;
      }
    });
    return { at, count };
  };

  let best: { columns: Partial<Record<Field, number>>; language: "en" | "fr"; found: number } | null = null;
  for (const language of ["en", "fr"] as const) {
    const columns: Partial<Record<Field, number>> = {};
    let found = 0;
    for (const field of Object.keys(ALIASES) as Field[]) {
      const { at, count } = lastIndexOf(ALIASES[field][language]);
      if (at < 0) continue;
      if (field === "distance" && count < 2) continue;
      columns[field] = at;
      found++;
    }
    if (!best || found > best.found) best = { columns, language, found };
  }
  if (!best || best.columns.id === undefined || best.columns.date === undefined) {
    throw new StravaCsvError(
      "activities.csv : en-têtes non reconnus (ni anglais ni français) — colonnes « Activity ID » et « Activity Date » introuvables",
    );
  }
  return { columns: best.columns, language: best.language };
}

// ─────────────────────────────── Valeurs ─────────────────────────────────────

/**
 * Nombre écrit à l'anglaise (`1,234.5`) ou à la française (`1 234,5`).
 * Le dernier séparateur rencontré est la virgule décimale.
 */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (s === "") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  janv: 0, fevr: 1, fev: 1, mars: 2, avr: 3, mai: 4, juin: 5, juil: 6, aout: 7,
};

/**
 * Date de départ, lue comme UTC. Formes rencontrées : `Jan 3, 2021, 7:45:12 AM`
 * (anglais), `3 janv. 2021, 07:45:12` ou `3 janv. 2021 à 07:45:12` (français),
 * ISO `2021-01-03 07:45:12`. `null` si illisible.
 */
export function parseStravaDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s === "") return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (iso) return utc(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0));

  const text = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/.exec(text);
  if (!time) return null;
  let hour = +time[1];
  if (time[4] === "pm" && hour < 12) hour += 12;
  if (time[4] === "am" && hour === 12) hour = 0;
  const datePart = text.slice(0, time.index);

  const en = /([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(datePart);
  const fr = /(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/.exec(datePart);
  let y: number, m: number | undefined, d: number;
  if (fr) {
    d = +fr[1];
    m = MONTHS[fr[2]] ?? MONTHS[fr[2].slice(0, 4)] ?? MONTHS[fr[2].slice(0, 3)];
    y = +fr[3];
  } else if (en) {
    m = MONTHS[en[1].slice(0, 3)];
    d = +en[2];
    y = +en[3];
  } else {
    return null;
  }
  if (m === undefined) return null;
  return utc(y, m, d, hour, +time[2], +(time[3] ?? 0));
}

function utc(y: number, m: number, d: number, h: number, mi: number, s: number): string | null {
  const ms = Date.UTC(y, m, d, h, mi, s);
  const date = new Date(ms);
  if (!Number.isFinite(ms) || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  return date.toISOString();
}

function text(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  if (t === "") return null;
  return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) : t;
}

function positive(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  return n !== null && n > 0 ? n : null;
}

function bool(raw: string | undefined): boolean {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "true" || t === "vrai" || t === "1" || t === "1.0" || t === "yes" || t === "oui";
}

function heartRate(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  return n !== null && n >= 20 && n <= 250 ? Math.round(n) : null;
}

/** RPE 1-10, entier ; tout le reste est ignoré. */
function rpe(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  if (n === null) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 10 ? r : null;
}

// ─────────────────────────────── Sports ──────────────────────────────────────

/*
  Types Strava (libellés anglais affichés dans le CSV, et leur traduction
  française) → sport Agon. Le reste passe par `sportFromLabel`, qui connaît
  les libellés courants ; un type que personne ne connaît reste `null`.
*/
const STRAVA_TYPES: Record<string, string> = {
  run: "running", trailrun: "running", virtualrun: "running", courseapied: "running", course: "running",
  trail: "running", coursesurpiste: "running", tapisdecourse: "running",
  ride: "cycling", virtualride: "cycling", mountainbikeride: "cycling", gravelride: "cycling", velo: "cycling",
  velovirtuel: "cycling", vtt: "cycling", velogravel: "cycling", sortieavelo: "cycling",
  ebikeride: "e_biking", emountainbikeride: "e_biking", veloelectrique: "e_biking", vttelectrique: "e_biking",
  walk: "walking", marche: "walking", hike: "hiking", randonnee: "hiking",
  swim: "swimming", natation: "swimming",
  rowing: "rowing", aviron: "rowing", virtualrow: "rowing",
  kayaking: "kayaking", kayak: "kayaking", canoeing: "paddling", canoe: "paddling",
  standuppaddling: "stand_up_paddleboarding", standuppaddle: "stand_up_paddleboarding",
  weighttraining: "training", musculation: "training", workout: "training", entrainement: "training",
  crossfit: "training", hiit: "hiit", elliptical: "fitness_equipment", elliptique: "fitness_equipment",
  stairstepper: "fitness_equipment", stepper: "fitness_equipment",
  yoga: "meditation", pilates: "training",
  alpineski: "alpine_skiing", skialpin: "alpine_skiing", backcountryski: "alpine_skiing",
  skiderandonnee: "alpine_skiing", snowboard: "alpine_skiing",
  nordicski: "cross_country_skiing", skidefond: "cross_country_skiing", skinordique: "cross_country_skiing",
  snowshoe: "snowshoeing", raquettes: "snowshoeing", raquettesaneige: "snowshoeing",
  rockclimbing: "rock_climbing", escalade: "rock_climbing",
  inlineskate: "inline_skating", rollers: "inline_skating", roller: "inline_skating",
  kitesurf: "kitesurfing", kitesurfing: "kitesurfing", windsurf: "windsurfing", plancheavoile: "windsurfing",
  surfing: "surfing", surf: "surfing",
};

/** Sport Agon d'un type Strava, `null` s'il est inconnu (jamais d'erreur). */
export function sportFromStravaType(type: string | null): string | null {
  if (!type) return null;
  const key = headerKey(type);
  if (key === "") return null;
  if (STRAVA_TYPES[key]) return STRAVA_TYPES[key];
  const label = sportFromLabel(type);
  // `sportFromLabel` garde les étiquettes inconnues en slug ; ici, un type
  // Strava inconnu reste `null` (décision du brief P42).
  return label && KNOWN_SLUGS.has(label) ? label : null;
}

const KNOWN_SLUGS = new Set(Object.values(STRAVA_TYPES).concat([
  "boxing", "multisport", "generic", "training", "fitness_equipment", "racket",
]));

// ─────────────────────────────── Lecture ─────────────────────────────────────

/** Lit `activities.csv`. Lève `StravaCsvError` si les en-têtes sont inconnus ou le fichier démesuré. */
export function parseStravaCsv(textContent: string, maxRows = MAX_CSV_ROWS): StravaCsvResult {
  const rows = parseCsv(textContent, maxRows);
  if (rows.length === 0) return { activities: [], rejected: [], language: "en" };
  const { columns, language } = mapHeader(rows[0]);
  const get = (row: string[], f: Field): string | undefined => {
    const at = columns[f];
    return at === undefined ? undefined : row[at];
  };

  const activities: StravaCsvActivity[] = [];
  const rejected: StravaCsvResult["rejected"] = [];
  const seen = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = (get(row, "id") ?? "").trim();
    const label = `activities.csv ligne ${r + 1}`;
    if (!/^\d+$/.test(id)) {
      rejected.push({ name: label, reason: "identifiant d'activité Strava absent" });
      continue;
    }
    if (seen.has(id)) continue;
    const startedAt = parseStravaDate(get(row, "date"));
    if (!startedAt) {
      rejected.push({ name: label, reason: "date de l'activité illisible" });
      continue;
    }
    seen.add(id);
    const type = text(get(row, "type"));
    const filename = text(get(row, "filename"));
    activities.push({
      stravaId: id,
      startedAt,
      name: text(get(row, "name")),
      type,
      sport: sportFromStravaType(type),
      description: text(get(row, "description")),
      elapsedS: roundOrNull(positive(get(row, "elapsed"))),
      movingS: roundOrNull(positive(get(row, "moving"))),
      distanceM: positive(get(row, "distance")),
      elevationGainM: nonNegative(get(row, "gain")),
      elevationLossM: nonNegative(get(row, "loss")),
      avgHr: heartRate(get(row, "avgHr")),
      maxHr: heartRate(get(row, "maxHr")),
      maxSpeedMps: positive(get(row, "maxSpeed")),
      avgCadence: positive(get(row, "cadence")),
      avgPowerW: positive(get(row, "power")),
      calories: roundOrNull(positive(get(row, "calories"))),
      rpe: rpe(get(row, "rpe")),
      gear: text(get(row, "gear")),
      filename: filename ? filename.replace(/^\/+/, "") : null,
      commute: bool(get(row, "commute")),
    });
  }
  return { activities, rejected, language };
}

function nonNegative(raw: string | undefined): number | null {
  const n = parseNumber(raw);
  return n !== null && n >= 0 ? n : null;
}

function roundOrNull(n: number | null): number | null {
  return n === null ? null : Math.round(n);
}
