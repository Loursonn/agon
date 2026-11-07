/**
 * `workout_logs.athlete_modifications` — la saisie de l'athlète sur une séance.
 *
 * Pur, sans dépendance (zod n'est pas résolu côté Deno faute d'import map) :
 * importé par le front (`@shared/domain/athleteMods`) et par les Edge Functions.
 *
 * Forme observée en base (2026-11-08, 188 lignes) :
 *   { sessionSets: { <exerciceId>: [ { done, skipped, kg?, reps?, rir? }, … ] },
 *     sessionForme: 1-5, exerciceComments: { <exId>: texte }, sessionComment,
 *     videoSent: { <exId>: bool }, coachOverride: { blocs, note?, fiches?, createdAt } }
 * `bonusSets` / `customExercises` sont lus par l'ancien code mais plus écrits.
 *
 * Le parseur est TOLÉRANT : un champ connu mal formé est écarté (jamais
 * d'exception), les clés inconnues sont conservées telles quelles.
 */

export interface SetEntry {
  done: boolean;
  skipped?: boolean;
  kg?: number | null;
  reps?: number | null;
  rir?: number | null;
  note?: string;
  [extra: string]: unknown;
}

export interface CoachOverrideRaw {
  blocs: unknown[];
  note?: string;
  fiches?: unknown[];
  createdAt?: string;
  [extra: string]: unknown;
}

export interface AthleteMods {
  sessionSets?: Record<string, SetEntry[]>;
  sessionForme?: number;
  exerciceComments?: Record<string, string>;
  sessionComment?: string;
  videoSent?: Record<string, boolean>;
  coachOverride?: CoachOverrideRaw;
  bonusSets?: unknown[];
  customExercises?: unknown[];
  [extra: string]: unknown;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseSet(raw: unknown): SetEntry | null {
  if (!isObj(raw)) return null;
  const out: SetEntry = { ...raw, done: raw.done === true };
  if ("skipped" in raw) out.skipped = raw.skipped === true;
  for (const k of ["kg", "reps", "rir"] as const) {
    if (!(k in raw)) continue;
    const n = num(raw[k]);
    if (n === undefined) delete out[k];
    else out[k] = n;
  }
  if ("note" in raw && typeof raw.note !== "string") delete out.note;
  return out;
}

function stringMap(v: unknown): Record<string, string> | undefined {
  if (!isObj(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([, s]) => typeof s === "string")) as Record<string, string>;
}

function boolMap(v: unknown): Record<string, boolean> | undefined {
  if (!isObj(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([, b]) => typeof b === "boolean")) as Record<string, boolean>;
}

/** `athlete_modifications` brut → objet typé, ou `null` (absent / pas un objet). */
export function parseAthleteMods(raw: unknown): AthleteMods | null {
  if (!isObj(raw)) return null;
  const out: AthleteMods = { ...raw };

  if ("sessionSets" in raw) {
    if (isObj(raw.sessionSets)) {
      const sets: Record<string, SetEntry[]> = {};
      for (const [exId, rows] of Object.entries(raw.sessionSets)) {
        sets[exId] = Array.isArray(rows) ? rows.map(parseSet).filter((s): s is SetEntry => s !== null) : [];
      }
      out.sessionSets = sets;
    } else delete out.sessionSets;
  }
  if ("sessionForme" in raw) {
    const f = num(raw.sessionForme);
    if (f == null) delete out.sessionForme;
    else out.sessionForme = f;
  }
  if ("exerciceComments" in raw) {
    const m = stringMap(raw.exerciceComments);
    if (m) out.exerciceComments = m;
    else delete out.exerciceComments;
  }
  if ("sessionComment" in raw && typeof raw.sessionComment !== "string") delete out.sessionComment;
  if ("videoSent" in raw) {
    const m = boolMap(raw.videoSent);
    if (m) out.videoSent = m;
    else delete out.videoSent;
  }
  if ("coachOverride" in raw) {
    const o = raw.coachOverride;
    if (isObj(o) && Array.isArray(o.blocs)) out.coachOverride = o as CoachOverrideRaw;
    else delete out.coachOverride;
  }
  for (const k of ["bonusSets", "customExercises"] as const) {
    if (k in raw && !Array.isArray(raw[k])) delete out[k];
  }
  return out;
}

/**
 * Une série compte comme SAISIE dès qu'elle porte une charge ou des reps
 * (clé présente et non `null`, 0 compris).
 *
 * C'est mot pour mot la règle SQL `public.workout_log_has_entries`
 * (migration 20260807000000), celle du cron de nuit qui clôture une séance
 * travaillée : l'écran et le serveur doivent dire la même chose. La fonction
 * travaille sur la donnée BRUTE (pas sur le résultat du parseur) pour rester
 * identique au SQL même sur une valeur mal formée.
 */
export function isLoggedSet(item: unknown): boolean {
  if (!isObj(item)) return false;
  return (item.kg !== undefined && item.kg !== null) || (item.reps !== undefined && item.reps !== null);
}

function setRows(mods: unknown): unknown[][] {
  if (!isObj(mods) || !isObj(mods.sessionSets)) return [];
  return Object.values(mods.sessionSets).map((rows) => (Array.isArray(rows) ? rows : []));
}

/** La séance a-t-elle au moins une série saisie ? (= `workout_log_has_entries`) */
export function hasLoggedEntries(mods: unknown): boolean {
  return setRows(mods).some((rows) => rows.some(isLoggedSet));
}

/** Nombre de séries saisies (même règle). */
export function countLoggedSets(mods: unknown): number {
  return setRows(mods).reduce((n, rows) => n + rows.filter(isLoggedSet).length, 0);
}

/** Un exercice précis a-t-il au moins une série saisie ? (même règle) */
export function exerciseHasEntries(mods: unknown, exerciceId: string): boolean {
  if (!isObj(mods) || !isObj(mods.sessionSets)) return false;
  const rows = mods.sessionSets[exerciceId];
  return Array.isArray(rows) && rows.some(isLoggedSet);
}

/** La saisie sans l'adaptation du coach (qu'un athlète ne doit jamais renvoyer). */
export function withoutCoachOverride<T extends Obj>(mods: T): Omit<T, "coachOverride"> {
  const { coachOverride: _drop, ...rest } = mods;
  void _drop;
  return rest;
}

/**
 * Fusion appliquée par les RPC `patch_workout_entries` / `complete_workout` :
 * `serveur || (patch - 'coachOverride')` — fusion des clés de premier niveau,
 * l'adaptation du coach présente en base est toujours conservée. Un patch vide
 * ne transforme pas `null` en `{}` (une séance sans trace reste sans trace).
 */
export function mergeEntries(server: unknown, patch: unknown): Obj | null {
  const base = isObj(server) ? server : null;
  if (!isObj(patch)) return base;
  const p = withoutCoachOverride(patch);
  if (Object.keys(p).length === 0) return base;
  return { ...(base ?? {}), ...p };
}
