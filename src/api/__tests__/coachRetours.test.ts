import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  coachRetourKeys, deleteExerciseComment, getWeeklyRetour, invalidateCoachRetours, listAthleteRetours, reactToRetour,
  upsertExerciseComment, upsertWeeklyRetour,
} from "@/api/coachRetours";

function setup(tables: Record<string, Row[]> = {}, opts: { failOn?: { table: string; op: string }; rpcs?: Record<string, FakeRpc> } = {}) {
  const fake = fakeDb(tables, opts.failOn, opts.rpcs);
  setDbForTests(fake.db);
  return fake.tables;
}

describe("api/coachRetours", () => {
  afterEach(() => setDbForTests(null));

  it("retour de la semaine : null si absent ; liste sans retours vides, plus récent d'abord", async () => {
    setup({ weekly_retours: [
      { id: "r1", athlete_id: "a", week_start: "2026-10-26", comment: "Bien" },
      { id: "r2", athlete_id: "a", week_start: "2026-11-02", comment: "" },
      { id: "r3", athlete_id: "a", week_start: "2026-11-02", comment: "Top" },
      { id: "r4", athlete_id: "b", week_start: "2026-11-02", comment: "Autre" },
    ] });
    expect(await getWeeklyRetour("a", "2026-01-05")).toBeNull();
    expect((await listAthleteRetours("a")).map((r) => r.id)).toEqual(["r3", "r1"]);
  });

  it("modifier un retour remet la réaction de l'athlète à zéro (il doit le revoir)", async () => {
    const tables = setup({ weekly_retours: [
      { id: "r1", athlete_id: "a", coach_id: "c", week_start: "2026-11-02", comment: "v1", athlete_reaction: "fire", reacted_at: "x" },
    ] });
    const r = await upsertWeeklyRetour({ athleteId: "a", coachId: "c", weekStart: "2026-11-02", comment: "v2" });
    expect(tables.weekly_retours).toHaveLength(1);
    expect(r).toMatchObject({ id: "r1", comment: "v2", athlete_reaction: null, reacted_at: null });
  });

  it("réaction par RPC ; refus → lève", async () => {
    const calls: unknown[] = [];
    setup({}, { rpcs: { react_weekly_retour: (a) => (calls.push(a), null) } });
    await reactToRetour("r1", "heart");
    expect(calls).toEqual([{ p_retour_id: "r1", p_reaction: "heart" }]);
    setup({}, { failOn: { table: "react_weekly_retour", op: "rpc" } });
    await expect(reactToRetour("r1", "heart")).rejects.toThrow(/Réaction non enregistrée/);
  });

  it("commentaires d'exercice : création, suppression, lecture qui échoue → lève", async () => {
    const tables = setup({ workout_exercise_comments: [] });
    const c = await upsertExerciseComment({ workoutLogId: "w", exerciseId: null, exerciseName: "Squat", comment: "Genoux" });
    expect(tables.workout_exercise_comments).toHaveLength(1);
    await deleteExerciseComment(c.id);
    expect(tables.workout_exercise_comments).toHaveLength(0);

    setup({}, { failOn: { table: "weekly_retours", op: "select" } });
    await expect(listAthleteRetours("a")).rejects.toThrow(/Lecture des retours impossible/);
  });

  it("invalidateCoachRetours : semaine, liste, vue staff et page Retours de l'athlète", async () => {
    const qc = new QueryClient();
    const keys = [
      coachRetourKeys.week("a", "2026-11-02"), coachRetourKeys.list("a"), ["staff", "retours", "a"],
      ["weeklyRetours", "a", "2026-11-02"], coachRetourKeys.list("b"),
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateCoachRetours(qc, "a");
    expect(keys.map((k) => qc.getQueryState(k)?.isInvalidated)).toEqual([true, true, true, true, false]);
  });
});
