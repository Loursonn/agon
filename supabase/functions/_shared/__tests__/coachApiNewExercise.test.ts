/**
 * `create_exercise` : l'assistant ajoute un exercice à la banque avec sa
 * vidéo, et les séances de la même proposition s'y rattachent.
 */
import { describe, expect, it } from "vitest";
import { applyDraft, parseUndo, undoSteps } from "../coachApiApply";
import { type DraftOp, normName, type ProgSessionShape, validateDraft } from "../coachApiOps";
import { fakeDb, type Row } from "./fakeDb";

const A = "athlete-1";
const COACH = "coach-1";
const ID = "dQw4w9WgXcQ";
const TODAY = "2026-11-17";

const prog: ProgSessionShape[] = [{
  id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
  blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [
    { id: "e1", exercise_id: "x-squat", exercise_name: "Squat", mode: "classique", sort_order: 0,
      params: { nb_series: 4, reps: { mode: "global", value: 8 }, charge_unit: "kg" } },
  ] }],
}] as ProgSessionShape[];

const library = () => new Map([[normName("Squat"), { id: "x-squat", name: "Squat" }]]);

function validate(kind: "programme" | "semaine" | "plan" | "planning", ops: unknown[]) {
  let n = 0;
  return validateDraft({ kind, title: "Nouvel exercice", ops }, {
    prog,
    newId: () => `id-${++n}`,
    library: library(),
    today: TODAY,
    energy: new Map(),
    plan: kind === "plan" ? ({} as never) : undefined,
  });
}

const pallof = { op: "create_exercise", ref: "pallof", name: "Pallof press", youtube: `https://youtu.be/${ID}`, category: "Core" };

describe("validation", () => {
  it("exercice nouveau : id fixé, vidéo lue, type muscu par défaut", () => {
    const r = validate("programme", [pallof]);
    expect(r).toEqual({ ok: true, value: expect.objectContaining({
      ops: [{ op: "create_exercise", exercise_id: "id-1", name: "Pallof press", youtube_id: ID, ex_type: "muscu", category: "Core" }],
    }) });
  });

  it("nom vide ou sans lettre", () => {
    expect(validate("programme", [{ ...pallof, name: "  " }]).ok).toBe(false);
    expect(validate("programme", [{ ...pallof, name: "--" }]))
      .toEqual({ ok: false, error: expect.stringContaining("lettres ou des chiffres") });
  });

  it("doublon dans la banque (casse, accents, ponctuation ignorés) : renvoie vers set_exercise_video", () => {
    expect(validate("programme", [{ ...pallof, name: "SQUAT !" }]))
      .toEqual({ ok: false, error: expect.stringContaining("set_exercise_video") });
  });

  it("doublon dans la même proposition", () => {
    expect(validate("programme", [pallof, { ...pallof, ref: "p2", name: "pallof-press" }]))
      .toEqual({ ok: false, error: expect.stringContaining("déjà créé plus haut") });
  });

  it("vidéo absente ou non YouTube, type inconnu, champ inconnu", () => {
    const { youtube: _y, ...noVideo } = pallof;
    expect(validate("programme", [noVideo])).toEqual({ ok: false, error: expect.stringContaining("youtube") });
    expect(validate("programme", [{ ...pallof, youtube: "https://vimeo.com/1" }])).toEqual({ ok: false, error: expect.stringContaining("non reconnue") });
    expect(validate("programme", [{ ...pallof, ex_type: "cardio" }]).ok).toBe(false);
    expect(validate("programme", [{ ...pallof, url: "x" }]).ok).toBe(false);
  });

  it("refusé hors programme, semaine et plan", () => {
    expect(validate("planning", [pallof]).ok).toBe(false);
  });

  it("add_exercice placé après : rattaché par le nom", () => {
    const r = validate("programme", [
      pallof,
      { op: "add_exercice", session_id: "s1", bloc_id: "b1", exercice: { exercise_name: "pallof press", params: { nb_series: 3, reps: 10 } } },
    ]);
    if (!r.ok) throw new Error(r.error);
    const add = r.value.ops[1] as Extract<DraftOp, { op: "add_exercice" }>;
    expect(add.exercice).toEqual(expect.objectContaining({ exercise_id: "id-1", exercise_name: "Pallof press" }));
  });

  it("placé avant : pas de rattachement (l'ordre compte)", () => {
    const r = validate("programme", [
      { op: "add_exercice", session_id: "s1", bloc_id: "b1", exercice: { exercise_name: "Pallof press", params: { nb_series: 3, reps: 10 } } },
      pallof,
    ]);
    if (!r.ok) throw new Error(r.error);
    expect((r.value.ops[0] as Extract<DraftOp, { op: "add_exercice" }>).exercice.exercise_id).toBe("");
  });

  it("semaine : create_session rattaché par la ref, puis placé", () => {
    const r = validate("semaine", [
      pallof,
      { op: "create_session", ref: "gainage", name: "Gainage", blocs: [{ name: "Core", exercices: [
        { exercise_ref: "pallof", params: { nb_series: 3, reps: 12 } },
      ] }] },
      { op: "place_session", ref: "gainage", date: "2026-11-19" },
    ]);
    if (!r.ok) throw new Error(r.error);
    const s = (r.value.ops[1] as Extract<DraftOp, { op: "create_session" }>).session;
    expect(s.blocs[0].exercices[0]).toEqual(expect.objectContaining({ exercise_id: "id-1", exercise_name: "Pallof press" }));
  });

  it("ref d'exercice inconnue", () => {
    expect(validate("semaine", [
      { op: "create_session", ref: "g", name: "Gainage", blocs: [{ name: "Core", exercices: [{ exercise_ref: "pallof", params: { nb_series: 3, reps: 12 } }] }] },
    ])).toEqual({ ok: false, error: expect.stringContaining("create_exercise avant") });
  });

  it("la bibliothèque de l'appelant n'est pas modifiée", () => {
    const lib = library();
    validateDraft({ kind: "programme", title: "t", ops: [pallof] }, { prog, newId: () => "n", library: lib });
    expect(lib.size).toBe(1);
  });
});

