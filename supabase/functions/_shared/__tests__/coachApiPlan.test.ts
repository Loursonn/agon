/**
 * Planification proposée par l'assistant IA d'un coach : périodisation,
 * compétitions, tests, retraits du planning.
 *
 * Ce qui est vérifié :
 *  - les règles du planning de l'app (lundi → dimanche, pas de
 *    chevauchement, un enfant dans son parent) donnent une erreur lisible ;
 *  - appliquer puis annuler remet la base exactement comme avant, même après
 *    des suppressions en cascade ;
 *  - le réalisé de l'athlète n'est jamais supprimé, et une annulation ne le
 *    touche pas ;
 *  - un journal trafiqué n'écrit jamais chez un autre athlète.
 */
import { describe, expect, it } from "vitest";
import { applyDraft, parseUndo, undoSteps } from "../coachApiApply";
import { type DraftOp, type ProgSessionShape, validateDraft } from "../coachApiOps";
import { emptyPlanState, type PlanState } from "../coachApiPlan";
import { fakeDb, type Row } from "./fakeDb";

const A = "athlete-1";
const B = "athlete-2";
const COACH = "coach-1";
const TODAY = "2026-11-02"; // un lundi

function progRow(): Row {
  const prog: ProgSessionShape[] = [{
    id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
    blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [] }],
  }, {
    id: "s2", name: "Ponctuelle", short: "P", recurrence: "once", multi_semaine: false, blocs: [],
  }];
  return { athlete_id: A, key: "asp:prog", value: prog };
}

/** Un macrocycle, un mésocycle, un cycle de 4 semaines, des séances. */
function world(): Record<string, Row[]> {
  return {
    app_data: [progRow()],
    macrocycles: [{ id: "M1", athlete_id: A, coach_id: COACH, name: "Saison", start_date: "2026-11-02", end_date: "2027-03-28", objective: null, created_at: "t" }],
    mesocycles: [{
      id: "m1", macrocycle_id: "M1", name: "Base", start_date: "2026-11-02", end_date: "2026-12-27", objective: null,
      volume_config: { type: "progressive" }, intensity_config: { zones: [] }, frequency: null, deload_week: null, created_at: "t",
    }],
    cycles: [{ id: "c1", mesocycle_id: "m1", athlete_id: A, coach_id: COACH, name: "Force 1", start_date: "2026-11-02", end_date: "2026-11-29", objective: null, created_at: "t" }],
    microcycles: [1, 2, 3, 4].map((n) => ({
      id: `w${n}`, cycle_id: "c1", week_number: n, is_deload: false, created_at: "t",
      start_date: ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"][n - 1],
      end_date: ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"][n - 1],
    })),
    workout_logs: [
      { id: "L1", athlete_id: A, coach_id: COACH, session_id: "s1", session_name: "Bas du corps", scheduled_date: "2026-11-02", status: "completed", microcycle_id: "w1", created_at: "t" },
      { id: "L2", athlete_id: A, coach_id: COACH, session_id: "s1", session_name: "Bas du corps", scheduled_date: "2026-11-09", status: "planned", microcycle_id: "w2", created_at: "t" },
    ],
    energy_session_assignments: [],
    competitions: [{ id: "K1", athlete_id: A, coach_id: COACH, name: "Hyrox Paris", type: "competition", date: "2027-03-20", location: "Paris", notes: null, priority: "A", athlete_comment: null, macrocycle_id: null, created_at: "t" }],
    hyrox_race_plans: [{ id: "H1", athlete_id: A, competition_id: "K1" }],
    test_sessions: [
      { id: "T1", athlete_id: A, coach_id: COACH, type: "musculation", title: "Squat 1RM", date: "2026-11-20", completed: false, created_at: "t" },
      { id: "T2", athlete_id: A, coach_id: COACH, type: "musculation", title: "Bench 1RM", date: "2026-10-20", completed: true, created_at: "t" },
    ],
    day_themes: [{ id: "D1", athlete_id: A, coach_id: COACH, date: "2026-11-04", label: "Jambes", intensity: "hard", dominante: null, color: "#ef4444", note: "" }],
  };
}

