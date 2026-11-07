import { describe, it, expect, afterEach } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { deletePlannedWorkouts } from "@/api/workouts";

const log = (id: string, o: Record<string, unknown>) => ({
  id, athlete_id: "a", microcycle_id: "m1", scheduled_date: "2026-11-10",
  status: "planned", athlete_modifications: null, rpe_score: null, ...o,
});

function seed() {
  return fakeDb({
    microcycles: [{ id: "m1" }],
    workout_logs: [
      log("prevue", {}),
      log("manquee", { status: "missed" }),
      log("faite", { status: "completed" }),
      log("commencee", { athlete_modifications: { sessionSets: {} } }),
      log("notee", { status: "skipped", rpe_score: 6 }),
      log("autre-semaine", { microcycle_id: "m2" }),
    ],
  });
}

describe("deletePlannedWorkouts", () => {
  afterEach(() => setDbForTests(null));

  it("par semaine : ne retire que les séances prévues sans trace de l'athlète", async () => {
    const { db, tables } = seed();
    setDbForTests(db);
    await deletePlannedWorkouts({ microcycleIds: ["m1"] });
    expect(tables.workout_logs.map((r) => r.id).sort()).toEqual(["autre-semaine", "commencee", "faite", "notee"]);
  });

  it("par plage de dates : même règle, bornes (after, until]", async () => {
    const { db, tables } = seed();
    tables.workout_logs.push(log("avant", { scheduled_date: "2026-11-01" }), log("borne", { scheduled_date: "2026-11-05" }));
    setDbForTests(db);
    await deletePlannedWorkouts({ athleteId: "a", after: "2026-11-05", until: "2026-11-30" });
    expect(tables.workout_logs.map((r) => r.id).sort()).toEqual(["avant", "borne", "commencee", "faite", "notee"]);
  });

  it("ne fait rien sans semaine", async () => {
    const { db, tables } = seed();
    setDbForTests(db);
    await deletePlannedWorkouts({ microcycleIds: [] });
    expect(tables.workout_logs).toHaveLength(6);
  });

  it("lève une erreur lisible si la base refuse", async () => {
    const { db } = fakeDb({ workout_logs: [] }, { table: "workout_logs", op: "delete" });
    setDbForTests(db);
    await expect(deletePlannedWorkouts({ microcycleIds: ["m1"] })).rejects.toThrow(/Suppression des séances prévues impossible/);
  });
});
