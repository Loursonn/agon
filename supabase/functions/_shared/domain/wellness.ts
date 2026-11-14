/**
 * Wellness — UN parseur, UN score, UN jeu de paliers pour l'athlète, le coach,
 * le staff et l'assistant IA.
 *
 * Pur, sans dépendance réseau : importé par le front (`@shared/domain/wellness`)
 * et par les Edge Functions.
 *
 * Stockage actuel (inchangé) : `app_data`, clé `asp:wh` = `{ "YYYYMMDD": entrée }`,
 * plus les historiques archivés dans `asp:blockHistory[].wellnessHistory`.
 * Constat du 2026-11-07 : 293 entrées réelles, toutes en clés compactes ;
 * 12 clés parasites `"1"`..`"4"` à valeur numérique ; 5 entrées d'avril 2026
 * sans `score` et avec des notes hors échelle (6 à 9, ancienne échelle /10).
 *
 * Échelle : chaque item va de 1 à 5, **5 = mieux** (« Récupération » 5 = très
 * reposé, « Fraîcheur musculaire » 5 = aucune douleur…). Une note hors de
 * [1 ; 5] est illisible : elle vaut `null`, elle n'est pas ramenée à 5.
 */
import { type IsoDay, isIsoDay, toCompactDay, toIsoDay } from "./dates.ts";

// ── Items ─────────────────────────────────────────────────────────────────────

export const WELLNESS_ITEMS = ["fatigue", "sommeil", "stress", "energie", "doms"] as const;
export type WellnessItem = (typeof WELLNESS_ITEMS)[number];

/** Intitulés vus par l'athlète à la saisie : on garde les mêmes mots partout. */
export const WELLNESS_ITEM_LABEL: Record<WellnessItem, string> = {
  fatigue: "Récupération",
  sommeil: "Qualité du sommeil",
  stress: "Sérénité / mental",
  energie: "Niveau d'énergie",
  doms: "Fraîcheur musculaire",
};

/** Versions courtes (cartes, colonnes de calendrier). */
export const WELLNESS_ITEM_SHORT: Record<WellnessItem, string> = {
  fatigue: "Récup.",
  sommeil: "Sommeil",
  stress: "Sérénité",
  energie: "Énergie",
  doms: "Fraîcheur",
};

export type WellnessItems = Record<WellnessItem, number | null>;

export interface HourMinute {
  h: number;
  m: number;
}

export interface DomsPoint {
  id: string;
  x: number;
  y: number;
  side: "front" | "back";
  intensity?: number;
}

export type DomsLevel = 1 | 2 | 3;
export type DomsLevels = Record<string, DomsLevel>;

export interface WellnessSleep {
  bedtime: HourMinute | null;
  wake: HourMinute | null;
  /** Durée en heures (saisie), sinon null. */
  hours: number | null;
  interrupted: boolean | null;
  interruptNote: string | null;
}

export interface DomsWorkout {
  id: string;
  name: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `{ id, name }` lisible, sinon null (même règle que la projection SQL). */
export function readDomsWorkout(v: unknown): DomsWorkout | null {
  if (!isObj(v) || typeof v.id !== "string" || !UUID_RE.test(v.id)) return null;
  const name = typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 200) : null;
  return { id: v.id, name };
}

export interface WellnessEntry {
  /** Jour local de la saisie, "YYYY-MM-DD". */
  day: IsoDay;
  items: WellnessItems;
  sleep: WellnessSleep;
  domsZones: string[];
  domsPoints: DomsPoint[];
  /** Carte du corps par zones (planche 12/11) : zone → 1 légère, 2 marquée, 3 intense. */
  domsLevels: DomsLevels;
  /** « Envie de t'entraîner » 1-5 (hors score). */
  envie: number | null;
  /** Douleur autre que les courbatures, 0-10. */
  pain: number | null;
  /** « Malade ou fiévreux·se ? » */
  sick: boolean | null;
  /** Séance de la veille à laquelle les courbatures sont rattachées (nom gardé tel quel). */
  domsWorkout: DomsWorkout | null;
  /** Réponse « Es-tu blessé/malade ? » : le commentaire, sinon null. */
  injuryNote: string | null;
  /** Poids saisi avec le wellness, tel quel (la courbe de poids reste `asp:wlog`). */
  weightKg: number | null;
  /** Vrai si l'entrée ne vient que d'un bloc archivé (`asp:blockHistory`). */
  archived: boolean;
}

/** Historique indexé par jour ISO, jours croissants. */
export type WellnessHistory = Record<IsoDay, WellnessEntry>;

// ── Lecture ───────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Note 1-5 ; hors échelle (ancienne échelle /10, 0, texte) → null. */
export function readItem(v: unknown): number | null {
  const n = num(v);
  return n != null && n >= 1 && n <= 5 ? n : null;
}

