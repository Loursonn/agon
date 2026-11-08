import type { QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import type { IsoDay } from "@shared/domain/dates";
import {
  normalizeDayThemeLabel,
  safeThemeColor,
  isDayThemeDominante,
  isDayThemeIntensity,
  type DayThemeDominante,
  type DayThemeIntensity,
} from "@/lib/dayTheme";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * « Thème du jour » (`day_themes`) : le coach écrit, l'athlète lit (la RLS le
 * garantit). Une ligne par athlète et par jour.
 *
 * Après toute écriture : `invalidateDayThemes(qc, athleteId)` — la pastille du
 * calendrier, le bandeau du jour et le tiroir lisent la même ligne.
 */

export interface DayTheme {
  id: string;
  athlete_id: string;
  coach_id: string;
  /** Jour "YYYY-MM-DD". */
  date: IsoDay;
  label: string;
  intensity: DayThemeIntensity | null;
  dominante: DayThemeDominante | null;
  color: string;
  note: string;
  /**
   * Nature du thème, calculée par Postgres (colonne générée) : jamais écrite
   * par le client, sinon l'insert échoue.
   */
  kind: "intensite" | "dominante" | "libre" | null;
  created_at: string;
  updated_at: string;
}

/** Préfixe `['day-themes', athleteId, …]` ; `recent` est propre au coach. */
export const dayThemeKeys = {
  athlete: (aid: string) => QK.dayThemes(aid),
  range: (aid: string, from: string, to: string) => QK.dayThemesRange(aid, from, to),
  day: (aid: string, date: string) => QK.dayTheme(aid, date),
  recent: (coachId: string) => QK.dayThemesRecent(coachId),
  recentAll: ["day-themes", "recent"] as const,
};

// ── Lectures ──────────────────────────────────────────────────────────────────

export async function listDayThemes(athleteId: string, from: IsoDay, to: IsoDay): Promise<DayTheme[]> {
  return unwrapRows<DayTheme>(
    (await db().from("day_themes").select("*")
      .eq("athlete_id", athleteId).gte("date", from).lte("date", to).order("date")) as never,
    "Lecture des thèmes du jour impossible",
  );
}

/** Thème d'un jour, ou `null` si le coach n'a rien posé. */
export async function getDayTheme(athleteId: string, date: IsoDay): Promise<DayTheme | null> {
  return unwrap<DayTheme>(
    (await db().from("day_themes").select("*").eq("athlete_id", athleteId).eq("date", date).maybeSingle()) as never,
    "Lecture du thème du jour impossible",
  );
}

/** Derniers thèmes posés par un coach, tous athlètes confondus (raccourcis). */
export async function listRecentDayThemes(coachId: string, limit = 60): Promise<DayTheme[]> {
  return unwrapRows<DayTheme>(
    (await db().from("day_themes").select("*")
      .eq("coach_id", coachId).order("updated_at", { ascending: false }).limit(limit)) as never,
    "Lecture des thèmes récents impossible",
  );
}

// ── Écritures ─────────────────────────────────────────────────────────────────

export interface UpsertDayThemeInput {
  athleteId: string;
  coachId: string;
  date: IsoDay;
  label?: string;
  intensity?: string | null;
  dominante?: string | null;
  color?: string | null;
  note?: string;
}

/**
 * Écrit (ou réécrit) le thème d'un jour. Les valeurs passent par les
 * normaliseurs de `dayTheme.ts` : un code d'intensité inconnu devient `null`
 * plutôt que de faire échouer l'écriture (les CHECK en base sont une ceinture).
 */
export async function upsertDayTheme(input: UpsertDayThemeInput): Promise<DayTheme> {
  const row = {
    athlete_id: input.athleteId,
    coach_id: input.coachId,
    date: input.date,
    label: normalizeDayThemeLabel(input.label),
    intensity: isDayThemeIntensity(input.intensity) ? input.intensity : null,
    dominante: isDayThemeDominante(input.dominante) ? input.dominante : null,
    color: safeThemeColor(input.color),
    note: (input.note ?? "").trim().slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  const saved = unwrap<DayTheme>(
    (await db().from("day_themes").upsert(row as never, { onConflict: "athlete_id,date" }).select().single()) as never,
    "Thème du jour non enregistré",
  );
  return saved!;
}

/** Retire le thème d'un jour. */
export async function deleteDayTheme(athleteId: string, date: IsoDay): Promise<void> {
  check(
    await db().from("day_themes").delete().eq("athlete_id", athleteId).eq("date", date),
    "Suppression du thème du jour impossible",
  );
}

// ── Invalidation ──────────────────────────────────────────────────────────────

/** Tous les thèmes de l'athlète + les raccourcis « récents » des coachs. */
export function invalidateDayThemes(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: dayThemeKeys.athlete(athleteId) }),
    qc.invalidateQueries({ queryKey: dayThemeKeys.recentAll }),
  ]).then(() => undefined);
}
