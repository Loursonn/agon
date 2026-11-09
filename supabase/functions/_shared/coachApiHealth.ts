/**
 * Lecture santé de l'API coach : wellness, pesées, objectif de poids.
 *
 * Lit les tables `wellness_entries`, `body_weight_logs` et `body_weight_goals`
 * (docs/SANTE_TABLES.md), tenues à jour par trigger depuis les anciennes clés
 * `app_data` (`asp:wh`, `asp:blockHistory`, `asp:wlog`, `asp:bw`) : la sortie de
 * `buildSummary` ne change pas. Une lecture en erreur lève (jamais de liste
 * vide à la place).
 *
 * Appelé avec la clé service : le périmètre (athlètes qui ont consenti) est
 * déjà contrôlé par l'appelant.
 */
import { check, type Db, type Row } from "./coachApiDb.ts";
import { WELLNESS_ROW_COLUMNS, wellnessRowsToHistory, type WellnessHistory, type WellnessRow } from "./domain/wellness.ts";

export interface SummaryHealth {
  /** Saisies de la période, archivées comprises (comme `asp:wh` + `asp:blockHistory`). */
  wellness: WellnessHistory;
  /** Pesées de la période, valeurs brutes (bornées par `buildSummary`). */
  weights: Array<{ day: string; kg: unknown }>;
  /** Objectif de poids (ancien `asp:bw.target`) ; null s'il n'y en a pas. */
  targetKg: unknown;
}

/** Plus que les 90 jours de période maximum. */
const LIMIT = 500;

export async function readSummaryHealth(db: Db, athleteId: string, from: string, to: string): Promise<SummaryHealth> {
  const [wellness, weights, goal] = await Promise.all([
    db.from("wellness_entries").select(WELLNESS_ROW_COLUMNS)
      .eq("athlete_id", athleteId).gte("day", from).lte("day", to)
      .order("day").limit(LIMIT),
    db.from("body_weight_logs").select("day, kg")
      .eq("athlete_id", athleteId).gte("day", from).lte("day", to)
      .order("day").limit(LIMIT),
    db.from("body_weight_goals").select("target_kg").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  const wellnessRows = check<WellnessRow[] | null>(wellness, "wellness_entries") ?? [];
  const weightRows = check<Row[] | null>(weights, "body_weight_logs") ?? [];
  const goalRow = check<Row | null>(goal, "body_weight_goals");
  return {
    wellness: wellnessRowsToHistory(wellnessRows),
    weights: weightRows.map((r) => ({ day: String(r.day).slice(0, 10), kg: r.kg })),
    targetKg: goalRow?.target_kg ?? null,
  };
}