/** Ce que le serveur charge avant de valider (`planState`). */
function stateOf(t: Record<string, Row[]>, athlete = A): PlanState {
  const mine = (rows: Row[] = []) => rows.filter((r) => r.athlete_id === athlete);
  const macros = mine(t.macrocycles);
  const mesos = (t.mesocycles ?? []).filter((m) => macros.some((x) => x.id === m.macrocycle_id));
  const cycles = (t.cycles ?? []).filter((c) => c.athlete_id === athlete || mesos.some((m) => m.id === c.mesocycle_id));
  return {
    ...emptyPlanState(),
    macros, mesos, cycles,
    micros: (t.microcycles ?? []).filter((w) => cycles.some((c) => c.id === w.cycle_id)),
    competitions: mine(t.competitions),
    tests: mine(t.test_sessions).map((x) => ({ ...x, completed: x.completed === true })),
    placements: mine(t.workout_logs).map((l) => ({ session_id: l.session_id, date: l.scheduled_date, status: l.status })),
    energyPlacements: mine(t.energy_session_assignments).map((l) => ({ energy_session_id: l.energy_session_id, date: l.scheduled_date, status: l.status })),
    themeDates: mine(t.day_themes).map((d) => d.date),
  } as unknown as PlanState;
}

let n = 0;
function validate(ops: unknown[], t: Record<string, Row[]> = world()) {
  return validateDraft({ kind: "plan", title: "Plan", ops }, {
    prog: (progRow().value as ProgSessionShape[]),
    newId: () => `n${++n}`,
    today: TODAY,
    energy: new Map(),
    library: new Map(),
    plan: stateOf(t),
  });
}

function ok(ops: unknown[], t?: Record<string, Row[]>): DraftOp[] {
  const r = validate(ops, t);
  if (!r.ok) throw new Error(r.error);
  return r.value.ops;
}

function err(ops: unknown[], t?: Record<string, Row[]>): string {
  const r = validate(ops, t);
  if (r.ok) throw new Error("accepté à tort");
  return r.error;
}

/** Tout ce qui compte, sans l'ordre des lignes. */
function snap(t: Record<string, Row[]>) {
  const out: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(t)) {
    out[k] = [...rows]
      .map(({ updated_at: _u, ...r }) => (k === "day_themes" ? (({ id: _i, ...x }) => x)(r) : r))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

async function roundTrip(ops: DraftOp[], t = world()) {
  const { db, tables } = fakeDb(t);
  const before = snap(structuredClone(tables));
  const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY });
  const after = snap(structuredClone(tables));
  // Le journal passe par la base (jsonb) avant d'être relu.
  const report = await undoSteps(db, A, COACH, parseUndo(JSON.parse(JSON.stringify(res.undo))));
  return { db, tables, before, after, report, undo: res.undo };
}

// ─────────────────────────────── Validation ─────────────────────────────────