/** Les 5 notes d'une saisie, quel que soit son format (ancien ou `WellnessEntry`). */
export function readWellnessItems(raw: unknown): WellnessItems {
  const src = isObj(raw) && isObj(raw.items) ? raw.items : isObj(raw) ? raw : {};
  return {
    fatigue: readItem(src.fatigue),
    sommeil: readItem(src.sommeil),
    stress: readItem(src.stress),
    energie: readItem(src.energie),
    doms: readItem(src.doms),
  };
}

function hm(v: unknown): HourMinute | null {
  if (!isObj(v)) return null;
  const h = num(v.h);
  const m = num(v.m);
  if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function points(v: unknown): DomsPoint[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p) => {
    if (!isObj(p)) return [];
    const x = num(p.x);
    const y = num(p.y);
    if (x == null || y == null || (p.side !== "front" && p.side !== "back")) return [];
    const intensity = num(p.intensity);
    return [{ id: String(p.id ?? `${p.side}-${x}-${y}`), x, y, side: p.side, ...(intensity != null ? { intensity } : {}) }];
  });
}

/** { zone: 1|2|3 } ; toute autre valeur est écartée. */
export function readDomsLevels(v: unknown): DomsLevels {
  if (!isObj(v)) return {};
  const out: DomsLevels = {};
  for (const [k, x] of Object.entries(v)) {
    const n = num(x);
    if (n === 1 || n === 2 || n === 3) out[k] = n;
  }
  return out;
}

/** Douleur 0-10 entière, sinon null. */
export function readPain(v: unknown): number | null {
  const n = num(v);
  return n != null && n >= 0 && n <= 10 && Number.isInteger(n) ? n : null;
}

function isEntry(v: unknown): v is WellnessEntry {
  return isObj(v) && isIsoDay(v.day) && isObj(v.items) && isObj(v.sleep);
}

/**
 * Une saisie, depuis l'ancien format (`WellnessData`) ou une `WellnessEntry`.
 * `key` : clé du dictionnaire ("YYYYMMDD" ou "YYYY-MM-DD"), prioritaire sur le
 * champ `date` de l'entrée. Sans jour lisible, ou si la valeur n'est pas un
 * objet (clés de semaine `"1"`..`"4"` à valeur numérique) → null.
 */
export function parseWellnessEntry(raw: unknown, key?: string | null, archived = false): WellnessEntry | null {
  if (isEntry(raw)) {
    const day = (key != null ? toIsoDay(key) : null) ?? raw.day;
    return {
      ...raw, day, archived: raw.archived || archived,
      domsLevels: readDomsLevels(raw.domsLevels), envie: readItem(raw.envie), pain: readPain(raw.pain),
      sick: typeof raw.sick === "boolean" ? raw.sick : null,
      domsWorkout: readDomsWorkout(raw.domsWorkout),
    };
  }
  if (!isObj(raw)) return null;
  const day = (key != null ? toIsoDay(key) : null) ?? toIsoDay(raw.date);
  if (!day) return null;
  return {
    day,
    items: readWellnessItems(raw),
    sleep: {
      bedtime: hm(raw.coucher),
      wake: hm(raw.reveil),
      hours: (() => {
        const h = num(raw.sleepDur);
        return h != null && h >= 0 && h <= 24 ? h : null;
      })(),
      interrupted: typeof raw.sleepInterrupt === "boolean" ? raw.sleepInterrupt : null,
      interruptNote: text(raw.sleepInterruptNote),
    },
    domsZones: Array.isArray(raw.domsZones) ? raw.domsZones.filter((z): z is string => typeof z === "string") : [],
    domsPoints: points(raw.domsPoints),
    domsLevels: readDomsLevels(raw.domsLevels),
    envie: readItem(isObj(raw.items) ? raw.items.envie : raw.envie),
    pain: readPain(raw.pain),
    sick: typeof raw.sick === "boolean" ? raw.sick : null,
    domsWorkout: readDomsWorkout(raw.domsWorkout),
    injuryNote: text(raw.injComment) ?? text(raw.injuryNote),
    weightKg: (() => {
      const w = num(raw.poids ?? raw.weightKg);
      return w != null && w > 0 ? w : null;
    })(),
    archived,
  };
}

function readDict(dict: unknown, archived: boolean): WellnessHistory {
  const into: WellnessHistory = {};
  const compactWins = new Set<IsoDay>();
  if (!isObj(dict)) return into;
  for (const [k, v] of Object.entries(dict)) {
    const e = parseWellnessEntry(v, k, archived);
    if (!e) continue;
    // Même jour sous les deux formats dans un même dictionnaire : la clé
    // compacte gagne (c'est celle qu'écrivent l'app et `wellness_set_day`).
    const compact = /^\d{8}$/.test(k.trim());
    if (compactWins.has(e.day) && !compact) continue;
    if (compact) compactWins.add(e.day);
    into[e.day] = e;
  }
  return into;
}