describe("application et annulation", () => {
  function setup(profile: Row = { id: COACH, is_admin: false, is_certified_coach: false }, extra: Record<string, Row[]> = {}) {
    return fakeDb({
      app_data: [{ athlete_id: A, key: "asp:prog", value: structuredClone(prog) }],
      profiles: [profile],
      exercises: [{ id: "x-squat", name: "Squat", youtube_id: null, is_public: true }],
      workout_exercise_comments: [],
      activity_laps: [],
      exercise_pr_logs: [],
      workout_logs: [],
      ...extra,
    });
  }
  const programmeOps = () => {
    const r = validate("programme", [
      pallof,
      { op: "add_exercice", session_id: "s1", bloc_id: "b1", exercice: { exercise_name: "Pallof press", params: { nb_series: 3, reps: 10 } } },
    ]);
    if (!r.ok) throw new Error(r.error);
    return r.value.ops;
  };

  it("coach non certifié : exercice privé, rattaché à la séance, retiré à l'annulation", async () => {
    const { db, tables } = setup();
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: programmeOps() });
    expect(tables.exercises[1]).toEqual(expect.objectContaining({
      id: "id-1", name: "Pallof press", youtube_id: ID, ex_type: "muscu", category: "Core",
      created_by: COACH, is_public: false, is_verified: false,
    }));
    const p = tables.app_data[0].value as ProgSessionShape[];
    expect(p[0].blocs[0].exercices[1].exercise_id).toBe("id-1");

    const report = await undoSteps(db, A, COACH, parseUndo(JSON.parse(JSON.stringify(res.undo))));
    expect(report.keptExercises).toEqual([]);
    expect(tables.exercises.map((e) => e.id)).toEqual(["x-squat"]);
    expect((tables.app_data[0].value as ProgSessionShape[])[0].blocs[0].exercices).toHaveLength(1);
  });

  it("coach certifié ou admin : exercice public", async () => {
    const { db, tables } = setup({ id: COACH, is_admin: false, is_certified_coach: true });
    await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: programmeOps() });
    expect(tables.exercises[1].is_public).toBe(true);
    const admin = setup({ id: COACH, is_admin: true, is_certified_coach: false });
    await applyDraft({ db: admin.db, athleteId: A, coachId: COACH, kind: "programme", ops: programmeOps() });
    expect(admin.tables.exercises[1].is_public).toBe(true);
  });

  it("utilisé ailleurs depuis : l'annulation le garde et le dit", async () => {
    const { db, tables } = setup({ id: COACH, is_admin: false, is_certified_coach: true });
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: programmeOps() });
    // Un autre athlète l'a dans son programme.
    tables.app_data.push({ athlete_id: "athlete-2", key: "asp:prog", value: [
      { id: "z", name: "Autre", blocs: [{ id: "zb", exercices: [{ id: "ze", exercise_id: "id-1", exercise_name: "Pallof press" }] }] },
    ] });
    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.keptExercises).toEqual(["Pallof press"]);
    expect(tables.exercises.map((e) => e.id)).toEqual(["x-squat", "id-1"]);
  });

  it("retour d'athlète sur l'exercice : gardé aussi", async () => {
    const { db, tables } = setup();
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: programmeOps() });
    tables.workout_exercise_comments.push({ id: "c1", exercise_id: "id-1" });
    expect((await undoSteps(db, A, COACH, res.undo)).keptExercises).toEqual(["Pallof press"]);
  });

  it("même nom créé entre le dépôt et l'application : refus, rien n'est écrit", async () => {
    const { db, tables } = setup();
    const ops = programmeOps();
    tables.exercises.push({ id: "x-other", name: "Pallof Press", is_public: true });
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops })).rejects.toThrow("existe déjà");
    expect(tables.exercises.map((e) => e.id)).toEqual(["x-squat", "x-other"]);
    expect((tables.app_data[0].value as ProgSessionShape[])[0].blocs[0].exercices).toHaveLength(1);
  });

  it("semaine : exercice, séance qui l'utilise et placement, puis annulation complète", async () => {
    const { db, tables } = setup();
    const r = validate("semaine", [
      pallof,
      { op: "create_session", ref: "gainage", name: "Gainage", blocs: [{ name: "Core", exercices: [
        { exercise_ref: "pallof", params: { nb_series: 3, reps: 12 } },
      ] }] },
      { op: "place_session", ref: "gainage", date: "2026-11-19" },
    ]);
    if (!r.ok) throw new Error(r.error);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "semaine", ops: r.value.ops });
    const p = tables.app_data[0].value as ProgSessionShape[];
    expect(p[1].blocs[0].exercices[0].exercise_id).toBe("id-1");
    expect(tables.workout_logs).toHaveLength(1);
    expect(tables.exercises.map((e) => e.id)).toEqual(["x-squat", "id-1"]);

    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.keptExercises).toEqual([]);
    expect(tables.workout_logs).toHaveLength(0);
    expect(tables.app_data[0].value as ProgSessionShape[]).toHaveLength(1);
    expect(tables.exercises.map((e) => e.id)).toEqual(["x-squat"]);
  });

  it("séance déjà faite par l'athlète : séance et exercice restent", async () => {
    const { db, tables } = setup();
    const r = validate("semaine", [
      pallof,
      { op: "create_session", ref: "gainage", name: "Gainage", blocs: [{ name: "Core", exercices: [
        { exercise_ref: "pallof", params: { nb_series: 3, reps: 12 } },
      ] }] },
      { op: "place_session", ref: "gainage", date: "2026-11-19" },
    ]);
    if (!r.ok) throw new Error(r.error);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "semaine", ops: r.value.ops });
    tables.workout_logs[0].status = "completed";
    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.keptExercises).toEqual(["Pallof press"]);
    expect(tables.exercises.map((e) => e.id)).toEqual(["x-squat", "id-1"]);
  });
});
