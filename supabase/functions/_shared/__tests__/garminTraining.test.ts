/**
 * Séance Agon → séance Garmin (Training API V2) : cibles calculées par Agon,
 * répétitions, spécifique en format course, musculation série par série.
 */
import { describe, expect, it } from "vitest";
import { convertTarget, zoneBpmRange } from "../garminTraining/targets";
import { MAX_STEPS, countSteps, energySport, translateEnergySession, translateStrengthSession } from "../garminTraining/translate";
import { resolveStrengthSession, type ProgSessionLite } from "../garminTraining/strength";
import { MAX_FAST_ATTEMPTS, planPushActions, type PushedRow } from "../garminTraining/plan";
import type {
  AgonEnergySession,
  AthleteTrainingContext,
  GarminRepeatStep,
  GarminStep,
  GarminWorkoutStep,
} from "../garminTraining/types";

const ctx: AthleteTrainingContext = {
  hrZoneBounds: [130, 145, 160, 172], // 5 zones
  refs: {
    VMA: { value: 18, unit: "km/h" },
    FCmax: { value: 190, unit: "bpm" },
    FCrepos: { value: 50, unit: "bpm" },
    FTP: { value: 250, unit: "W" },
  },
};
const empty: AthleteTrainingContext = { hrZoneBounds: null, refs: {} };

const ws = (s: GarminStep) => s as GarminWorkoutStep;
const rs = (s: GarminStep) => s as GarminRepeatStep;

function energy(partial: Partial<AgonEnergySession>): AgonEnergySession {
  return { name: "Séance", session_kind: "vo2", modality: null, intervals: [], ...partial };
}

describe("zones FC d'Agon en bpm", () => {
  it("zone du milieu : borne basse → borne suivante − 1", () => {
    expect(zoneBpmRange(3, [130, 145, 160, 172], 50, 190)).toEqual({ low: 145, high: 159 });
  });
  it("zone 1 part de la FC repos, dernière zone finit à la FC max", () => {
    expect(zoneBpmRange(1, [130, 145, 160, 172], 50, 190)).toEqual({ low: 50, high: 129 });
    expect(zoneBpmRange(5, [130, 145, 160, 172], 50, 190)).toEqual({ low: 172, high: 190 });
  });
  it("modèle à 3 zones : zone 4 n'existe pas → pas de cible", () => {
    expect(zoneBpmRange(4, [150, 170], null, null)).toBeNull();
  });
  it("sans zones → pas de cible, consigne en texte", () => {
    const t = convertTarget({ kind: "hr_zone", zone: 2 }, "RUNNING", empty);
    expect(t.targetType).toBeNull();
    expect(t.label).toContain("Zone 2");
    expect(t.label).toContain("non renseignées");
  });
});

describe("cibles calculées par Agon", () => {
  it("% VMA → vitesse en m/s, fourchette lente → rapide", () => {
    const t = convertTarget({ kind: "pace_test_pct", test_metric: "VMA", min: 90, max: 95 }, "RUNNING", ctx);
    expect(t.targetType).toBe("PACE");
    expect(t.low).toBeCloseTo((18 * 0.9) / 3.6, 3);
    expect(t.high).toBeCloseTo((18 * 0.95) / 3.6, 3);
  });
  it("allure min/km → m/s (borne basse = allure la plus lente)", () => {
    const t = convertTarget({ kind: "pace", min_s_per_unit: 240, max_s_per_unit: 255, unit: "min_per_km" }, "RUNNING", ctx);
    expect(t.low).toBeCloseTo(1000 / 255, 3);
    expect(t.high).toBeCloseTo(1000 / 240, 3);
  });
  it("ancienne forme { min, max } de l'allure acceptée", () => {
    const t = convertTarget({ kind: "pace", min: 300, max: 330 }, "CYCLING", ctx);
    expect(t.targetType).toBe("SPEED");
    expect(t.low).toBeCloseTo(1000 / 330, 3);
  });
  it("% FCmax → bpm avec la FCmax d'Agon", () => {
    const t = convertTarget({ kind: "hr_pct", min: 80, max: 85 }, "RUNNING", ctx);
    expect([t.targetType, t.low, t.high]).toEqual(["HEART_RATE", 152, 162]);
  });
  it("% FTP → watts", () => {
    const t = convertTarget({ kind: "power_test_pct", test_metric: "FTP", min: 90, max: 100 }, "CYCLING", ctx);
    expect([t.targetType, t.low, t.high]).toEqual(["POWER", 225, 250]);
  });
  it("% VMA sans VMA → texte, jamais un chiffre inventé", () => {
    const t = convertTarget({ kind: "pace_test_pct", test_metric: "VMA", min: 90, max: 95 }, "RUNNING", empty);
    expect(t.targetType).toBeNull();
    expect(t.label).toContain("VMA non renseignée");
  });
  it("natation : pas de cible principale, consigne en texte", () => {
    const t = convertTarget({ kind: "hr_zone", zone: 2 }, "LAP_SWIMMING", ctx);
    expect(t.targetType).toBeNull();
    expect(t.label).toBe("Zone 2");
  });
});

