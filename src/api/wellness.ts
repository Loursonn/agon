import type { QueryClient } from "@tanstack/react-query";
import { type IsoDay, isIsoDay, localIsoDay, toCompactDay } from "@shared/domain/dates";
import {
  archivedWellnessOf,
  parseWellnessEntry,
  parseWellnessHistory,
  toLegacyEntry,
  WELLNESS_ROW_COLUMNS,
  wellnessRowsToHistory,
  wellnessRowToEntry,
  type WellnessEntry,
  type WellnessHistory,
  type WellnessRow,
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
const COLUMNS = WELLNESS_ROW_COLUMNS;

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

const entries = () => db().from(TABLE).select(COLUMNS);

/** Table absente (migration pas encore appliquée) : PostgREST PGRST205, Postgres 42P01. */
export function tableMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.code === "PGRST205" || e.code === "42P01");
}

export { wellnessRowToEntry, type WellnessRow };
const rowsToHistory = wellnessRowsToHistory;

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

// Adaptateurs vers l'état historique de l'app (`useAthletePersistedState` :
// `wellnessHistory` = ancien `asp:wh`, `wellness` = ancien `asp:wellness`).

/** `{ "YYYYMMDD": WellnessData }` : l'ancienne forme d'`asp:wh` (clés compactes, `date` compacte). */
export function toLegacyWellnessHistory(h: WellnessHistory): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const e of Object.values(h)) out[toCompactDay(e.day)] = toLegacyEntry(e);
  return out;
}

/** Saisie du jour au format de l'ancien `asp:wellness` ; null si rien aujourd'hui. */
export function toLegacyToday(h: WellnessHistory, day: IsoDay = localIsoDay()): Record<string, unknown> | null {
  const e = h[day];
  return e ? toLegacyEntry(e) : null;
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
