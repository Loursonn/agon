import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  applyOptimisticWorkout,
  cachedNextOccurrence,
  draftAlreadyOnServer,
  findCachedWeekLogs,
  findCachedWorkoutLogId,
  seedPlannedWorkout,
  patchWorkoutInData,
  removeWorkoutFromList,
} from "../optimisticWorkout";

const log = (over: Record<string, unknown> = {}) => ({
  id: "L1",
  athlete_id: "A",
  session_id: "S1",
  scheduled_date: "2026-11-08",
  status: "planned",
  completed_at: null,
  rpe_score: null,
  run_distance_km: null,
  athlete_modifications: { comment: "ok", coachOverride: { blocs: [] } },
  ...over,
});

describe("patchWorkoutInData", () => {
  it("valide la séance dans une liste, sans toucher les autres", () => {
    const other = log({ id: "L2" });
    const data = [log(), other];
    const out = patchWorkoutInData(data, "L1", {
      status: "completed",
      completedAt: "2026-11-08T10:00:00Z",
      runKm: 5,
      mods: { sessionSets: { e1: [{ kg: 50 }] }, coachOverride: { pirate: true } },
    });
    expect(out[0]).toMatchObject({ status: "completed", completed_at: "2026-11-08T10:00:00Z", run_distance_km: 5 });
    // Fusion de premier niveau, l'adaptation du coach est gardée telle quelle.
    expect(out[0].athlete_modifications).toEqual({
      comment: "ok",
      coachOverride: { blocs: [] },
      sessionSets: { e1: [{ kg: 50 }] },
    });
    expect(out[1]).toBe(other);
    expect(data[0].status).toBe("planned"); // pas de mutation en place
  });

  it("même référence quand la séance n'est pas là", () => {
    const data = { days: [[log({ id: "L2" })]] };
    expect(patchWorkoutInData(data, "L1", { status: "completed" })).toBe(data);
  });

  it("ne remplace pas une heure de validation, ni une distance par null", () => {
    const [o] = patchWorkoutInData([log({ completed_at: "avant", run_distance_km: 3 })], "L1", {
      completedAt: "après",
      runKm: null,
    });
    expect(o.completed_at).toBe("avant");
    expect(o.run_distance_km).toBe(3);
  });

  it("RPE : rpe_score et `rpe` (calendrier) si la forme les a, jamais ajoutés", () => {
    const cal = { id: "L1", type: "workout", status: "planned", rpe: null };
    expect(patchWorkoutInData([cal], "L1", { rpe: 7 })[0]).toEqual({ ...cal, rpe: 7 });
    const [o] = patchWorkoutInData([log()], "L1", { rpe: 8 });
    expect(o.rpe_score).toBe(8);
    expect("rpe" in o).toBe(false);
  });

  it("liste lue sans la saisie : reste sans saisie, sauf le détail", () => {
    const bare = log({ athlete_modifications: null });
    expect(patchWorkoutInData([bare], "L1", { mods: { a: 1 } })[0].athlete_modifications).toBeNull();
    expect(patchWorkoutInData(bare, "L1", { mods: { a: 1 } }, { createMods: true }).athlete_modifications).toEqual({ a: 1 });
  });
});

describe("removeWorkoutFromList", () => {
  it("retire la séance, même référence sinon", () => {
    const list = [{ id: "L1" }, { id: "L2" }];
    expect(removeWorkoutFromList(list, "L1")).toEqual([{ id: "L2" }]);
    expect(removeWorkoutFromList(list, "X")).toBe(list);
  });
});

describe("applyOptimisticWorkout", () => {
  it("détail, listes de l'athlète et rappel « non terminée »", () => {
    const qc = new QueryClient();
    qc.setQueryData(["workout-log-detail", "L1"], log({ athlete_modifications: null }));
    qc.setQueryData(["workouts", "A", "list", {}], [log()]);
    qc.setQueryData(["workouts", "_many", ["A"], "unfinished"], [{ id: "L1", athleteId: "A" }]);
    qc.setQueryData(["workouts", "B", "list", {}], [log({ athlete_id: "B" })]);

    applyOptimisticWorkout(qc, { athleteId: "A", logId: "L1" }, {
      status: "completed",
      completedAt: "t",
      mods: { sessionSets: {} },
    });

    expect(qc.getQueryData<Record<string, unknown>>(["workout-log-detail", "L1"])).toMatchObject({
      status: "completed",
      athlete_modifications: { sessionSets: {} },
    });
    expect(qc.getQueryData<Array<{ status: string }>>(["workouts", "A", "list", {}])?.[0].status).toBe("completed");
    expect(qc.getQueryData(["workouts", "_many", ["A"], "unfinished"])).toEqual([]);
    // Un autre athlète n'est pas touché.
    expect(qc.getQueryData<Array<{ status: string }>>(["workouts", "B", "list", {}])?.[0].status).toBe("planned");
  });
});

