import { describe, expect, it } from "vitest";
import { yesterdayWorkoutOf } from "../yesterdayWorkout";
import type { WorkoutLog } from "@/api/workouts";

const log = (p: Partial<WorkoutLog>): WorkoutLog => ({
  id: "w1", athlete_id: "a", coach_id: null, session_id: "s", session_name: "Force · chaîne postérieure",
  scheduled_date: "2026-11-11", status: "completed", started_at: null, completed_at: null, duration_s: null,
  notes: null, microcycle_id: null, rpe_score: null, athlete_modifications: null, original_scheduled_date: null,
  rescheduled_by_athlete: false, coach_alert: false, week_number: null, run_distance_km: null, ...p,
});

describe("yesterdayWorkoutOf", () => {
  it("rien hier → null", () => {
    expect(yesterdayWorkoutOf([])).toBeNull();
  });

  it("résume exercices, séries faites et RPE", () => {
    const w = yesterdayWorkoutOf([log({
      rpe_score: 8,
      athlete_modifications: { sessionSets: {
        e1: [{ done: true }, { done: true }, { done: false }],
        e2: [{ done: true, skipped: true }],
        e3: [{ done: true }],
      } },
    })]);
    expect(w).toEqual({ id: "w1", name: "Force · chaîne postérieure", detail: "2 exercices · 3 séries · RPE 8" });
  });

  it("préfère la séance terminée à la commencée", () => {
    const w = yesterdayWorkoutOf([
      log({ id: "a", status: "in_progress", athlete_modifications: { sessionSets: { e: [{ done: true }, { done: true }] } } }),
      log({ id: "b", status: "completed", session_name: "  " }),
    ]);
    expect(w).toMatchObject({ id: "b", name: "Séance", detail: null });
  });
});
