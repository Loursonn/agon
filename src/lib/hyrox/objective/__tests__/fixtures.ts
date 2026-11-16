import type { HyroxResult } from "@/features/shared/types/hyrox";

/** Course Open hommes calée exactement sur l'objectif à 5:00 /km (obj@1). */
export const ON_TARGET = {
  run_1_s: 270, run_2_s: 282, run_3_s: 303, run_4_s: 300, run_5_s: 309, run_6_s: 303, run_7_s: 303, run_8_s: 330,
  ski_s: 270, sled_push_s: 185, sled_pull_s: 285, bbj_s: 320, row_s: 290, farmers_s: 125, lunges_s: 305, wall_balls_s: 405,
  roxzone_total_s: 400,
} as const;

export const race = (o: Partial<HyroxResult> = {}): HyroxResult => {
  const base: HyroxResult = {
    id: "r", athlete_id: "a", competition_id: null, created_by: null, date: "2026-09-16", event_name: "HYROX Paris", venue: null,
    format: "solo", division: "men", age_group: null, is_official: true, status: "finished", total_s: 4985,
    ...ON_TARGET,
    roxzone_splits: null, penalties_s: 0, penalties_note: null,
    rank_overall: null, rank_age_group: null, participants_overall: null, participants_age_group: null,
    activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "", updated_at: "",
  } as HyroxResult;
  const r = { ...base, ...o };
  if (o.total_s == null) {
    // Chrono = somme des segments (les tests modifient des segments sans recalculer à la main).
    const keys = ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8", "ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls", "roxzone_total"];
    r.total_s = keys.reduce((n, k) => n + ((r as unknown as Record<string, number>)[`${k}_s`] ?? 0), 0);
  }
  return r;
};