describe("findCachedWorkoutLogId", () => {
  it("retrouve la séance (athlète, séance-type, date) dans le cache", () => {
    const qc = new QueryClient();
    qc.setQueryData(["workout-logs-week", "A", "2026-11-02"], [
      log({ id: "old", scheduled_date: "2026-11-01" }),
      log({ id: "new", scheduled_date: "2026-11-08" }),
      log({ id: "autre", session_id: "S2" }),
    ]);
    expect(findCachedWorkoutLogId(qc, { athleteId: "A", sessionId: "S1", scheduledDate: "2026-11-01" })).toBe("old");
    expect(findCachedWorkoutLogId(qc, { athleteId: "A", sessionId: "S1" })).toBe("new");
    expect(findCachedWorkoutLogId(qc, { athleteId: "A", sessionId: "S9" })).toBeNull();
    expect(findCachedWorkoutLogId(qc, { athleteId: "Z", sessionId: "S1" })).toBeNull();
  });
});

describe("draftAlreadyOnServer", () => {
  const server = { coachOverride: { blocs: [1] }, sessionSets: { e1: [{ kg: 50, reps: 5 }] }, comment: "x" };
  it("vrai quand le brouillon n'apporte rien (ordre des clés indifférent)", () => {
    expect(draftAlreadyOnServer(server, { comment: "x", sessionSets: { e1: [{ reps: 5, kg: 50 }] } })).toBe(true);
    // L'adaptation du coach du brouillon ne compte pas.
    expect(draftAlreadyOnServer(server, { coachOverride: null, comment: "x" })).toBe(true);
  });
  it("faux dès qu'une valeur manque en base", () => {
    expect(draftAlreadyOnServer(server, { sessionSets: { e1: [{ kg: 55, reps: 5 }] } })).toBe(false);
    expect(draftAlreadyOnServer(null, { sessionSets: { e1: [] } })).toBe(false);
  });
});

describe("séance libre sans réseau (cache)", () => {
  function qcWith() {
    const qc = new QueryClient();
    qc.setQueryData(["workouts", "A", "list", { from: "2026-11-02" }], [
      log({ id: "lun", scheduled_date: "2026-11-02", status: "completed" }),
      log({ id: "annulee", scheduled_date: "2026-11-08", status: "skipped" }),
      log({ id: "autre-seance", session_id: "S2", scheduled_date: "2026-11-05" }),
      log({ id: "semaine-avant", scheduled_date: "2026-10-30" }),
    ]);
    qc.setQueryData(["workout-logs-week", "A", "2026-10-26"], [{ ...log({ id: "w", scheduled_date: "2026-10-30" }), occurrence: 6 }]);
    qc.setQueryData(["session-occurrence", "A", "S1", "2026-11-02"], 7);
    qc.setQueryData(["session-occurrence", "A", "S1", "2026-11-20"], 9); // après : ignorée
    return qc;
  }

  it("semaine de la séance-type d'après le cache, annulées comprises", () => {
    const logs = findCachedWeekLogs(qcWith(), { athleteId: "A", sessionId: "S1", from: "2026-11-02", to: "2026-11-08" });
    expect(logs.map((l) => [l.id, l.status]).sort()).toEqual([["annulee", "skipped"], ["lun", "completed"]]);
  });

  it("occurrence suivante estimée depuis les occurrences déjà lues", () => {
    expect(cachedNextOccurrence(qcWith(), { athleteId: "A", sessionId: "S1", date: "2026-11-08" })).toBe(8);
    expect(cachedNextOccurrence(new QueryClient(), { athleteId: "A", sessionId: "S1", date: "2026-11-08" })).toBeNull();
  });

  it("séance créée en file : l'écran de séance la trouve dans le cache", () => {
    const qc = qcWith();
    seedPlannedWorkout(qc, { id: "local", athlete_id: "A", coach_id: null, session_id: "S1", session_name: "Haut", scheduled_date: "2026-11-08" });
    expect(qc.getQueryData(["workout-log-detail", "local"])).toMatchObject({
      id: "local", status: "planned", athlete_modifications: null, rescheduled_by_athlete: true, scheduled_date: "2026-11-08",
    });
    expect(qc.getQueryData(["session-occurrence", "A", "S1", "2026-11-08"])).toBe(8);
  });
});