/**
 * Historique complet : `asp:wh` (prioritaire) + historiques archivés
 * (`asp:blockHistory[].wellnessHistory`, du plus ancien au plus récent : un
 * bloc plus récent l'emporte). Clés non datées écartées. Jours croissants.
 */
export function parseWellnessHistory(wh: unknown, archived: unknown[] = []): WellnessHistory {
  const merged: WellnessHistory = {};
  for (const dict of archived) Object.assign(merged, readDict(dict, true));
  Object.assign(merged, readDict(wh, false));
  const out: WellnessHistory = {};
  for (const d of Object.keys(merged).sort()) out[d] = merged[d];
  return out;
}

/** Les `wellnessHistory` d'un `asp:blockHistory` brut (tableau de blocs archivés). */
export function archivedWellnessOf(blockHistory: unknown): unknown[] {
  if (!Array.isArray(blockHistory)) return [];
  return blockHistory.map((b) => (isObj(b) ? b.wellnessHistory : null)).filter(isObj);
}

// ── Table `wellness_entries` ──────────────────────────────────────────────────

/** Ligne de `wellness_entries` (numeric → nombre ou texte, time → "HH:MM:SS"). */
export interface WellnessRow {
  athlete_id: string;
  day: string;
  fatigue: number | string | null;
  sommeil: number | string | null;
  stress: number | string | null;
  energie: number | string | null;
  doms: number | string | null;
  bedtime: string | null;
  wake: string | null;
  sleep_hours: number | string | null;
  sleep_interrupted: boolean | null;
  sleep_interrupt_note: string | null;
  doms_zones: string[] | null;
  doms_points: unknown;
  injury_note: string | null;
  weight_kg: number | string | null;
  archived: boolean;
  envie?: number | string | null;
  pain?: number | string | null;
  sick?: boolean | null;
  doms_levels?: unknown;
  doms_workout_id?: string | null;
  doms_workout_name?: string | null;
}

/** Colonnes à lire dans `wellness_entries` pour `wellnessRowToEntry`. */
export const WELLNESS_ROW_COLUMNS =
  "athlete_id, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours, sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived, envie, pain, sick, doms_levels, doms_workout_id, doms_workout_name";

function toHm(v: unknown): HourMinute | null {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})/.exec(v) : null;
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

/** Une ligne de la table → `WellnessEntry` (même forme que `parseWellnessEntry`). */
export function wellnessRowToEntry(row: WellnessRow): WellnessEntry | null {
  const day = typeof row.day === "string" ? row.day.slice(0, 10) : "";
  if (!isIsoDay(day)) return null;
  const hours = num(row.sleep_hours);
  const kg = num(row.weight_kg);
  return {
    day,
    items: {
      fatigue: readItem(row.fatigue),
      sommeil: readItem(row.sommeil),
      stress: readItem(row.stress),
      energie: readItem(row.energie),
      doms: readItem(row.doms),
    },
    sleep: {
      bedtime: toHm(row.bedtime),
      wake: toHm(row.wake),
      hours: hours != null && hours >= 0 && hours <= 24 ? hours : null,
      interrupted: typeof row.sleep_interrupted === "boolean" ? row.sleep_interrupted : null,
      interruptNote: row.sleep_interrupt_note?.trim() || null,
    },
    domsZones: Array.isArray(row.doms_zones) ? row.doms_zones.filter((z): z is string => typeof z === "string") : [],
    domsPoints: points(row.doms_points),
    domsLevels: readDomsLevels(row.doms_levels),
    envie: readItem(row.envie),
    pain: readPain(row.pain),
    sick: typeof row.sick === "boolean" ? row.sick : null,
    domsWorkout: readDomsWorkout({ id: row.doms_workout_id, name: row.doms_workout_name }),
    injuryNote: row.injury_note?.trim() || null,
    weightKg: kg != null && kg > 0 ? kg : null,
    archived: row.archived === true,
  };
}

/** Lignes de la table → historique indexé par jour ISO, jours croissants. */
export function wellnessRowsToHistory(rows: readonly WellnessRow[]): WellnessHistory {
  const out: WellnessHistory = {};
  const entries = rows.map(wellnessRowToEntry).filter((x): x is WellnessEntry => x !== null);
  for (const e of entries.sort((a, b) => a.day.localeCompare(b.day))) out[e.day] = e;
  return out;
}

/** Entrées triées par jour croissant, éventuellement bornées (bornes incluses). */
export function wellnessEntries(h: WellnessHistory, from?: IsoDay | null, to?: IsoDay | null): WellnessEntry[] {
  return Object.keys(h)
    .sort()
    .filter((d) => (!from || d >= from) && (!to || d <= to))
    .map((d) => h[d]);
}

