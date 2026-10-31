/**
 * Fiches et habitudes proposées par l'assistant IA d'un coach.
 *
 * Ce qui est vérifié :
 *  - l'assistant ne donne que les fiches du coach, ne touche ni à une séance
 *    énergétique partagée, ni aux habitudes que l'athlète s'est données ;
 *  - appliquer puis annuler remet la base exactement comme avant, attributions
 *    issues des séances comprises ;
 *  - une habitude cochée depuis reste, et le suivi avec elle ;
 *  - une panne en route ou un journal trafiqué n'écrit rien de travers ;
 *  - ce qui sort à la lecture : jamais le nom d'une habitude de l'athlète.
 */
import { describe, expect, it } from "vitest";
import { applyDraft, parseUndo, undoSteps } from "../coachApiApply";
import { type DraftOp, type ProgSessionShape, validateDraft } from "../coachApiOps";
import { emptyPlanState, type PlanState } from "../coachApiPlan";
import { syncFicheAssignments } from "../coachApiCareApply";
import { buildFiches, buildHabits } from "../coachApiRead";
import { fakeDb, type Row } from "./fakeDb";

const A = "athlete-1";
const B = "athlete-2";
const COACH = "coach-1";
const OTHER_COACH = "coach-2";
const TODAY = "2026-11-02";

function prog(): ProgSessionShape[] {
  return [{
    id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
    blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [], fiches: [{ id: "att-b", doc_id: "F1" }] }],
  } as ProgSessionShape, {
    id: "s2", name: "Haut du corps", short: "B", day_of_week: 2, recurrence: "weekly", multi_semaine: false, blocs: [],
    fiches: [{ id: "att-s2", doc_id: "F3" }],
  } as ProgSessionShape];
}

function world(): Record<string, Row[]> {
  return {
    app_data: [{ athlete_id: A, key: "asp:prog", value: prog() }],
    profiles: [{ id: A, habit_tracker_enabled: false }, { id: B, habit_tracker_enabled: true }],
    docs: [
      { id: "F1", coach_id: COACH, athlete_id: null, uploaded_by: COACH, title: "Mobilité hanches", tags: [], archived_at: null },
      { id: "F2", coach_id: COACH, athlete_id: null, uploaded_by: COACH, title: "Gainage (Claude)", tags: ["claude"], archived_at: null },
      { id: "F3", coach_id: COACH, athlete_id: A, uploaded_by: COACH, title: "Plan perso", tags: [], archived_at: null },
      { id: "F4", coach_id: COACH, athlete_id: null, uploaded_by: COACH, title: "Pacing", tags: ["claude"], archived_at: null },
      { id: "FX", coach_id: OTHER_COACH, athlete_id: null, uploaded_by: OTHER_COACH, title: "Autre coach", tags: [], archived_at: null },
    ],
    doc_assignments: [
      // Cohérent avec les séances : F1 (bloc de s1), F3 (s2), F5 manuelle.
      { id: "DA1", doc_id: "F1", athlete_id: A, assigned_by: COACH, source: "programme", coach_note: null, seen_at: "2026-10-01", created_at: "t" },
      { id: "DA2", doc_id: "F3", athlete_id: A, assigned_by: COACH, source: "programme", coach_note: null, seen_at: null, created_at: "t" },
      { id: "DA3", doc_id: "F4", athlete_id: A, assigned_by: COACH, source: "manuel", coach_note: "Pour ta course", seen_at: null, created_at: "t" },
      { id: "DB1", doc_id: "F4", athlete_id: B, assigned_by: COACH, source: "manuel", coach_note: null, seen_at: null, created_at: "t" },
    ],
    energy_sessions: [
      { id: "E-own", athlete_id: A, name: "Footing A", fiches: [] },
      { id: "E-lib", athlete_id: null, name: "Fractionné banque", fiches: [] },
      { id: "E-B", athlete_id: B, name: "Footing B", fiches: [] },
    ],
    energy_session_assignments: [],
    workout_logs: [],
    habits: [
      { id: "H1", athlete_id: A, name: "Prendre mon traitement", emoji: "coeur", color: "#FF5A33", is_active: true, sort_order: 0, created_by: null, created_at: "t" },
      { id: "H2", athlete_id: A, name: "Étirements", emoji: "wellness", color: "#33B5FF", is_active: true, sort_order: 1, created_by: COACH, created_at: "t" },
      { id: "HB", athlete_id: B, name: "Lecture", emoji: "cerveau", color: "#33B5FF", is_active: true, sort_order: 0, created_by: COACH, created_at: "t" },
    ],
    habit_logs: [],
  };
}

