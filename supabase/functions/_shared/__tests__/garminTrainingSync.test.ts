/**
 * Envoi vers Garmin de bout en bout, sur base simulée et faux client Garmin :
 * création, passage sans changement (aucun appel), modification, retrait,
 * séance commencée protégée, envoi coupé, refus d'autorisation (412),
 * permission « Workout Import » manquante ou inconnue, doublons.
 */
import { describe, expect, it } from "vitest";
import { fakeDb, type Row } from "./fakeDb";
import { GarminTrainingError, type GarminTrainingClient } from "../garminTraining/client";
import { ensureKnownScopes, syncAthleteWorkouts, workoutImportPermission, WORKOUT_IMPORT_MISSING } from "../garminTraining/sync";
import type { GarminWorkout } from "../garminTraining/types";

const A = "athlete-1";
const TODAY = "2026-11-13";

function fakeGarmin(failWith?: number, scheduleFailWith?: number) {
  const calls: string[] = [];
  const workouts = new Map<string, GarminWorkout>();
  let n = 100;
  const client: GarminTrainingClient = {
    async createWorkout(w) {
      calls.push(`create:${w.workoutName}`);
      if (failWith) throw new GarminTrainingError("refus simulé", failWith);
      const id = String(++n);
      workouts.set(id, w);
      return id;
    },
    async deleteWorkout(id) {
      calls.push(`delete:${id}`);
      workouts.delete(id);
    },
    async scheduleWorkout(id, date) {
      calls.push(`schedule:${id}:${date}`);
      if (scheduleFailWith) throw new GarminTrainingError("date refusée", scheduleFailWith);
      return `s${id}`;
    },
  };
  return { client, calls, workouts };
}

