import type { QueryClient } from "@tanstack/react-query";
import { byIsoDay, isIsoDay, type IsoDay } from "@shared/domain/dates";
import {
  cleanDailyLog, nutritionDays,
  type NutritionDailyLog, type NutritionDay, type NutritionStrategy,
} from "@shared/domain/nutrition";
import { ApiError, check, db, unwrap } from "./client";

/**
 * Nutrition : stratégie du coach + journal de l'athlète.
 *
 * Stockage inchangé (`app_data`, docs/COUCHE_API.md §5) :
 * - `asp:nutrition_strategy` : écrite par le coach (RLS `app_data` : coach de
 *   l'athlète ou l'athlète lui-même — le coach-athlète sur son propre profil) ;
 * - `asp:nutrition_log` : écrit UNIQUEMENT par `saveDay`, via la RPC atomique
 *   `nutrition_save_day` (un jour à la fois : deux appareils ne s'écrasent plus).
 *
 * Les jours sont des jours LOCAUX "YYYY-MM-DD" (`localIsoDay`), jamais
 * `toISOString` qui datait la saisie de la veille entre minuit et 2 h.
 */

export type { NutritionDailyLog, NutritionDay, NutritionStrategy };

const STRATEGY_KEY = "asp:nutrition_strategy";
const LOG_KEY = "asp:nutrition_log";

export const nutritionKeys = {
  all: (athleteId: string) => ["nutrition", athleteId] as const,
  strategy: (athleteId: string) => ["nutrition", athleteId, "strategy"] as const,
  log: (athleteId: string) => ["nutrition", athleteId, "log"] as const,
  days: (athleteId: string, from: IsoDay, to: IsoDay) => ["nutrition", athleteId, "days", from, to] as const,
};

async function readValue(athleteId: string, key: string, what: string): Promise<unknown> {
  const row = unwrap(
    await db().from("app_data").select("value").eq("athlete_id", athleteId).eq("key", key).maybeSingle(),
    what,
  );
  return row?.value ?? null;
}

/** Stratégie du coach ; null si aucune n'a été définie. Lève si la lecture échoue. */
export async function getStrategy(athleteId: string): Promise<NutritionStrategy | null> {
  const v = await readValue(athleteId, STRATEGY_KEY, "Lecture de la stratégie nutrition impossible");
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as unknown as NutritionStrategy) : null;
}

/** Remplace la stratégie (coach). Un seul auteur, un seul objet : pas de RPC. */
export async function saveStrategy(athleteId: string, strategy: NutritionStrategy): Promise<void> {
  check(
    await db().from("app_data").upsert(
      { athlete_id: athleteId, key: STRATEGY_KEY, value: strategy as never, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id,key" },
    ),
    "Enregistrement du plan nutritionnel impossible",
  );
}

/**
 * Journal complet, par jour ISO. Lève si la lecture échoue (ne renvoie jamais
 * `{}` à la place d'une erreur) ; `{}` seulement si l'athlète n'a rien saisi.
 */
export async function getLog(athleteId: string): Promise<Record<IsoDay, NutritionDailyLog>> {
  const v = await readValue(athleteId, LOG_KEY, "Lecture du journal nutrition impossible");
  if (v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ApiError("Journal nutrition illisible", { message: "valeur inattendue" });
  }
  return byIsoDay(v as Record<string, NutritionDailyLog>);
}

/** Journées saisies entre `from` et `to` inclus, triées (Retours, API coach). */
export async function getDays(athleteId: string, from: IsoDay, to: IsoDay): Promise<NutritionDay[]> {
  return nutritionDays(await getLog(athleteId), from, to);
}

type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;

/**
 * Enregistre UNE journée (athlète). Seule écriture du journal : la RPC remplace
 * ce jour-là et seulement lui, dans la même ligne, sans relire le blob.
 */
export async function saveDay(athleteId: string, day: IsoDay, log: NutritionDailyLog): Promise<NutritionDailyLog> {
  if (!isIsoDay(day)) throw new ApiError("Journée nutrition invalide", { message: String(day) });
  // `nutrition_save_day` n'est pas encore dans les types générés (migration 20261108130000).
  const client = db() as unknown as { rpc: UntypedRpc };
  const saved = unwrap(
    await client.rpc("nutrition_save_day", { p_athlete: athleteId, p_day: day, p_log: cleanDailyLog(log) }),
    "Enregistrement de la journée impossible",
  );
  return cleanDailyLog((saved ?? log) as NutritionDailyLog);
}

/** Tout ce qui dépend de la nutrition d'un athlète : stratégie, journal, Retours. */
export function invalidateNutrition(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: nutritionKeys.all(athleteId) }),
    qc.invalidateQueries({ queryKey: ["weeklyRetours", athleteId] }),
    qc.invalidateQueries({ queryKey: ["monthlyRetours", athleteId] }),
  ]).then(() => undefined);
}
