import type { QueryClient } from "@tanstack/react-query";
import { type IsoDay, isIsoDay, localIsoDay } from "@shared/domain/dates";
import {
  archivedWellnessOf,
  parseWellnessEntry,
  parseWellnessHistory,
  readItem,
  toLegacyEntry,
  type DomsPoint,
  type HourMinute,
  type WellnessEntry,
  type WellnessHistory,
} from "@shared/domain/wellness";
import { ApiError, db, unwrap, unwrapRows } from "./client";

/**
 * Wellness. Voir docs/COUCHE_API.md (lot 3) et docs/SANTE_TABLES.md.
 *
 * - Lecture : table `wellness_entries` (une ligne par jour, `archived` = vient
 *   seulement d'un bloc archivé). Elle est tenue à jour côté serveur, par
 *   trigger, depuis `app_data` (`asp:wh`, `asp:blockHistory`) : tant que la
 *   migration 20261110100000 n'est pas appliquée (table absente), on relit
 *   l'ancien stockage, avec le même résultat.
 * - Écriture : RPC `wellness_set_day` / `wellness_delete_day` (un seul jour,
 *   atomique) ; jamais « relire tout le blob, le modifier, le réécrire ».
 * - Score et paliers : `wellnessScore` / `wellnessBand` du domaine, nulle part
 *   ailleurs.
 * - Le poids (pesées, paliers, objectif) : `profile.ts`.
 */

const WH = "asp:wh";
const ARCHIVE = "asp:blockHistory";
const TABLE = "wellness_entries";
const COLUMNS =
  "athlete_id, day, fatigue, sommeil, stress, energie, doms, bedtime, wake, sleep_hours, sleep_interrupted, sleep_interrupt_note, doms_zones, doms_points, injury_note, weight_kg, archived";

export interface WellnessRange {
  from?: IsoDay | null;
  to?: IsoDay | null;
  /** Inclure les blocs archivés (`asp:blockHistory`). Par défaut : oui. */
  includeArchived?: boolean;
}

/** Préfixe commun `['wellness', athleteId, …]` ; `many` pour les vues multi-athlètes. */
export const wellnessKeys = {
  athlete: (aid: string) => ["wellness", aid] as const,
  history: (aid: string, r: WellnessRange = {}) =>
    ["wellness", aid, "history", r.from ?? null, r.to ?? null, r.includeArchived !== false] as const,
  today: (aid: string, day: IsoDay) => ["wellness", aid, "today", day] as const,
  /** Accueil coach, alertes : une requête pour tous les athlètes. */
  many: (aids: readonly string[]) => ["wellness", "_many", [...aids].sort().join(",")] as const,
};

// ── Table `wellness_entries` ──────────────────────────────────────────────────

/** Ligne de `wellness_entries` (numeric → nombre, time → "HH:MM:SS"). */
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
}

const entries = () => db().from(TABLE).select(COLUMNS);

/** Table absente (migration pas encore appliquée) : PostgREST PGRST205, Postgres 42P01. */
export function tableMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.code === "PGRST205" || e.code === "42P01");
}

function toNum(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function toHm(v: unknown): HourMinute | null {
  const m = typeof v === "string" ? /^(\d{1,2}):(\d{2})/.exec(v) : null;
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

function toPoints(v: unknown): DomsPoint[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p) => {
    if (typeof p !== "object" || p === null) return [];
    const o = p as Record<string, unknown>;
    const x = toNum(o.x);
    const y = toNum(o.y);
    if (x == null || y == null || (o.side !== "front" && o.side !== "back")) return [];
    const intensity = toNum(o.intensity);
    return [{ id: String(o.id ?? `${o.side}-${x}-${y}`), x, y, side: o.side, ...(intensity != null ? { intensity } : {}) }];
  });
}