/** Ce que le serveur charge avant de valider (`careState`). */
function stateOf(t: Record<string, Row[]>): PlanState {
  const docs = t.docs.filter((d) => d.coach_id === COACH && !d.archived_at && (d.athlete_id === null || d.athlete_id === A));
  return {
    ...emptyPlanState(),
    fiches: docs.map((d) => ({
      id: d.id, title: d.title, bank: d.athlete_id === null, claude: (d.tags as string[]).includes("claude"),
      shared: t.doc_assignments.some((a) => a.doc_id === d.id && a.athlete_id !== A),
    })),
    manualFiches: t.doc_assignments.filter((a) => a.athlete_id === A && a.source === "manuel").map((a) => a.doc_id),
    energyOwned: t.energy_sessions.filter((e) => e.athlete_id === A),
    habits: t.habits.filter((h) => h.athlete_id === A && h.is_active).map((h) => ({ id: h.id, name: h.created_by ? h.name : null, mine: !!h.created_by })),
    habitTracker: t.profiles.find((p) => p.id === A)?.habit_tracker_enabled === true,
  } as unknown as PlanState;
}

let n = 0;
function validate(ops: unknown[], t = world()) {
  return validateDraft({ kind: "plan", title: "Plan", ops }, {
    prog: (t.app_data[0].value as ProgSessionShape[]),
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

function snap(t: Record<string, Row[]>) {
  const out: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(t)) {
    out[k] = [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

// ─────────────────────────────── Validation ─────────────────────────────────

describe("fiches — validation", () => {
  it("ne donne que les fiches du coach, une seule fois", () => {
    expect(err([{ op: "assign_fiche", fiche_id: "FX" }])).toContain("introuvable");
    expect(err([{ op: "assign_fiche", fiche_id: "F4" }])).toContain("déjà attribuée");
    expect(err([{ op: "assign_fiche", fiche_id: "F1" }, { op: "assign_fiche", fiche_id: "F1" }])).toContain("déjà attribuée");
    expect(err([{ op: "unassign_fiche", fiche_id: "F1" }])).toContain("detach_fiche");
    ok([{ op: "assign_fiche", fiche_id: "F1", note: "Avant chaque séance" }]);
  });

  it("ne range en perso qu'une fiche de l'assistant donnée à personne d'autre", () => {
    expect(err([{ op: "assign_fiche", fiche_id: "F1", perso: true }])).toContain("seule une fiche déposée par l'assistant");
    const t = world();
    t.doc_assignments.push({ id: "DB2", doc_id: "F2", athlete_id: B, source: "manuel" });
    expect(err([{ op: "assign_fiche", fiche_id: "F2", perso: true }], t)).toContain("d'autres athlètes");
    expect(err([{ op: "assign_fiche", fiche_id: "F3", perso: true }])).toContain("déjà personnelle");
    ok([{ op: "assign_fiche", fiche_id: "F2", perso: true }]);
  });

  it("ne rattache qu'aux séances de l'athlète, pas à la bibliothèque partagée", () => {
    expect(err([{ op: "attach_fiche", fiche_id: "F1", energy_session_id: "E-lib" }])).toContain("bibliothèque");
    expect(err([{ op: "attach_fiche", fiche_id: "F1", energy_session_id: "E-B" }])).toContain("introuvable");
    expect(err([{ op: "attach_fiche", fiche_id: "F3", session_id: "s2" }])).toContain("déjà rattachée");
    expect(err([{ op: "attach_fiche", fiche_id: "F1", session_id: "s2", energy_session_id: "E-own" }])).toContain("une seule séance");
    expect(err([{ op: "detach_fiche", fiche_id: "F1", session_id: "s1" }])).toContain("un de ses blocs");
    // Une séance créée plus haut dans la proposition se reçoit par sa ref.
    ok([
      { op: "create_session", ref: "x", name: "Nouvelle", blocs: [{ name: "A", exercices: [{ exercise_name: "Dips", params: { nb_series: 3, reps: 8 } }] }] },
      { op: "attach_fiche", fiche_id: "F1", ref: "x" },
      { op: "create_energy_session", ref: "e", name: "VMA", session_kind: "vo2", intervals: [{ type: "interval", role: "work", duration: { kind: "time", value: 600 } }] },
      { op: "attach_fiche", fiche_id: "F1", energy_ref: "e" },
    ]);
    // Détacher puis rattacher dans la même proposition.
    ok([{ op: "detach_fiche", fiche_id: "F3", session_id: "s2" }, { op: "attach_fiche", fiche_id: "F3", session_id: "s2" }]);
  });
});

describe("habitudes — validation", () => {
  it("ne touche pas aux habitudes que l'athlète s'est données", () => {
    expect(err([{ op: "update_habit", id: "H1", name: "x" }])).toContain("lui appartient");
    expect(err([{ op: "remove_habit", id: "H1" }])).toContain("lui appartient");
    expect(err([{ op: "remove_habit", id: "HB" }])).toContain("introuvable");
    ok([{ op: "update_habit", id: "H2", name: "Étirements du soir", icon: "lune" }, { op: "remove_habit", id: "H2" }]);
  });

  it("active le suivi à la première habitude seulement, refuse un doublon", () => {
    const ops = ok([{ op: "create_habit", name: "Hydratation 2 L" }, { op: "create_habit", name: "Coucher 23 h", icon: "sommeil", color: "#33B5FF" }]);
    expect(ops.map((o) => (o as Extract<DraftOp, { op: "create_habit" }>).enable_tracker)).toEqual([true, false]);
    expect(err([{ op: "create_habit", name: "étirements" }])).toContain("déjà");
    expect(err([{ op: "create_habit", name: "X", icon: "licorne" }])).toContain("icon");
    expect(err([{ op: "create_habit", name: "X", color: "#000000" }])).toContain("color");
  });
});

// ─────────────────────────────── Appliquer / annuler ────────────────────────

async function apply(ops: DraftOp[], t = world(), failOn?: { table: string; op: string }) {
  const { db, tables } = fakeDb(t, failOn);
  const before = snap(structuredClone(tables));
  const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY });
  return { db, tables, before, res };
}

describe("fiches et habitudes — appliquer puis annuler", () => {
  it("tout revient exactement, attributions des séances comprises", async () => {
    const ops = ok([
      { op: "assign_fiche", fiche_id: "F2", perso: true, note: "Ta routine" },
      { op: "unassign_fiche", fiche_id: "F4" },
      { op: "attach_fiche", fiche_id: "F1", session_id: "s2" },
      { op: "detach_fiche", fiche_id: "F3", session_id: "s2" },
      // s1 n'a pas de liste de fiches : l'annulation doit la laisser sans.
      { op: "attach_fiche", fiche_id: "F4", session_id: "s1" },
      { op: "attach_fiche", fiche_id: "F1", energy_session_id: "E-own" },
      { op: "create_habit", name: "Hydratation 2 L" },
      { op: "update_habit", id: "H2", name: "Étirements du soir" },
    ]);
    const { db, tables, before, res } = await apply(ops);

    expect(tables.docs.find((d) => d.id === "F2")?.athlete_id).toBe(A);
    // La séance énergie n'est pas au planning de l'athlète : sa fiche ne lui
    // est attribuée qu'une fois la séance placée, comme dans l'app.
    expect(tables.doc_assignments.filter((a) => a.athlete_id === A).map((a) => `${a.doc_id}:${a.source}`).sort())
      .toEqual(["F1:programme", "F2:manuel", "F4:programme"]);
    expect(tables.energy_sessions.find((e) => e.id === "E-own")?.fiches).toEqual([expect.objectContaining({ doc_id: "F1" })]);
    // F1 était déjà attribuée par une séance : sa ligne (et « vue ») reste.
    expect(tables.doc_assignments.find((a) => a.id === "DA1")?.seen_at).toBe("2026-10-01");
    const s2 = (tables.app_data[0].value as ProgSessionShape[]).find((s) => s.id === "s2") as { fiches: { doc_id: string }[] };
    expect(s2.fiches.map((f) => f.doc_id)).toEqual(["F1"]);
    expect(tables.profiles.find((p) => p.id === A)?.habit_tracker_enabled).toBe(true);
    expect(tables.habits.find((h) => h.name === "Hydratation 2 L")).toMatchObject({ created_by: COACH, sort_order: 2, emoji: "habitude" });
    // L'athlète B n'a pas bougé.
    expect(tables.doc_assignments.find((a) => a.id === "DB1")).toBeTruthy();

    const report = await undoSteps(db, A, COACH, parseUndo(JSON.parse(JSON.stringify(res.undo))));
    expect(report.kept).toBe(0);
    // Une attribution issue d'une séance détachée puis remise est recréée par
    // la synchronisation (comme dans l'app) : nouvel id, valeurs par défaut de
    // la base. On compare ce qui la définit.
    const strip = (s: Record<string, Row[]>) => ({
      ...s,
      doc_assignments: s.doc_assignments
        .map((r) => (r.source === "manuel" ? r : { doc_id: r.doc_id, athlete_id: r.athlete_id, source: r.source }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    });
    expect(strip(snap(tables))).toEqual(strip(before));
  });

  it("une habitude cochée depuis reste, et le suivi avec elle", async () => {
    const { db, tables, res } = await apply(ok([{ op: "create_habit", name: "Hydratation 2 L" }, { op: "remove_habit", id: "H2" }]));
    const h = tables.habits.find((x) => x.name === "Hydratation 2 L")!;
    expect(tables.habits.find((x) => x.id === "H2")?.is_active).toBe(false);
    tables.habit_logs.push({ id: "log1", habit_id: h.id, athlete_id: A, date: "2026-11-02" });
    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.kept).toBe(1);
    expect(tables.habits.some((x) => x.id === h.id)).toBe(true);
    expect(tables.profiles.find((p) => p.id === A)?.habit_tracker_enabled).toBe(true);
    expect(tables.habits.find((x) => x.id === "H2")?.is_active).toBe(true);
  });

  it("une panne en route défait tout, suivi des habitudes compris", async () => {
    const ops = ok([
      { op: "assign_fiche", fiche_id: "F2", perso: true },
      { op: "attach_fiche", fiche_id: "F1", session_id: "s2" },
      { op: "create_habit", name: "Hydratation 2 L" },
    ]);
    // Le suivi vient d'être activé quand l'habitude échoue.
    const { db, tables } = fakeDb(world(), { table: "habits", op: "insert" });
    const before = snap(structuredClone(tables));
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY })).rejects.toThrow("panne simulée");
    expect(snap(tables)).toEqual(before);
  });

  it("une fiche donnée à un autre athlète entre-temps ne devient pas perso", async () => {
    const ops = ok([{ op: "assign_fiche", fiche_id: "F2", perso: true }]);
    const t = world();
    t.doc_assignments.push({ id: "DB2", doc_id: "F2", athlete_id: B, source: "manuel" });
    const { db, tables } = fakeDb(t);
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "plan", ops, today: TODAY })).rejects.toThrow("ne peut plus devenir personnelle");
    expect(tables.docs.find((d) => d.id === "F2")?.athlete_id).toBeNull();
  });
});

