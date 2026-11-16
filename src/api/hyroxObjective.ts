import type { QueryClient } from "@tanstack/react-query";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * Objectifs de saison HYROX (`hyrox_season_goals`, docs/HYROX_OBJECTIF_CONCEPTION.md §6-7) :
 * un run moyen visé par athlète, saison (« 2026-27 ») et division. Fixé par le
 * coach (décision d'Hugo du 16/11/2026), lu par l'athlète dans Ma saison ; il
 * pré-remplit l'objectif des prochaines courses de la saison. Une course déjà
 * faite sans plan reste jugée sur son run du jour.
 *
 * Les plans de course restent dans `api/hyrox.ts` (`hyroxKeys.plans`).
 * Après toute écriture : `invalidateHyroxObjective(qc, athleteId)`.
 */

export interface HyroxSeasonGoal {
  id: string;
  athlete_id: string;
  /** « 2026-27 » (`seasonOf` de `lib/hyrox/season.ts`). */
  season: string;
  /** Catégorie de course (`men`, `women_pro`, `doubles_mixed`…). */
  division: string;
  /** Run moyen visé (s/km, hors Roxzone). */
  run_avg_s: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HyroxSeasonGoalInput = Pick<HyroxSeasonGoal, "athlete_id" | "season" | "division" | "run_avg_s" | "note">;

export const hyroxObjectiveKeys = {
  athlete: (athleteId: string) => ["hyroxObjective", athleteId] as const,
  seasonGoals: (athleteId: string) => ["hyroxObjective", athleteId, "season-goals"] as const,
};

export function invalidateHyroxObjective(qc: QueryClient, athleteId: string): Promise<unknown> {
  return qc.invalidateQueries({ queryKey: hyroxObjectiveKeys.athlete(athleteId) });
}

/** Objectifs de saison d'un athlète, saison la plus récente d'abord. */
export async function listSeasonGoals(athleteId: string): Promise<HyroxSeasonGoal[]> {
  const rows = unwrapRows(
    await db().from("hyrox_season_goals").select("*").eq("athlete_id", athleteId).order("season", { ascending: false }),
    "Objectifs de saison non chargés",
  );
  return rows as unknown as HyroxSeasonGoal[];
}

/** Crée ou remplace l'objectif d'une saison et d'une division (une ligne par couple). */
export async function saveSeasonGoal(goal: HyroxSeasonGoalInput, createdBy: string | null): Promise<HyroxSeasonGoal> {
  const run = Math.round(goal.run_avg_s);
  if (!(run >= 150 && run <= 900)) throw new Error("Objectif de saison non enregistré : run moyen hors bornes");
  const row = unwrap(
    await db().from("hyrox_season_goals")
      .upsert({ ...goal, run_avg_s: run, created_by: createdBy } as never, { onConflict: "athlete_id,season,division" })
      .select("*").single(),
    "Objectif de saison non enregistré",
  );
  if (!row) throw new Error("Objectif de saison non enregistré");
  return row as unknown as HyroxSeasonGoal;
}

export async function deleteSeasonGoal(id: string): Promise<void> {
  check(await db().from("hyrox_season_goals").delete().eq("id", id), "Objectif de saison non supprimé");
}
