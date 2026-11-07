import type { QueryClient } from "@tanstack/react-query";
import { type IsoDay, isIsoDay, localIsoDay } from "@shared/domain/dates";
import {
  archivedWellnessOf,
  parseWellnessEntry,
  parseWellnessHistory,
  toLegacyEntry,
  type WellnessEntry,
  type WellnessHistory,
} from "@shared/domain/wellness";
import { ApiError, db, unwrap, unwrapRows } from "./client";

/**
 * Wellness (stockage actuel : `app_data`, clés `asp:wh` et
 * `asp:blockHistory[].wellnessHistory`). Voir docs/COUCHE_API.md, lot 3.
 *
 * - Lecture : toujours via `parseWellnessHistory` → jours ISO, notes 1-5 ou
 *   null, clés parasites écartées, archive incluse par défaut.
 * - Écriture : RPC `wellness_set_day` / `wellness_delete_day` (un seul jour,
 *   atomique) ; jamais « relire tout le blob, le modifier, le réécrire ».
 * - Score et paliers : `wellnessScore` / `wellnessBand` du domaine, nulle part
 *   ailleurs.
 * - Le poids (`asp:wlog`, `asp:bw`) n'est pas géré ici.
 */

const WH = "asp:wh";
const ARCHIVE = "asp:blockHistory";

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

type Row = { athlete_id: string; key: string; value: unknown };

function keysFor(includeArchived: boolean | undefined): string[] {
  return includeArchived === false ? [WH] : [WH, ARCHIVE];
}

function historyOf(rows: Row[], r: WellnessRange): WellnessHistory {
  const wh = rows.find((x) => x.key === WH)?.value ?? null;
  const archived = r.includeArchived === false ? [] : archivedWellnessOf(rows.find((x) => x.key === ARCHIVE)?.value);
  const full = parseWellnessHistory(wh, archived);
  if (!r.from && !r.to) return full;
  const out: WellnessHistory = {};
  for (const [d, e] of Object.entries(full)) if ((!r.from || d >= r.from) && (!r.to || d <= r.to)) out[d] = e;
  return out;
}

/** Historique d'un athlète (jours ISO croissants). Lève en cas d'erreur. */
export async function getWellnessHistory(athleteId: string, r: WellnessRange = {}): Promise<WellnessHistory> {
  const rows = unwrapRows<Row>(
    await db().from("app_data").select("athlete_id, key, value").eq("athlete_id", athleteId).in("key", keysFor(r.includeArchived)),
    "Lecture du wellness impossible",
  );
  return historyOf(rows, r);
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
  const out: Record<string, WellnessHistory> = {};
  if (athleteIds.length === 0) return out;
  const rows = unwrapRows<Row>(
    await db().from("app_data").select("athlete_id, key, value").in("athlete_id", [...athleteIds]).in("key", keysFor(r.includeArchived)),
    "Lecture du wellness des athlètes impossible",
  );
  for (const aid of athleteIds) out[aid] = historyOf(rows.filter((x) => x.athlete_id === aid), r);
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
  if (!entry) throw new ApiError("Enregistrement du wellness impossible", { message: "saisie illisible" });
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
