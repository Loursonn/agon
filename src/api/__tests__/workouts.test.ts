import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { mergeEntries } from "@shared/domain/athleteMods";
import { setDbForTests } from "@/api/client";
import {
  deletePlannedWorkouts, listWorkoutLogs, listUnfinishedWorkouts, getPreviousLoggedWorkout,
  listAthleteChoices, countAthleteChoices, completeWorkout, patchWorkoutEntries, setWorkoutRpe,
  setCoachOverride, reopenWorkout, removeWorkout, skipWorkout, rescheduleWorkoutByAthlete,
  invalidateWorkouts, workoutKeys, getWorkoutStats, isWorkoutNotFound, getWorkoutLog,
} from "@/api/workouts";

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

afterEach(() => setDbForTests(null));

describe("deletePlannedWorkouts", () => {
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

describe("lectures", () => {
  it("listWorkoutLogs : filtres, tri, saisie parsée, numeric converti", async () => {
    const { db } = fakeDb({
      workout_logs: [
        log("1", { scheduled_date: "2026-11-01", status: "completed", run_distance_km: "5.20", athlete_modifications: { sessionForme: "x", sessionSets: { e: [{ kg: 50, done: true }] } } }),
        log("2", { scheduled_date: "2026-11-03", status: "missed" }),
        log("3", { scheduled_date: "2026-11-05", status: "completed" }),
        log("4", { scheduled_date: "2026-11-05", athlete_id: "b", status: "completed" }),
      ],
    });
    setDbForTests(db);
    const rows = await listWorkoutLogs({ athleteIds: ["a"], from: "2026-11-01", to: "2026-11-04", statuses: ["completed", "missed"], ascending: false });
    expect(rows.map((r) => r.id)).toEqual(["2", "1"]);
    expect(rows[1].run_distance_km).toBe(5.2);
    expect(rows[1].athlete_modifications).toEqual({ sessionSets: { e: [{ kg: 50, done: true }] } });
    expect((await listWorkoutLogs({ athleteIds: ["a", "b"], statuses: ["completed"] })).map((r) => r.id)).toEqual(["1", "3", "4"]);
    expect(await listWorkoutLogs({ athleteIds: [] })).toEqual([]);
  });

  it("une lecture qui échoue lève (jamais de liste vide silencieuse)", async () => {
    const { db } = fakeDb({ workout_logs: [] }, { table: "workout_logs", op: "select" });
    setDbForTests(db);
    await expect(listWorkoutLogs({ athleteIds: ["a"] })).rejects.toThrow(/Lecture des séances impossible/);
    await expect(getWorkoutLog("x")).rejects.toThrow(/Lecture de la séance impossible/);
  });

  it("séances non finies : seulement passées, prévues et saisies (règle du cron)", async () => {
    const { db } = fakeDb({
      workout_logs: [
        log("saisie", { scheduled_date: "2026-11-01", athlete_modifications: { sessionSets: { e: [{ reps: 0 }, { done: true }] } } }),
        log("vide", { scheduled_date: "2026-11-01", athlete_modifications: { sessionSets: { e: [{ done: true }] } } }),
        log("aujourdhui", { scheduled_date: "2026-11-08", athlete_modifications: { sessionSets: { e: [{ kg: 1 }] } } }),
        log("validee", { scheduled_date: "2026-11-01", status: "completed", athlete_modifications: { sessionSets: { e: [{ kg: 1 }] } } }),
      ],
    });
    setDbForTests(db);
    expect(await listUnfinishedWorkouts(["a"], "2026-11-08")).toEqual([
      { id: "saisie", athleteId: "a", sessionName: "", scheduledDate: "2026-11-01", loggedSets: 1 },
    ]);
  });

  it("séance précédente : la plus récente avec une vraie saisie, hors annulées et hors séance en cours", async () => {
    const { db } = fakeDb({
      workout_logs: [
        log("ancienne", { session_id: "s", scheduled_date: "2026-10-01", athlete_modifications: { sessionSets: { e: [{ kg: 60, reps: 5 }] } } }),
        log("vide", { session_id: "s", scheduled_date: "2026-10-08", athlete_modifications: { sessionSets: { e: [{ done: true }] } } }),
        log("annulee", { session_id: "s", scheduled_date: "2026-10-09", status: "skipped", athlete_modifications: { sessionSets: { e: [{ kg: 1 }] } } }),
        log("courante", { session_id: "s", scheduled_date: "2026-10-15", athlete_modifications: { sessionSets: { e: [{ kg: 70 }] } } }),
        log("future", { session_id: "s", scheduled_date: "2026-12-15", athlete_modifications: { sessionSets: { e: [{ kg: 70 }] } } }),
      ],
    });
    setDbForTests(db);
    const prev = await getPreviousLoggedWorkout({ athleteId: "a", sessionId: "s", excludeId: "courante", onOrBefore: "2026-10-15" });
    expect(prev?.id).toBe("ancienne");
  });

  it("choix de l'athlète : saisie OU déplacement, sans reschedule_reason, triés, comptés", async () => {
    const { db } = fakeDb({
      workout_logs: [
        log("saisie", { scheduled_date: "2026-11-01", athlete_modifications: { sessionComment: "ok" } }),
        log("deplacee", { scheduled_date: "2026-11-03", rescheduled_by_athlete: true, original_scheduled_date: "2026-11-02" }),
        log("deplacee-saisie", { scheduled_date: "2026-11-04", rescheduled_by_athlete: true, athlete_modifications: { sessionForme: 3 } }),
        log("rien", { scheduled_date: "2026-11-05" }),
      ],
    });
    setDbForTests(db);
    const rows = await listAthleteChoices("a");
    expect(rows.map((r) => r.id)).toEqual(["deplacee-saisie", "deplacee", "saisie"]);
    expect(rows[1]).toMatchObject({ originalScheduledDate: "2026-11-02", rescheduledByAthlete: true, rescheduleReason: null });
    expect(rows[0].originalScheduledDate).toBe("2026-11-04");
    expect(await countAthleteChoices("a")).toBe(3);
  });

  it("série et total depuis workout_logs", async () => {
    const { db } = fakeDb({
      workout_logs: [log("1", { scheduled_date: "2026-11-03", status: "completed" }), log("2", { scheduled_date: "2026-11-10", status: "completed" })],
    });
    setDbForTests(db);
    expect(await getWorkoutStats("a", "2026-11-12")).toEqual({ totalDone: 2, streak: 2 });
  });
});

/** RPC simulées : même règle de fusion que le SQL (mergeEntries du domaine). */
function rpcDb(rows: Row[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const find = (args: Record<string, unknown>, tables: Record<string, Row[]>) => {
    const r = tables.workout_logs.find((x) => x.id === args.p_log);
    if (!r) throw new Error("Séance introuvable");
    return r;
  };
  const spy = (fn: string, impl: (a: Record<string, unknown>, t: Record<string, Row[]>) => unknown) =>
    (a: Record<string, unknown>, t: Record<string, Row[]>) => { calls.push({ fn, args: structuredClone(a) }); return impl(a, t); };
  const fake = fakeDb({ workout_logs: rows }, undefined, {
    complete_workout: spy("complete_workout", (a, t) => {
      const r = find(a, t);
      Object.assign(r, {
        status: "completed", completed_at: r.completed_at ?? "now",
        athlete_modifications: mergeEntries(r.athlete_modifications, a.p_mods),
        run_distance_km: a.p_run_km ?? r.run_distance_km ?? null, rpe_score: a.p_rpe ?? r.rpe_score ?? null,
      });
      return r;
    }),
    patch_workout_entries: spy("patch_workout_entries", (a, t) => {
      const r = find(a, t);
      r.athlete_modifications = mergeEntries(r.athlete_modifications, a.p_patch);
      return r;
    }),
    set_workout_rpe: spy("set_workout_rpe", (a, t) => Object.assign(find(a, t), { rpe_score: a.p_rpe })),
    reopen_workout: spy("reopen_workout", (a, t) => Object.assign(find(a, t), { status: "planned", completed_at: null, rpe_score: null })),
    set_coach_override: spy("set_coach_override", (a, t) => {
      const r = find(a, t);
      const mods = { ...((r.athlete_modifications as object) ?? {}) } as Record<string, unknown>;
      if (a.p_override == null) delete mods.coachOverride; else mods.coachOverride = a.p_override;
      r.athlete_modifications = Object.keys(mods).length ? mods : null;
      return r;
    }),
  });
  return { ...fake, calls };
}

describe("écritures atomiques", () => {
  const override = { blocs: ["coach"], createdAt: "2026-11-01" };

  it("saisie : l'adaptation du coach n'est jamais renvoyée ni écrasée (audit P5)", async () => {
    const { db, tables, calls } = rpcDb([log("w", { athlete_modifications: { coachOverride: override } })]);
    setDbForTests(db);
    const out = await patchWorkoutEntries("w", { sessionSets: { e: [{ kg: 80, reps: 5, done: true }] }, coachOverride: { blocs: ["périmé"] } });
    expect(calls[0].args.p_patch).toEqual({ sessionSets: { e: [{ kg: 80, reps: 5, done: true }] } });
    expect(tables.workout_logs[0].athlete_modifications).toEqual({ coachOverride: override, sessionSets: { e: [{ kg: 80, reps: 5, done: true }] } });
    expect(out.athlete_modifications?.coachOverride).toEqual(override);
  });

  it("validation : statut, distance, RPE ; rejouer ne change pas completed_at", async () => {
    const { db, tables } = rpcDb([log("w", { athlete_modifications: { coachOverride: override } })]);
    setDbForTests(db);
    await completeWorkout({ logId: "w", mods: { sessionComment: "bien", coachOverride: null }, runKm: 5.2 });
    tables.workout_logs[0].completed_at = "2026-11-01T10:00:00Z";
    const again = await completeWorkout({ logId: "w", mods: null });
    expect(again).toMatchObject({ status: "completed", completed_at: "2026-11-01T10:00:00Z", run_distance_km: 5.2 });
    expect(again.athlete_modifications).toEqual({ coachOverride: override, sessionComment: "bien" });
  });

  it("RPE : deux notes de suite passent, hors bornes refusé sans appel", async () => {
    const { db, calls } = rpcDb([log("w", {})]);
    setDbForTests(db);
    await setWorkoutRpe("w", 7);
    expect((await setWorkoutRpe("w", 8)).rpe_score).toBe(8);
    await expect(setWorkoutRpe("w", 11)).rejects.toThrow(/RPE/);
    await expect(setWorkoutRpe("w", 6.5)).rejects.toThrow(/RPE/);
    expect(calls).toHaveLength(2);
  });

  it("réouverture et adaptation du coach", async () => {
    const { db, tables } = rpcDb([log("w", { status: "completed", rpe_score: 7, athlete_modifications: { sessionForme: 4 } })]);
    setDbForTests(db);
    expect(await reopenWorkout("w")).toMatchObject({ status: "planned", rpe_score: null });
    await setCoachOverride("w", { blocs: [] });
    expect(tables.workout_logs[0].athlete_modifications).toEqual({ sessionForme: 4, coachOverride: { blocs: [] } });
    await setCoachOverride("w", null);
    expect(tables.workout_logs[0].athlete_modifications).toEqual({ sessionForme: 4 });
  });

  it("séance disparue : erreur reconnaissable (pas de nouvel essai inutile)", async () => {
    setDbForTests({ rpc: async () => ({ data: null, error: { message: "Séance introuvable", code: "P0002" } }) });
    const err = await patchWorkoutEntries("x", { sessionForme: 1 }).catch((e) => e);
    expect(isWorkoutNotFound(err)).toBe(true);
    const { db } = rpcDb([]);
    setDbForTests(db);
    await expect(patchWorkoutEntries("x", { sessionForme: 1 })).rejects.toThrow(/Saisie non enregistrée/);
  });
});

describe("suppression / annulation", () => {
  it("removeWorkout refuse une séance réalisée, sauf demande explicite", async () => {
    const { db, tables } = fakeDb({ workout_logs: [log("faite", { status: "completed" }), log("prevue", {})] });
    setDbForTests(db);
    await expect(removeWorkout("faite")).rejects.toThrow(/réalisée/);
    await removeWorkout("prevue");
    expect(tables.workout_logs.map((r) => r.id)).toEqual(["faite"]);
    await removeWorkout("faite", { allowCompleted: true });
    expect(tables.workout_logs).toHaveLength(0);
    await removeWorkout("absente"); // déjà partie : pas d'erreur
  });

  it("skipWorkout ne transforme jamais une séance réalisée en annulée", async () => {
    const { db, tables } = fakeDb({ workout_logs: [log("faite", { status: "completed" }), log("prevue", {})] });
    setDbForTests(db);
    await expect(skipWorkout("faite")).rejects.toThrow(/réalisée/);
    await skipWorkout("prevue");
    expect(tables.workout_logs.map((r) => r.status)).toEqual(["completed", "skipped"]);
  });

  it("déplacement par l'athlète : date du coach gardée, drapeaux écrits", async () => {
    const { db, tables } = fakeDb({ workout_logs: [log("w", { original_scheduled_date: null, rescheduled_by_athlete: false, coach_alert: false })] });
    setDbForTests(db);
    await rescheduleWorkoutByAthlete({ logId: "w", newDate: "2026-11-12", coachAlert: true });
    expect(tables.workout_logs[0]).toMatchObject({
      scheduled_date: "2026-11-12", original_scheduled_date: "2026-11-10", rescheduled_by_athlete: true, coach_alert: true,
    });
    await rescheduleWorkoutByAthlete({ logId: "w", newDate: "2026-11-13", coachAlert: false });
    expect(tables.workout_logs[0]).toMatchObject({ original_scheduled_date: "2026-11-10", coach_alert: true });
  });
});

describe("invalidateWorkouts", () => {
  const keys: (readonly unknown[])[] = [
    workoutKeys.log("a", "w"), workoutKeys.unfinished(["a", "b"]), workoutKeys.choicesCount("a"),
    ["workout-log-detail", "w"], ["cal", "a", "range", "2026-11-01", "2026-11-30"], ["workout-logs-week", "a", "2026-11-09"],
    ["activePlan", "a", 0], ["weeklyRetours", "a", "2026-11-09"], ["monthlyRetours", "a", "2026-11"],
    ["micro-stats", "a", "x", "y"], ["meso-load", "meso1", "a"], ["timeline-data", "a", "s", "e"], ["micro-days", "a", "s", "e"],
    ["cycle-sessions", "a", "s", "e"], ["runningVolume", "a", "2026-10-01"], ["unfinished-workouts", ["a"]],
    ["coachDashboard", "today", "coach", "2026-11-08"], ["staff", "logs", "a"], ["session-week-logs", "a", "s"],
    ["historique", "a"], ["coach-override-log", "w"],
  ];
  const untouched: (readonly unknown[])[] = [
    ["cal", "b"], ["workouts", "b", "stats"], ["workout-log-detail", "autre"], ["wellness", "a"], ["habits", "a"],
  ];

  it("couvre tous les lecteurs de l'athlète, et seulement eux", async () => {
    const qc = new QueryClient();
    for (const k of [...keys, ...untouched]) qc.setQueryData(k, 1);
    await invalidateWorkouts(qc, { athleteId: "a", logId: "w" });
    for (const k of keys) expect([k, qc.getQueryState(k)?.isInvalidated]).toEqual([k, true]);
    for (const k of untouched) expect([k, qc.getQueryState(k)?.isInvalidated]).toEqual([k, false]);
  });
});