function world(extra: Record<string, Row[]> = {}) {
  return fakeDb(
    {
      energy_session_assignments: [
        {
          id: "as-1",
          athlete_id: A,
          scheduled_date: "2026-11-14",
          status: "planned",
          energy_sessions: {
            name: "Footing 45'",
            session_kind: "footing",
            modality: null,
            format: "wod",
            intervals: [{ type: "interval", role: "work", duration: { kind: "time", value: 2700 }, target: { kind: "hr_zone", zone: 2 } }],
          },
        },
      ],
      workout_logs: [
        { id: "wl-1", athlete_id: A, session_id: "prog-1", scheduled_date: "2026-11-15", status: "planned" },
        { id: "wl-0", athlete_id: A, session_id: "prog-1", scheduled_date: "2026-11-08", status: "completed" },
      ],
      app_data: [
        {
          athlete_id: A,
          key: "asp:prog",
          value: [
            {
              id: "prog-1",
              name: "Force A",
              blocs: [
                {
                  name: "Force",
                  timing_mode: "repos",
                  timing_repos_min: 2,
                  sort_order: 0,
                  exercices: [
                    {
                      id: "e1",
                      exercise_id: "ex-squat",
                      exercise_name: "Back squat",
                      mode: "classique",
                      sort_order: 0,
                      params: {
                        "1": { nb_series: 3, reps: { mode: "global", value: 5 }, reps_mode: { mode: "global", value: "EC" }, charge_unit: "%RM", charge: { mode: "global", value: 70 }, rir: { mode: "global", value: null }, tempo: { mode: "global", value: "" } },
                        "2": { nb_series: 3, reps: { mode: "global", value: 5 }, reps_mode: { mode: "global", value: "EC" }, charge_unit: "%RM", charge: { mode: "global", value: 75 }, rir: { mode: "global", value: null }, tempo: { mode: "global", value: "" } },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      exercise_pr_logs: [{ athlete_id: A, exercise_ref: "Back squat", kg: 140 }],
      exercises: [{ id: "ex-squat", garmin_category: "SQUAT", garmin_exercise: "BARBELL_BACK_SQUAT" }],
      performance_logs: [{ athlete_id: A, metric_name: "FCmax", value: 190, unit: "bpm", is_active_reference: true }],
      provider_workout_pushes: [],
      ...extra,
    },
    undefined,
    { hr_zone_bounds_at: () => [{ model_id: null, kind: "three", bounds: [150, 170] }] },
  ).db;
}

const pushes = async (db: ReturnType<typeof world>) =>
  ((await db.from("provider_workout_pushes").select("*")).data ?? []) as Row[];

describe("envoi des séances vers Garmin", () => {
  it("crée et date chaque séance des 7 jours ; muscu : occurrence 2, 75 %RM de 140 kg", async () => {
    const db = world();
    const g = fakeGarmin();
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    expect(report).toMatchObject({ created: 2, errors: [] });
    expect(g.calls).toEqual(["create:Footing 45'", "schedule:101:2026-11-14", "create:Force A", "schedule:102:2026-11-15"]);
    const footing = g.workouts.get("101")!.segments[0].steps[0];
    expect(footing).toMatchObject({ targetType: "HEART_RATE", targetValueLow: 150, targetValueHigh: 169 });
    const squat = g.workouts.get("102")!.segments[0].steps[0] as { steps: Array<{ weightValue: number }> };
    expect(squat.steps[0].weightValue).toBe(105);
    const rows = await pushes(db);
    expect(rows.map((r) => [r.source_kind, r.status, r.external_workout_id, r.external_schedule_id])).toEqual([
      ["energy", "sent", "101", "s101"],
      ["strength", "sent", "102", "s102"],
    ]);
  });

  it("deuxième passage sans changement : aucun appel Garmin", async () => {
    const db = world();
    const g = fakeGarmin();
    await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    g.calls.length = 0;
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    expect(g.calls).toEqual([]);
    expect(report).toMatchObject({ created: 0, replaced: 0, removed: 0 });
  });

  it("séance déplacée : remplacée ; séance supprimée : retirée de Garmin", async () => {
    const db = world();
    const g = fakeGarmin();
    await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    await db.from("energy_session_assignments").update({ scheduled_date: "2026-11-16" }).eq("id", "as-1");
    await db.from("workout_logs").delete().eq("id", "wl-1");
    g.calls.length = 0;
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    expect(report).toMatchObject({ replaced: 1, removed: 1 });
    expect(g.calls).toEqual(["delete:101", "create:Footing 45'", "schedule:103:2026-11-16", "delete:102"]);
    expect((await pushes(db)).map((r) => r.source_id)).toEqual(["as-1"]);
  });

  it("séance commencée : jamais retirée, même envoi coupé", async () => {
    const db = world();
    const g = fakeGarmin();
    await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    await db.from("workout_logs").update({ status: "in_progress" }).eq("id", "wl-1");
    g.calls.length = 0;
    const report = await syncAthleteWorkouts(db, g.client, A, false, { today: TODAY });
    expect(g.calls).toEqual(["delete:101"]);
    expect(report).toMatchObject({ removed: 1, forgotten: 1 });
  });

  it("412 (envoi non autorisé dans Garmin Connect) : erreur notée, arrêt pour l'athlète", async () => {
    const db = world();
    const g = fakeGarmin(412);
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    expect(report.stopped).toContain("refus simulé");
    expect(g.calls).toEqual(["create:Footing 45'"]);
    const rows = await pushes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "error", attempts: 1, external_workout_id: null });
  });

  it("412 puis autorisation accordée : une seule séance créée, pas de doublon", async () => {
    const db = world();
    await syncAthleteWorkouts(db, fakeGarmin(412).client, A, true, { today: TODAY });
    const g = fakeGarmin();
    // Réessai immédiat forcé (`now` loin après l'erreur).
    await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY, now: Date.now() + 7 * 3600_000 });
    expect(g.workouts.size).toBe(2);
    const rows = await pushes(db);
    expect(rows.filter((r) => r.source_id === "as-1")).toHaveLength(1);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });

  it("date refusée après création : la séance créée est retirée (pas d'orpheline sur Garmin)", async () => {
    const db = world();
    const g = fakeGarmin(undefined, 400);
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY });
    expect(g.workouts.size).toBe(0);
    expect(report.errors.length).toBeGreaterThan(0);
    const rows = await pushes(db);
    expect(rows.every((r) => r.status === "error" && r.external_workout_id === null)).toBe(true);
  });
});

describe("permission « Workout Import »", () => {
  it("lecture des scopes : vide = inconnue, sans WORKOUT_IMPORT = manquante", () => {
    expect(workoutImportPermission([])).toBe("unknown");
    expect(workoutImportPermission(null)).toBe("unknown");
    expect(workoutImportPermission(["ACTIVITY_EXPORT"])).toBe("missing");
    expect(workoutImportPermission(["ACTIVITY_EXPORT", "WORKOUT_IMPORT"])).toBe("granted");
  });

  it("manquante : aucun appel Garmin, aucune ligne, motif clair", async () => {
    const db = world();
    const g = fakeGarmin();
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY, scopes: ["ACTIVITY_EXPORT", "HEALTH_EXPORT"] });
    expect(g.calls).toEqual([]);
    expect(report.stopped).toBe(WORKOUT_IMPORT_MISSING);
    expect(await pushes(db)).toHaveLength(0);
  });

  it("inconnue : l'envoi est tenté (Garmin tranchera par 412)", async () => {
    const db = world();
    const g = fakeGarmin();
    const report = await syncAthleteWorkouts(db, g.client, A, true, { today: TODAY, scopes: [] });
    expect(report.created).toBe(2);
  });

  it("scopes inconnus : relus chez Garmin et rangés sur la connexion", async () => {
    const db = world({ provider_connections: [{ id: "c1", granted_scopes: [] }] });
    let reads = 0;
    const scopes = await ensureKnownScopes(db, "c1", [], async () => { reads++; return ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"]; });
    expect(reads).toBe(1);
    expect(scopes).toEqual(["ACTIVITY_EXPORT", "WORKOUT_IMPORT"]);
    const { data } = await db.from("provider_connections").select("*");
    expect((data as Row[])[0].granted_scopes).toEqual(["ACTIVITY_EXPORT", "WORKOUT_IMPORT"]);
  });

  it("scopes connus : pas de lecture ; lecture en échec ou vide : rien n'est écrit", async () => {
    const db = world({ provider_connections: [{ id: "c1", granted_scopes: [] }] });
    let reads = 0;
    expect(await ensureKnownScopes(db, "c1", ["HEALTH_EXPORT"], async () => { reads++; return []; })).toEqual(["HEALTH_EXPORT"]);
    expect(reads).toBe(0);
    expect(await ensureKnownScopes(db, "c1", [], async () => { throw new Error("réseau"); })).toEqual([]);
    expect(await ensureKnownScopes(db, "c1", [], async () => [])).toEqual([]);
    const { data } = await db.from("provider_connections").select("*");
    expect((data as Row[])[0].granted_scopes).toEqual([]);
  });
});