describe("plan — validation", () => {
  const build = [
    { op: "create_macrocycle", ref: "mac", name: "Saison 2027", start_date: "2027-04-05", end_date: "2027-09-26", objective: "Hyrox Berlin" },
    { op: "create_mesocycle", ref: "meso", macrocycle_ref: "mac", name: "Accumulation", start_date: "2027-04-05", end_date: "2027-05-30", frequency: 4, deload_week: 4, volume_type: "ondulant", zones: ["Z2", "Z4", "Z2"] },
    { op: "create_cycle", ref: "cyc", mesocycle_ref: "meso", name: "Force 1", start_date: "2027-04-05", end_date: "2027-05-02", deload_weeks: [4] },
    { op: "create_session", ref: "haut", name: "Haut du corps", day_of_week: 2, recurrence: "weekly", blocs: [{ name: "A", exercices: [{ exercise_name: "Développé couché", params: { nb_series: 4, reps: 6 } }] }] },
    { op: "schedule_session_in_cycle", ref: "haut", cycle_ref: "cyc" },
  ];

  it("construit une saison de bout en bout avec des refs", () => {
    const ops = ok(build);
    const cycle = ops.find((o) => o.op === "create_cycle");
    expect(cycle && cycle.op === "create_cycle" && cycle.weeks.map((w) => [w.week_number, w.start_date, w.is_deload])).toEqual([
      [1, "2027-04-05", false], [2, "2027-04-12", false], [3, "2027-04-19", false], [4, "2027-04-26", true],
    ]);
    const meso = ops.find((o) => o.op === "create_mesocycle");
    expect(meso && meso.op === "create_mesocycle" && meso.row).toMatchObject({ intensity_config: { zones: ["Z2", "Z4"] }, volume_config: { type: "ondulant" } });
    const session = ops.find((o) => o.op === "create_session");
    expect(session && session.op === "create_session" && session.session).toMatchObject({ recurrence: "weekly", day_of_week: 2 });
  });

  it("veut des périodes du lundi au dimanche", () => {
    expect(err([{ op: "create_macrocycle", name: "X", start_date: "2027-04-06", end_date: "2027-09-26" }])).toContain("start_date : un lundi attendu");
    expect(err([{ op: "create_macrocycle", name: "X", start_date: "2027-04-05", end_date: "2027-09-25" }])).toContain("end_date : un dimanche attendu");
  });

  it("refuse un mésocycle hors de son macrocycle, ou qui chevauche son voisin", () => {
    expect(err([{ op: "create_mesocycle", macrocycle_id: "M1", name: "X", start_date: "2027-03-01", end_date: "2027-04-04" }]))
      .toContain("doit tenir dans le macrocycle « Saison »");
    expect(err([{ op: "create_mesocycle", macrocycle_id: "M1", name: "X", start_date: "2026-12-21", end_date: "2027-01-31" }]))
      .toContain("chevauche le mésocycle « Base »");
  });

  it("refuse de raccourcir un parent qui laisserait un enfant dehors", () => {
    expect(err([{ op: "update_macrocycle", id: "M1", end_date: "2026-11-29" }])).toContain("le mésocycle « Base »");
  });

  it("ne répartit sur un cycle qu'une séance hebdomadaire avec un jour", () => {
    expect(err([{ op: "schedule_session_in_cycle", session_id: "s2", cycle_id: "c1" }])).toContain("hebdomadaire");
    expect(err([{ op: "create_session", ref: "x", name: "X", recurrence: "weekly", blocs: [{ name: "A", exercices: [{ exercise_name: "Squat", params: { nb_series: 3, reps: 5 } }] }] }]))
      .toContain("day_of_week");
  });

  it("protège le réalisé : test passé, séance faite", () => {
    expect(err([{ op: "delete_test", id: "T2" }])).toContain("déjà passé");
    expect(err([{ op: "update_test", id: "T2", date: "2026-11-30" }])).toContain("déjà passé");
    expect(err([{ op: "remove_placement", session_id: "s1", date: "2026-11-02" }])).toContain("le réalisé reste");
  });

  it("suit l'état opération après opération", () => {
    expect(err([{ op: "delete_macrocycle", id: "M1" }, { op: "update_mesocycle", id: "m1", name: "X" }])).toContain("introuvable");
    // Après la suppression du mésocycle, sa place est libre.
    ok([{ op: "delete_mesocycle", id: "m1" }, { op: "create_mesocycle", macrocycle_id: "M1", name: "Nouveau", start_date: "2026-11-02", end_date: "2026-11-29" }]);
  });

  it("refuse une ref inconnue ou du mauvais type, et les champs inconnus", () => {
    expect(err([{ op: "create_cycle", mesocycle_ref: "nope", name: "X", start_date: "2027-04-05", end_date: "2027-05-02" }])).toContain("mesocycle_ref");
    expect(err([{ op: "create_competition", name: "X", date: "2027-01-10", note: "y" }])).toContain("champ inconnu");
  });

  it("garde les règles d'une semaine pour ses opérations de semaine", () => {
    expect(err([{ op: "place_session", session_id: "s1", date: "2026-10-01" }])).toContain("date passée");
    expect(err([{ op: "nimporte" }])).toContain("create_macrocycle");
  });
});

// ─────────────────────────────── Appliquer / annuler ────────────────────────

