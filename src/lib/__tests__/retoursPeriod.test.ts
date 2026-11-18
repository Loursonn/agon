import { describe, expect, it } from "vitest";
import { exerciseTrends, weekStats, weeksBetween } from "@/lib/retoursPeriod";
import type { WorkoutDetail } from "@/features/shared/types/retours.types";

const workout = (p: Partial<WorkoutDetail>): WorkoutDetail => ({
  id: "w", session_name: "Bas", scheduled_date: "2026-11-10", status: "completed", session_type: "muscu",
  duration_s: 3600, notes: null, rpe_score: 7, wellness_day: null,
  planned_exercises: [{ exercise_id: "sq", exercise_name: "Squat", sets: 4, reps_range: "5", kg: 80, rir: 2, method: null }],
  performed_exercises: [{ exercise_id: "sq", exercise_name: "Squat", sets: [
    { set_num: 1, kg: 80, reps: 5, rir: 2, method: null, done: true },
    { set_num: 2, kg: 82.5, reps: 5, rir: 1, method: null, done: true },
  ] }],
  ...p,
} as WorkoutDetail);

describe("retoursPeriod", () => {
  it("liste les lundis des semaines qui touchent la période", () => {
    expect(weeksBetween("2026-11-01", "2026-11-30")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  it("agrège séances, séries, charge, km et bien-être par semaine", () => {
    const [s] = weekStats(["2026-11-09"], {
      workouts: [workout({}), workout({ id: "w2", status: "missed", scheduled_date: "2026-11-13" })],
      energy_sessions: [],
      daily_data: {
        "2026-11-10": { date: "2026-11-10", wellness: { score: 4, sommeil: 4, fatigue: 3, stress: 3, energie: 4, pain: 2 }, workouts_completed: 1, has_competition: false, has_test: false },
        "2026-11-13": { date: "2026-11-13", wellness: { score: 3, sommeil: 2, fatigue: 2, stress: 3, energie: 3, pain: 4 }, workouts_completed: 0, has_competition: false, has_test: false },
      },
    }, () => ({ km: 32.44, watchKm: 24 }));
    expect(s).toMatchObject({ sessionsDone: 1, sessionsTotal: 2, setsDone: 2, setsPlanned: 8, km: 32.4, rpeAvg: 7, load: 420, wellness: 3.5, sommeil: 3, pain: 4 });
  });

  it("suit le 1RM estimé des exercices chargés semaine après semaine", () => {
    const weeks = ["2026-11-02", "2026-11-09"];
    const t = exerciseTrends(weeks, [
      workout({ scheduled_date: "2026-11-04", performed_exercises: [{ exercise_id: "sq", exercise_name: "Squat", sets: [{ set_num: 1, kg: 75, reps: 5, rir: 2, method: null, done: true }] }] }),
      workout({ scheduled_date: "2026-11-10" }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ name: "Squat", first: 87.5, last: 96.3, deltaPct: 10.1 });
    expect(t[0].points[1].best).toBe("5 × 82.5 kg");
  });
});