describe("fiches et habitudes — sûreté", () => {
  it("un journal trafiqué n'écrit jamais chez un autre athlète ou un autre coach", async () => {
    const t = world();
    t.docs.push({ id: "FB", coach_id: COACH, athlete_id: B, title: "Perso B", tags: ["claude"] });
    const { db, tables } = fakeDb(t);
    const before = snap(structuredClone(tables));
    await undoSteps(db, A, COACH, parseUndo([
      { t: "fiche_perso", doc_id: "FB" },
      { t: "fiche_link", target: "energy", session_id: "E-B", attachment_id: "x" },
      { t: "fiche_unlink", target: "energy", session_id: "E-B", items: [{ index: 0, attachment: { id: "y", doc_id: "FX" } }] },
      { t: "inserted", table: "habits", ids: ["HB"] },
      { t: "updated", table: "habits", rows: [{ id: "HB", name: "piraté" }] },
      { t: "inserted", table: "doc_assignments", ids: ["DB1"] },
      { t: "deleted", table: "doc_assignments", rows: [{ id: "DZ", doc_id: "F1", athlete_id: B, source: "manuel" }] },
    ]), true);
    const after = snap(tables);
    // Seul changement permis : la ligne recréée l'est chez A, avec la fiche F1 du coach.
    expect(after.doc_assignments.find((a) => a.id === "DZ")).toMatchObject({ athlete_id: A });
    expect({ ...after, doc_assignments: after.doc_assignments.filter((a) => a.id !== "DZ") }).toEqual(before);
  });
});