describe("plan — appliquer puis annuler", () => {
  it("une saison créée s'annule entièrement", async () => {
    const ops = ok([
      { op: "create_macrocycle", ref: "mac", name: "Saison 2027", start_date: "2027-04-05", end_date: "2027-09-26" },
      { op: "create_mesocycle", ref: "meso", macrocycle_ref: "mac", name: "Accu", start_date: "2027-04-05", end_date: "2027-05-30" },
      { op: "create_cycle", ref: "cyc", mesocycle_ref: "meso", name: "Force", start_date: "2027-04-05", end_date: "2027-05-02" },
      { op: "create_cycle", ref: "now", name: "Bloc de novembre", start_date: "2026-11-30", end_date: "2026-12-13" },
      { op: "create_session", ref: "haut", name: "Haut", day_of_week: 2, recurrence: "weekly", blocs: [{ name: "A", exercices: [{ exercise_name: "Dips", params: { nb_series: 3, reps: 8 } }] }] },
      { op: "schedule_session_in_cycle", ref: "haut", cycle_ref: "now" },
      { op: "create_competition", name: "Hyrox Berlin", date: "2027-09-20", priority: "A" },
      { op: "create_test", title: "VMA", type: "endurance", date: "2026-11-30" },
    ]);
    const { tables, before, after, report } = await roundTrip(ops);
    expect(after.macrocycles).toHaveLength(2);
    expect(after.microcycles).toHaveLength(4 + 4 + 2);
    expect(after.workout_logs.filter((l) => l.session_name === "Haut").map((l) => l.scheduled_date)).toEqual(["2026-12-02", "2026-12-09"]);
    expect(report.kept).toBe(0);
    expect(snap(tables)).toEqual(before);
  });

  it("supprimer un cycle retire le prévu, garde le fait, et l'annulation remet tout", async () => {
    const { db, tables } = fakeDb(world());
    const before = snap(structuredClone(tables));
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops: ok([{ op: "delete_cycle", id: "c1" }]), today: TODAY });

    expect(tables.cycles).toEqual([]);
    expect(tables.microcycles).toEqual([]);
    // La séance faite reste, détachée de sa semaine ; la prévue est partie.
    expect(tables.workout_logs).toEqual([expect.objectContaining({ id: "L1", status: "completed", microcycle_id: null })]);

    await undoSteps(db, A, COACH, parseUndo(JSON.parse(JSON.stringify(res.undo))));
    expect(snap(tables)).toEqual(before);
  });

  it("supprimer un macrocycle emporte tout son contenu, et revient", async () => {
    const { before, after, tables } = await roundTrip(ok([{ op: "delete_macrocycle", id: "M1" }]));
    expect(after.mesocycles).toEqual([]);
    expect(after.cycles).toEqual([]);
    expect(snap(tables)).toEqual(before);
  });

  it("déplacer un cycle refait ses semaines, et revient", async () => {
    const { before, after, tables } = await roundTrip(ok([{ op: "update_cycle", id: "c1", start_date: "2026-11-09", end_date: "2026-12-13" }]));
    expect(after.microcycles.map((w) => [w.start_date, w.week_number]).sort()).toEqual([
      ["2026-11-09", 1], ["2026-11-16", 2], ["2026-11-23", 3], ["2026-11-30", 4], ["2026-12-07", 5],
    ]);
    // Semaine 1 retirée : sa séance faite reste, détachée.
    expect(after.workout_logs.find((l) => l.id === "L1")).toMatchObject({ status: "completed", microcycle_id: null });
    expect(snap(tables)).toEqual(before);
  });

  it("une compétition supprimée revient avec son plan de course", async () => {
    const { after, before, tables } = await roundTrip(ok([{ op: "delete_competition", id: "K1" }]));
    expect(after.competitions).toEqual([]);
    expect(after.hyrox_race_plans).toEqual([{ id: "H1", athlete_id: A, competition_id: null }]);
    expect(snap(tables)).toEqual(before);
  });

  it("retirer : séance sautée, énergie et thème supprimés ; tout revient", async () => {
    const t = world();
    t.energy_session_assignments = [{ id: "E1", athlete_id: A, coach_id: COACH, energy_session_id: "es1", scheduled_date: "2026-11-05", status: "planned", microcycle_id: null, notes: null, created_at: "t" }];
    const { after, before, tables } = await roundTrip(ok([
      { op: "remove_placement", session_id: "s1", date: "2026-11-09" },
      { op: "remove_energy_placement", energy_session_id: "es1", date: "2026-11-05" },
      { op: "remove_day_theme", date: "2026-11-04" },
      { op: "update_test", id: "T1", date: "2026-11-27" },
      { op: "set_week_deload", cycle_id: "c1", week_number: 4, is_deload: true },
    ], t), t);
    expect(after.workout_logs.find((l) => l.id === "L2")?.status).toBe("skipped");
    expect(after.energy_session_assignments).toEqual([]);
    expect(after.day_themes).toEqual([]);
    expect(snap(tables)).toEqual(before);
  });
});