/** Une ligne de la table → `WellnessEntry` (même forme que `parseWellnessEntry`). */
export function wellnessRowToEntry(row: WellnessRow): WellnessEntry | null {
  const day = typeof row.day === "string" ? row.day.slice(0, 10) : "";
  if (!isIsoDay(day)) return null;
  const hours = toNum(row.sleep_hours);
  const kg = toNum(row.weight_kg);
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
    domsPoints: toPoints(row.doms_points),
    injuryNote: row.injury_note?.trim() || null,
    weightKg: kg != null && kg > 0 ? kg : null,
    archived: row.archived === true,
  };
}

function rowsToHistory(rows: WellnessRow[]): WellnessHistory {
  const out: WellnessHistory = {};
  for (const e of rows.map(wellnessRowToEntry).filter((x): x is WellnessEntry => x !== null).sort((a, b) => a.day.localeCompare(b.day))) {
    out[e.day] = e;
  }
  return out;
}

/** PostgREST renvoie au plus 1000 lignes par requête : lecture par pages. */
const PAGE_SIZE = 1000;

async function readEntries(athleteIds: readonly string[], r: WellnessRange, what: string): Promise<WellnessRow[]> {
  const out: WellnessRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = athleteIds.length === 1 ? entries().eq("athlete_id", athleteIds[0]) : entries().in("athlete_id", [...athleteIds]);
    if (r.from) q = q.gte("day", r.from);
    if (r.to) q = q.lte("day", r.to);
    if (r.includeArchived === false) q = q.eq("archived", false);
    // Ordre total (jour puis athlète) : aucune ligne sautée ni doublée entre deux pages.
    const page = unwrapRows<WellnessRow>(
      await q.order("day", { ascending: true }).order("athlete_id", { ascending: true }).range(from, from + PAGE_SIZE - 1),
      what,
    );
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

// ── Ancien stockage (`app_data`), seulement si la table n'existe pas encore ──
// À supprimer à l'étape 4 de docs/SANTE_TABLES.md.

type LegacyRow = { athlete_id: string; key: string; value: unknown };

function keysFor(includeArchived: boolean | undefined): string[] {
  return includeArchived === false ? [WH] : [WH, ARCHIVE];
}

function legacyHistoryOf(rows: LegacyRow[], r: WellnessRange): WellnessHistory {
  const wh = rows.find((x) => x.key === WH)?.value ?? null;
  const archived = r.includeArchived === false ? [] : archivedWellnessOf(rows.find((x) => x.key === ARCHIVE)?.value);
  const full = parseWellnessHistory(wh, archived);
  if (!r.from && !r.to) return full;
  const out: WellnessHistory = {};
  for (const [d, e] of Object.entries(full)) if ((!r.from || d >= r.from) && (!r.to || d <= r.to)) out[d] = e;
  return out;
}

async function legacyHistories(athleteIds: readonly string[], r: WellnessRange, what: string): Promise<Record<string, WellnessHistory>> {
  const rows = unwrapRows<LegacyRow>(
    await db().from("app_data").select("athlete_id, key, value").in("athlete_id", [...athleteIds]).in("key", keysFor(r.includeArchived)),
    what,
  );
  const out: Record<string, WellnessHistory> = {};
  for (const aid of athleteIds) out[aid] = legacyHistoryOf(rows.filter((x) => x.athlete_id === aid), r);
  return out;
}

// ── Lectures ──────────────────────────────────────────────────────────────────

/** Historique d'un athlète (jours ISO croissants). Lève en cas d'erreur. */
export async function getWellnessHistory(athleteId: string, r: WellnessRange = {}): Promise<WellnessHistory> {
  const what = "Lecture du wellness impossible";
  try {
    return rowsToHistory(await readEntries([athleteId], r, what));
  } catch (e) {
    if (!tableMissing(e)) throw e;
    return (await legacyHistories([athleteId], r, what))[athleteId];
  }
}

/**
 * Historiques de plusieurs athlètes en UNE requête (accueil coach, alertes).
 * Chaque athlète demandé a une entrée, vide s'il n'a rien saisi (ou si la RLS
 * ne laisse rien voir).
 */
export async function getWellnessHistories(
  athleteIds: readonly string[],
  r: WellnessRange = {},
): Promise<Record<string, WellnessHistory>> {
  if (athleteIds.length === 0) return {};
  const what = "Lecture du wellness des athlètes impossible";
  let rows: WellnessRow[];
  try {
    rows = await readEntries(athleteIds, r, what);
  } catch (e) {
    if (!tableMissing(e)) throw e;
    return legacyHistories(athleteIds, r, what);
  }
  const out: Record<string, WellnessHistory> = {};
  for (const aid of athleteIds) out[aid] = rowsToHistory(rows.filter((x) => x.athlete_id === aid));
  return out;
}

/** Saisie du jour (jour local par défaut), déduite de l'historique ; null si rien. */
export async function getTodayWellness(athleteId: string, day: IsoDay = localIsoDay()): Promise<WellnessEntry | null> {
  const h = await getWellnessHistory(athleteId, { from: day, to: day });
  return h[day] ?? null;
}

// ── Écritures ─────────────────────────────────────────────────────────────────

/** Les RPC du lot 3 ne sont pas encore dans les types générés. */
type RpcDb = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
const rpc = (fn: string, args: Record<string, unknown>) => (db() as unknown as RpcDb).rpc(fn, args);

/**
 * Enregistre UNE journée (création ou remplacement), sans toucher aux autres :
 * un appareil n'efface plus la saisie d'un autre. Renvoie l'entrée écrite.
 */
export async function saveWellnessEntry(athleteId: string, entry: WellnessEntry): Promise<WellnessEntry> {
  if (!isIsoDay(entry.day)) throw new ApiError("Enregistrement du wellness impossible", { message: `jour invalide (${entry.day})` });
  const data = unwrap(
    await rpc("wellness_set_day", { p_athlete: athleteId, p_day: entry.day, p_entry: toLegacyEntry(entry) }),
    "Enregistrement du wellness impossible",
  );
  return parseWellnessEntry(data, entry.day) ?? { ...entry, archived: false };
}

/**
 * Saisie du formulaire athlète (`WellnessFlow`, ancien format `WellnessData`)
 * pour le jour local : c'est ce que `useAthleteLogic.saveWellness` doit appeler
 * au lieu de réécrire `asp:wh` et `asp:wellness` en entier.
 */
export async function saveWellnessForm(athleteId: string, form: unknown, day: IsoDay = localIsoDay()): Promise<WellnessEntry> {
  const entry = parseWellnessEntry(form, day);
  if (!entry) throw new ApiError("Enregistrement du wellness impossible", { message: "saisie illisible", code: "22023" });
  return saveWellnessEntry(athleteId, { ...entry, archived: false });
}

/** Efface la saisie d'un jour (`asp:wh` seulement, l'archive reste). true si elle existait. */
export async function deleteWellnessEntry(athleteId: string, day: IsoDay): Promise<boolean> {
  if (!isIsoDay(day)) throw new ApiError("Suppression du wellness impossible", { message: `jour invalide (${day})` });
  return unwrap(
    await rpc("wellness_delete_day", { p_athlete: athleteId, p_day: day }),
    "Suppression du wellness impossible",
  ) === true;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/**
 * Tout ce qui dépend du wellness d'un athlète : son historique, l'accueil coach
 * et les alertes (`many`), les retours hebdo / mensuels, les micro-stats du
 * planning, les tendances du profil athlète.
 */
export function invalidateWellness(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: wellnessKeys.athlete(athleteId) }),
    qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === "wellness" && q.queryKey[1] === "_many" && String(q.queryKey[2] ?? "").split(",").includes(athleteId),
    }),
    qc.invalidateQueries({ queryKey: ["weeklyRetours", athleteId] }),
    qc.invalidateQueries({ queryKey: ["monthlyRetours", athleteId] }),
    qc.invalidateQueries({ queryKey: ["micro-stats", athleteId] }),
    qc.invalidateQueries({ queryKey: ["athlete-insights", athleteId] }),
  ]);
}