// ── Écriture (ancien format) ──────────────────────────────────────────────────

/**
 * Entrée au format historique de `asp:wh` (`WellnessData`), pour l'écrire
 * tant que le stockage reste `app_data`. Le `score` écrit est celui de
 * `wellnessScore` ; `date` est la clé compacte du jour.
 */
export function toLegacyEntry(e: WellnessEntry): Record<string, unknown> {
  const out: Record<string, unknown> = { date: toCompactDay(e.day) };
  for (const k of WELLNESS_ITEMS) if (e.items[k] != null) out[k] = e.items[k];
  const score = wellnessScore(e);
  if (score != null) out.score = score;
  out.domsZones = e.domsZones;
  out.domsPoints = e.domsPoints;
  if (Object.keys(e.domsLevels ?? {}).length > 0) out.domsLevels = e.domsLevels;
  if (e.envie != null) out.envie = e.envie;
  if (e.pain != null) out.pain = e.pain;
  if (e.sick != null) out.sick = e.sick;
  if (e.domsWorkout) out.domsWorkout = e.domsWorkout;
  if (e.sleep.bedtime) out.coucher = e.sleep.bedtime;
  if (e.sleep.wake) out.reveil = e.sleep.wake;
  if (e.sleep.hours != null) out.sleepDur = e.sleep.hours;
  out.sleepInterrupt = e.sleep.interrupted;
  out.sleepInterruptNote = e.sleep.interruptNote;
  out.injComment = e.injuryNote;
  out.poids = e.weightKg;
  return out;
}

// ── Score et paliers ──────────────────────────────────────────────────────────

/**
 * LE score wellness, 0-100 : somme des 5 notes / 25 × 100, arrondi.
 * Toujours recalculé depuis les notes (le `score` stocké n'est pas lu).
 * Une note manquante ou hors échelle → null (« — » à l'écran, jamais 0).
 */
export function wellnessScore(entry: { items: WellnessItems } | null | undefined): number | null {
  if (!entry) return null;
  let sum = 0;
  for (const k of WELLNESS_ITEMS) {
    const v = entry.items[k];
    if (v == null) return null;
    sum += v;
  }
  return Math.round((sum / 25) * 100);
}

/** Score d'une saisie brute (ancien format ou `WellnessEntry`). */
export function scoreOfRaw(raw: unknown): number | null {
  if (raw == null) return null;
  return wellnessScore({ items: readWellnessItems(raw) });
}

export type WellnessBandKey = "optimal" | "bon" | "modere" | "fatigue" | "surmenage";
/** Couleur qui découle du palier : vert (Optimal, Bon), orange (Modéré), rouge (Fatigué, Surmenage). */
export type WellnessTone = "good" | "warn" | "bad";

export interface WellnessBand {
  key: WellnessBandKey;
  label: string;
  /** Conseil de séance montré à l'athlète. */
  advice: string;
  tone: WellnessTone;
  /** Score minimal du palier. */
  min: number;
}

/** Les 5 paliers (décision d'Hugo du 2026-11-07), du meilleur au pire. */
export const WELLNESS_BANDS: readonly WellnessBand[] = [
  { key: "optimal", label: "Optimal", advice: "Séance à pleine charge", tone: "good", min: 80 },
  { key: "bon", label: "Bon", advice: "Adapter si besoin", tone: "good", min: 65 },
  { key: "modere", label: "Modéré", advice: "Réduire le volume de 10-15 %", tone: "warn", min: 50 },
  { key: "fatigue", label: "Fatigué", advice: "Séance légère recommandée", tone: "bad", min: 35 },
  { key: "surmenage", label: "Surmenage", advice: "Repos ou récupération active", tone: "bad", min: 0 },
];

export function wellnessBand(score: number | null | undefined): WellnessBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  return WELLNESS_BANDS.find((b) => score >= b.min) ?? WELLNESS_BANDS[WELLNESS_BANDS.length - 1];
}

/** Moyenne arrondie des scores présents ; aucun score → null (jamais 0). */
export function averageScore(scores: Iterable<number | null | undefined>): number | null {
  let sum = 0;
  let n = 0;
  for (const s of scores) {
    if (s == null || !Number.isFinite(s)) continue;
    sum += s;
    n++;
  }
  return n > 0 ? Math.round(sum / n) : null;
}

/** Moyenne d'un item (1 décimale) sur des entrées ; aucune note → null. */
export function averageItem(entries: Iterable<{ items: WellnessItems }>, item: WellnessItem): number | null {
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    const v = e.items[item];
    if (v == null) continue;
    sum += v;
    n++;
  }
  return n > 0 ? Math.round((sum / n) * 10) / 10 : null;
}