describe("plan — ce que l'annulation ne touche pas", () => {
  it("une séance retirée que l'athlète a faite depuis reste faite", async () => {
    const { db, tables } = fakeDb(world());
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops: ok([{ op: "remove_placement", session_id: "s1", date: "2026-11-09" }]), today: TODAY });
    tables.workout_logs.find((l) => l.id === "L2")!.status = "completed";
    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.kept).toBe(1);
    expect(tables.workout_logs.find((l) => l.id === "L2")?.status).toBe("completed");
  });

  it("un macrocycle créé où le coach a ajouté un mésocycle depuis reste", async () => {
    const { db, tables } = fakeDb(world());
    const ops = ok([{ op: "create_macrocycle", name: "Saison 2027", start_date: "2027-04-05", end_date: "2027-09-26" }]);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY });
    const macroId = (ops[0] as Extract<DraftOp, { op: "create_macrocycle" }>).row.id;
    tables.mesocycles.push({ id: "m-coach", macrocycle_id: macroId, name: "À la main", start_date: "2027-04-05", end_date: "2027-04-25" });
    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.kept).toBe(1);
    expect(tables.macrocycles.map((m) => m.id)).toContain(macroId);
  });

  it("un test planifié puis passé reste", async () => {
    const { db, tables } = fakeDb(world());
    const ops = ok([{ op: "create_test", title: "VMA", date: "2026-11-30" }]);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY });
    tables.test_sessions.find((x) => x.title === "VMA")!.completed = true;
    expect((await undoSteps(db, A, COACH, res.undo)).kept).toBe(1);
    expect(tables.test_sessions.some((x) => x.title === "VMA")).toBe(true);
  });
});

describe("plan — sûreté", () => {
  it("une panne en route défait ce qui était déjà écrit", async () => {
    const { db, tables } = fakeDb(world(), { table: "microcycles", op: "insert" });
    const before = snap(structuredClone(tables));
    const ops = ok([
      { op: "create_macrocycle", ref: "mac", name: "Saison 2027", start_date: "2027-04-05", end_date: "2027-09-26" },
      { op: "delete_competition", id: "K1" },
      { op: "create_cycle", name: "Force", start_date: "2027-04-05", end_date: "2027-05-02" },
    ]);
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY })).rejects.toThrow("panne simulée");
    expect(snap(tables)).toEqual(before);
  });

  it("un journal trafiqué n'écrit jamais chez un autre athlète", async () => {
    const other = {
      macrocycles: [{ id: "MB", athlete_id: B, name: "Autre", start_date: "2026-11-02", end_date: "2027-01-31" }],
      mesocycles: [{ id: "mB", macrocycle_id: "MB", name: "Autre", start_date: "2026-11-02", end_date: "2026-11-29" }],
      cycles: [{ id: "cB", mesocycle_id: "mB", athlete_id: B, name: "Autre", start_date: "2026-11-02", end_date: "2026-11-29" }],
      microcycles: [{ id: "wB", cycle_id: "cB", week_number: 1, start_date: "2026-11-02", end_date: "2026-11-08", is_deload: false }],
      workout_logs: [{ id: "LB", athlete_id: B, session_id: "x", scheduled_date: "2026-11-03", status: "completed", microcycle_id: null }],
      competitions: [{ id: "KB", athlete_id: B, name: "Autre", date: "2027-01-01" }],
    };
    const { db, tables } = fakeDb({ ...world(), ...Object.fromEntries(Object.entries(other).map(([k, v]) => [k, [...(world()[k] ?? []), ...v]])) });
    const before = snap(structuredClone(tables));
    await undoSteps(db, A, COACH, parseUndo([
      { t: "updated", table: "mesocycles", rows: [{ id: "mB", name: "piraté" }] },
      { t: "updated", table: "microcycles", rows: [{ id: "wB", is_deload: true }] },
      { t: "updated", table: "competitions", rows: [{ id: "KB", name: "piraté" }] },
      { t: "deleted", table: "mesocycles", rows: [{ id: "mX", macrocycle_id: "MB", name: "intrus", start_date: "2026-12-07", end_date: "2026-12-27" }] },
      { t: "deleted", table: "microcycles", rows: [{ id: "wX", cycle_id: "cB", week_number: 2, start_date: "2026-11-09", end_date: "2026-11-15" }] },
      { t: "relink", table: "workout_logs", rows: [{ id: "LB", value: "wB" }] },
      { t: "inserted", table: "mesocycles", ids: ["mB"] },
      { t: "inserted", table: "macrocycles", ids: ["MB"] },
      { t: "deleted", table: "profiles", rows: [{ id: "x" }] },
    ]), true);
    expect(snap(tables)).toEqual(before);
  });

  it("une ligne recréée appartient toujours à l'athlète du journal", async () => {
    const { db, tables } = fakeDb(world());
    await undoSteps(db, A, COACH, parseUndo([
      { t: "deleted", table: "competitions", rows: [{ id: "KX", athlete_id: B, coach_id: COACH, name: "X", date: "2027-01-01", type: "competition", priority: "A" }] },
    ]));
    expect(tables.competitions.find((c) => c.id === "KX")?.athlete_id).toBe(A);
  });
});