describe("fiches — synchronisation des attributions", () => {
  it("suit séances, overrides et séances énergie, sans toucher au manuel ni aux fiches d'un autre coach", async () => {
    const t = world();
    t.app_data[0].value = [{ id: "s1", name: "X", blocs: [], fiches: [{ id: "a", doc_id: "F2", weeks: { 3: "FX" } }] }];
    t.workout_logs = [{ id: "L1", athlete_id: A, athlete_modifications: { coachOverride: { blocs: [{ fiches: [{ id: "o", doc_id: "F1" }] }] } } }];
    t.energy_sessions.find((e) => e.id === "E-lib")!.fiches = [{ id: "e", doc_id: "F4" }];
    t.energy_session_assignments = [{ id: "EA", athlete_id: A, energy_session_id: "E-lib" }];
    const { db, tables } = fakeDb(t);
    await syncFicheAssignments(db, A, COACH);
    const mine = tables.doc_assignments.filter((a) => a.athlete_id === A).map((a) => `${a.doc_id}:${a.source}`).sort();
    expect(mine).toEqual(["F1:programme", "F2:programme", "F4:energie", "F4:manuel"]);
    // F1 gardée telle quelle (vue), F3 partie (plus rattachée), FX jamais (autre coach).
    expect(tables.doc_assignments.find((a) => a.id === "DA1")?.seen_at).toBe("2026-10-01");
    expect(tables.doc_assignments.find((a) => a.id === "DB1")).toBeTruthy();
  });
});