describe("séance d'endurance", () => {
  const session = energy({
    name: "10 × 400 m",
    intervals: [
      { type: "interval", role: "warmup", duration: { kind: "time", value: 900 }, target: { kind: "hr_zone", zone: 2 } },
      {
        type: "group",
        role: "work",
        repeat: 10,
        children: [
          { type: "interval", role: "work", duration: { kind: "distance", value: 400 }, target: { kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 100 } },
        ],
        rest_between: { type: "interval", role: "recovery", duration: { kind: "time", value: 60 }, target: { kind: "none" } },
      },
      { type: "interval", role: "cooldown", duration: { kind: "lap_button" }, target: { kind: "none" } },
    ],
  });

  it("échauffement, répétition × 10 (effort + récup), retour au calme au bouton Tour", () => {
    const r = translateEnergySession(session, ctx);
    if (!r.ok) throw new Error(r.reason);
    const steps = r.workout.segments[0].steps;
    expect(r.workout.sport).toBe("RUNNING");
    expect(steps).toHaveLength(3);
    expect(ws(steps[0])).toMatchObject({ intensity: "WARMUP", durationType: "TIME", durationValue: 900, targetType: "HEART_RATE", targetValueLow: 130, targetValueHigh: 144 });
    const rep = rs(steps[1]);
    expect(rep).toMatchObject({ type: "WorkoutRepeatStep", repeatValue: 10, repeatType: "REPEAT_UNTIL_STEPS_CMPLT" });
    expect(ws(rep.steps[0])).toMatchObject({ intensity: "INTERVAL", durationType: "DISTANCE", durationValue: 400, durationValueType: "METER", targetType: "PACE" });
    expect(ws(rep.steps[1])).toMatchObject({ intensity: "RECOVERY", durationType: "TIME", durationValue: 60 });
    expect(ws(steps[2])).toMatchObject({ intensity: "COOLDOWN", durationType: "OPEN" });
  });

  it("numérotation continue, répétitions comprises", () => {
    const r = translateEnergySession(session, ctx);
    if (!r.ok) throw new Error(r.reason);
    const steps = r.workout.segments[0].steps;
    expect(steps.map((s) => s.stepOrder)).toEqual([1, 2, 5]);
    expect(rs(steps[1]).steps.map((s) => s.stepOrder)).toEqual([3, 4]);
  });

  it("répétitions imbriquées : la plus fine reste une répétition, l'englobante est déroulée", () => {
    const r = translateEnergySession(
      energy({
        intervals: [
          {
            type: "group",
            role: "work",
            repeat: 3,
            children: [
              {
                type: "group",
                role: "work",
                repeat: 6,
                children: [
                  { type: "interval", role: "work", duration: { kind: "time", value: 30 }, target: { kind: "none" } },
                  { type: "interval", role: "recovery", duration: { kind: "time", value: 30 }, target: { kind: "none" } },
                ],
              },
              { type: "interval", role: "rest", duration: { kind: "time", value: 180 }, target: { kind: "none" } },
            ],
          },
        ],
      }),
      ctx,
    );
    if (!r.ok) throw new Error(r.reason);
    const steps = r.workout.segments[0].steps;
    expect(steps.map((s) => s.type)).toEqual(["WorkoutRepeatStep", "WorkoutStep", "WorkoutRepeatStep", "WorkoutStep", "WorkoutRepeatStep", "WorkoutStep"]);
    expect(rs(steps[0]).repeatValue).toBe(6);
  });

  it("sport : choix du coach, course par défaut, spécifique = course", () => {
    expect(energySport({ session_kind: "vo2", modality: null })).toBe("RUNNING");
    expect(energySport({ session_kind: "tempo", modality: "velo" })).toBe("CYCLING");
    expect(energySport({ session_kind: "footing", modality: "natation" })).toBe("LAP_SWIMMING");
    expect(energySport({ session_kind: "autre", modality: "rameur" })).toBe("CARDIO_TRAINING");
    expect(energySport({ session_kind: "specifique", modality: "velo" })).toBe("RUNNING");
  });

  it("au-delà de 100 étapes : refus explicite", () => {
    const many = Array.from({ length: MAX_STEPS + 1 }, () => ({
      type: "interval" as const,
      role: "work" as const,
      duration: { kind: "time" as const, value: 10 },
      target: { kind: "none" as const },
    }));
    const r = translateEnergySession(energy({ intervals: many }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("trop d'étapes");
  });
});

describe("spécifique / HYROX : format course sur tapis", () => {
  it("runs en étapes de distance, ateliers au bouton Tour avec la consigne", () => {
    const r = translateEnergySession(
      energy({
        session_kind: "specifique",
        intervals: [
          {
            type: "group",
            role: "work",
            repeat: 4,
            children: [
              { type: "interval", role: "work", duration: { kind: "distance", value: 1000 }, target: { kind: "pace", min_s_per_unit: 270, max_s_per_unit: 285 } },
              { type: "exercise", role: "work", exercise_name: "Wall balls", reps_min: 25, weight_kg: 6, weight_unit: "kg", target: { kind: "none" } },
              { type: "exercise", role: "work", exercise_name: "Sled push", duration: { kind: "distance", value: 50 }, target: { kind: "none" } },
            ],
          },
        ],
      }),
      ctx,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.workout.sport).toBe("RUNNING");
    const rep = rs(r.workout.segments[0].steps[0]);
    expect(ws(rep.steps[0])).toMatchObject({ durationType: "DISTANCE", durationValue: 1000, targetType: "PACE" });
    expect(ws(rep.steps[1])).toMatchObject({ durationType: "OPEN", exerciseName: null, description: "Wall balls · 25 reps · 6 kg" });
    expect(ws(rep.steps[2])).toMatchObject({ durationType: "OPEN", description: "Sled push · 50 m" });
  });

  it("format classique : un item = une étape au bouton Tour, titre du bloc en tête", () => {
    const r = translateEnergySession(
      energy({
        session_kind: "specifique",
        format: "classique",
        classique_structure: {
          blocks: [{ title: "Gainage", items: [{ name: "Planche", prescription: "3 × 45 s", rest: "30 s" }, { name: "Side plank", prescription: "3 × 30 s" }] }],
        },
      }),
      ctx,
    );
    if (!r.ok) throw new Error(r.reason);
    const steps = r.workout.segments[0].steps.map(ws);
    expect(steps).toHaveLength(2);
    expect(steps[0].description).toBe("Gainage — Planche · 3 × 45 s · récup 30 s");
    expect(steps[1]).toMatchObject({ durationType: "OPEN", description: "Side plank · 3 × 30 s" });
  });
});

describe("musculation", () => {
  const prog: ProgSessionLite = {
    id: "s1",
    name: "Force A",
    blocs: [
      {
        name: "Force",
        category: "Force",
        timing_mode: "repos",
        timing_repos_min: 2,
        timing_repos_sec: 30,
        sort_order: 0,
        exercices: [
          {
            id: "e1",
            exercise_id: "squat",
            exercise_name: "Back squat",
            mode: "classique",
            sort_order: 0,
            params: {
              "1": {
                nb_series: 4,
                reps: { mode: "global", value: 5 },
                reps_mode: { mode: "global", value: "EC" },
                charge_unit: "%RM",
                charge: { mode: "global", value: 80 },
                rir: { mode: "global", value: 2 },
                tempo: { mode: "global", value: "" },
              },
              "3": {
                nb_series: 3,
                reps: { mode: "par_serie", values: [5, 3, 1] },
                reps_mode: { mode: "global", value: "EC" },
                charge_unit: "kg",
                charge: { mode: "par_serie", values: [100, 110, 120] },
                rir: { mode: "global", value: null },
                tempo: { mode: "global", value: "" },
              },
            },
          },
        ],
      },
      {
        name: "Accessoires",
        timing_mode: "libre",
        sort_order: 1,
        exercices: [
          {
            id: "e2",
            exercise_id: "pompes",
            exercise_name: "Pompes",
            mode: "classique",
            sort_order: 0,
            superset_with_next: true,
            params: {
              nb_series: 3,
              reps: { mode: "global", value: 12 },
              reps_mode: { mode: "global", value: "EC" },
              charge_unit: "PDC",
              charge: { mode: "global", value: null },
              rir: { mode: "global", value: null },
              tempo: { mode: "global", value: "" },
            },
          },
          {
            id: "e3",
            exercise_id: "planche",
            exercise_name: "Planche",
            mode: "classique",
            sort_order: 1,
            params: {
              nb_series: 3,
              reps: { mode: "global", value: 45 },
              reps_mode: { mode: "global", value: "iso" },
              charge_unit: "PDC",
              charge: { mode: "global", value: null },
              rir: { mode: "global", value: null },
              tempo: { mode: "global", value: "" },
            },
          },
        ],
      },
    ],
  };
  const look = {
    oneRm: (ex: { exercise_name: string }) => (ex.exercise_name === "Back squat" ? 140 : null),
    garmin: (id: string) =>
      id === "squat" ? { category: "SQUAT", name: "BARBELL_BACK_SQUAT" } : id === "pompes" ? { category: "PUSH_UP", name: "PUSH_UP" } : null,
  };

  it("séries identiques → répétition (série + repos), %RM converti en kg avec le 1RM", () => {
    const r = translateStrengthSession(resolveStrengthSession(prog, 1, look));
    if (!r.ok) throw new Error(r.reason);
    expect(r.workout.sport).toBe("STRENGTH_TRAINING");
    const rep = rs(r.workout.segments[0].steps[0]);
    expect(rep.repeatValue).toBe(4);
    expect(ws(rep.steps[0])).toMatchObject({
      durationType: "REPS",
      durationValue: 5,
      exerciseCategory: "SQUAT",
      exerciseName: "BARBELL_BACK_SQUAT",
      weightValue: 112,
      weightDisplayUnit: "KILOGRAM",
    });
    expect(ws(rep.steps[0]).description).toContain("RIR 2");
    expect(ws(rep.steps[1])).toMatchObject({ intensity: "REST", durationType: "TIME", durationValue: 150 });
  });

  it("occurrence 4 reprend la semaine 3 : séries différentes déroulées", () => {
    const r = translateStrengthSession(resolveStrengthSession(prog, 4, look));
    if (!r.ok) throw new Error(r.reason);
    const steps = r.workout.segments[0].steps.slice(0, 6).map(ws);
    expect(steps.filter((s) => s.intensity !== "REST").map((s) => [s.durationValue, s.weightValue])).toEqual([
      [5, 100],
      [3, 110],
      [1, 120],
    ]);
  });

  it("superset : les deux exercices par tour, puis repos libre ; maintien en secondes", () => {
    const r = translateStrengthSession(resolveStrengthSession(prog, 1, look));
    if (!r.ok) throw new Error(r.reason);
    const rep = rs(r.workout.segments[0].steps[1]);
    expect(rep.repeatValue).toBe(3);
    expect(ws(rep.steps[0])).toMatchObject({ exerciseName: "PUSH_UP", durationType: "REPS", durationValue: 12, weightValue: null });
    expect(ws(rep.steps[0]).description).toContain("Accessoires");
    // « Planche » sans équivalent choisi par le coach : proposition depuis le nom.
    expect(ws(rep.steps[1])).toMatchObject({ exerciseCategory: "PLANK", exerciseName: "PLANK", durationType: "TIME", durationValue: 45 });
    expect(ws(rep.steps[2])).toMatchObject({ intensity: "REST", durationType: "OPEN" });
    expect(r.warnings).toEqual([]);
  });

  it("nom non reconnu et pas d'équivalent choisi : envoyé sous son nom Agon, signalé", () => {
    const renamed = structuredClone(prog);
    renamed.blocs[1].exercices[1].exercise_name = "Copenhague";
    const r = translateStrengthSession(resolveStrengthSession(renamed, 1, look));
    if (!r.ok) throw new Error(r.reason);
    const rep = rs(r.workout.segments[0].steps[1]);
    expect(ws(rep.steps[1])).toMatchObject({ exerciseName: null, durationType: "TIME" });
    expect(ws(rep.steps[1]).description).toContain("Copenhague");
    expect(r.warnings).toEqual(["sans équivalent Garmin : Copenhague"]);
  });

  it("%RM sans 1RM : pas de charge inventée, consigne en texte", () => {
    const r = translateStrengthSession(resolveStrengthSession(prog, 1, { ...look, oneRm: () => null }));
    if (!r.ok) throw new Error(r.reason);
    const set = ws(rs(r.workout.segments[0].steps[0]).steps[0]);
    expect(set.weightValue).toBeNull();
    expect(set.description).toContain("80 %RM (1RM non renseigné dans Agon)");
  });

  it("compte des étapes : répétition + contenu", () => {
    const r = translateStrengthSession(resolveStrengthSession(prog, 1, look));
    if (!r.ok) throw new Error(r.reason);
    expect(countSteps(r.workout.segments[0].steps)).toBe(3 + 4);
  });
});

describe("rapprochement Agon ↔ Garmin", () => {
  const okResult = translateEnergySession(
    energy({ intervals: [{ type: "interval", role: "work", duration: { kind: "time", value: 600 }, target: { kind: "none" } }] }),
    ctx,
  );
  const item = (id: string, hash = "h1", date = "2026-11-14") => ({ kind: "energy" as const, sourceId: id, date, result: okResult, hash });
  const row = (id: string, over: Partial<PushedRow> = {}): PushedRow => ({
    id: `row-${id}`,
    kind: "energy",
    sourceId: id,
    date: "2026-11-14",
    externalWorkoutId: "w1",
    externalScheduleId: "s1",
    hash: "h1",
    status: "sent",
    attempts: 0,
    updatedAt: "2026-11-13T08:00:00Z",
    ...over,
  });
  const base = { doneOrStarted: new Set<string>(), today: "2026-11-13", now: Date.parse("2026-11-13T10:00:00Z") };

  it("inchangée : aucun appel ; nouvelle : création ; modifiée : remplacement", () => {
    const actions = planPushActions({ ...base, desired: [item("a"), item("b"), item("c", "h2")], pushed: [row("a"), row("c")] });
    expect(actions.map((a) => [a.type, "item" in a ? a.item.sourceId : a.row.sourceId])).toEqual([
      ["create", "b"],
      ["replace", "c"],
    ]);
  });

  it("sortie de la fenêtre : retirée de Garmin, sauf passée, réalisée ou commencée", () => {
    const actions = planPushActions({
      ...base,
      doneOrStarted: new Set(["energy:done"]),
      desired: [],
      pushed: [row("gone"), row("done"), row("past", { date: "2026-11-12" })],
    });
    expect(actions.map((a) => [a.type, (a as { row: PushedRow }).row.sourceId])).toEqual([
      ["remove", "gone"],
      ["forget", "done"],
      ["forget", "past"],
    ]);
  });

  it("refusée par la traduction : notée une fois, pas réécrite tant qu'elle ne change pas", () => {
    const rejected = { ...item("r"), result: { ok: false as const, reason: "trop d'étapes" } };
    expect(planPushActions({ ...base, desired: [rejected], pushed: [] })[0].type).toBe("reject");
    expect(planPushActions({ ...base, desired: [rejected], pushed: [row("r", { status: "rejected", externalWorkoutId: null })] })).toEqual([]);
  });

  it("erreurs répétées : réessai ralenti (toutes les 6 h)", () => {
    const failing = row("e", { status: "error", attempts: MAX_FAST_ATTEMPTS, externalWorkoutId: null, updatedAt: "2026-11-13T09:00:00Z" });
    expect(planPushActions({ ...base, desired: [item("e")], pushed: [failing] })).toEqual([]);
    const later = { ...base, now: Date.parse("2026-11-13T16:00:00Z") };
    expect(planPushActions({ ...later, desired: [item("e")], pushed: [failing] })[0].type).toBe("create");
  });
});