// ─────────────────────────────── Lecture ────────────────────────────────────

describe("lecture — habitudes et fiches", () => {
  it("le nom d'une habitude de l'athlète ne sort pas, son assiduité si", () => {
    const out = buildHabits({
      today: "2026-11-02",
      tracker: true,
      habits: [
        { id: "H1", name: "Prendre mon traitement", emoji: "coeur", color: "#FF5A33", created_by: null, sort_order: 0 },
        { id: "H2", name: "Étirements", emoji: "wellness", color: "#33B5FF", created_by: COACH, sort_order: 1 },
      ],
      logs: [
        { habit_id: "H1", date: "2026-11-02" }, { habit_id: "H1", date: "2026-10-30" }, { habit_id: "H1", date: "2026-10-10" },
        { habit_id: "H2", date: "2026-10-01" },
      ],
    });
    expect(JSON.stringify(out)).not.toContain("traitement");
    expect(JSON.stringify(out)).not.toContain("coeur");
    expect(out.habitudes[0]).toMatchObject({ posee_par: "athlete", nom: null, jours_coches_7j: 2, jours_coches_28j: 3, derniere_coche: "2026-11-02" });
    expect(out.habitudes[1]).toMatchObject({ posee_par: "coach", nom: "Étirements", jours_coches_28j: 0 });
  });

  it("fiches : rangement, origine, attributions et rattachements", () => {
    const out = buildFiches({
      docs: [
        { id: "F2", title: "Gainage", description: null, category: "prevention", kind: "pdf", athlete_id: null, origin_id: null, variant_label: null, tags: ["claude"] },
        { id: "F3", title: "Plan perso", description: "x", category: "autre", kind: "image", athlete_id: A, origin_id: null, variant_label: null, tags: [] },
      ],
      assignments: [{ doc_id: "F3", source: "programme", coach_note: null, seen_at: "t" }],
      links: [{ doc_id: "F3", session_id: "s2", session_name: "Haut", type: "muscu" }],
    });
    expect(out.fiches.map((f) => [f.rangement, f.deposee_par_claude, f.format])).toEqual([["banque", true, "pdf"], ["perso", false, "image"]]);
    expect(out.attribuees[0]).toMatchObject({ titre: "Plan perso", vue: true, attribuee: "par une séance de musculation" });
    expect(out.rattachees[0]).toEqual({ fiche_id: "F3", titre: "Plan perso", session_id: "s2", seance: "Haut" });
  });
});
