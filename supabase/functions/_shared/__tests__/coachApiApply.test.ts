/**
 * Application et annulation des propositions de l'assistant IA.
 *
 * La promesse faite au coach : tout ce que l'assistant inscrit s'annule et
 * revient exactement comme avant ; une application qui échoue en route ne
 * laisse rien ; et ce que l'athlète a réalisé entre-temps n'est jamais
 * effacé par une annulation.
 *
 * Base simulée en mémoire : juste ce que le moteur utilise de supabase-js.
 */
import { describe, expect, it } from "vitest";
import { applyDraft, type Db, parseUndo, UndoConflict, undoSteps } from "../coachApiApply";
import { type ProgSessionShape, validateDraft, type DraftOp } from "../coachApiOps";

type Row = Record<string, unknown>;

/** Clés d'unicité utilisées par les upserts (`onConflict`). */
const PK: Record<string, string[]> = {
  app_data: ["athlete_id", "key"],
  day_themes: ["athlete_id", "date"],
  workout_logs: ["athlete_id", "session_id", "scheduled_date"],
};

let seq = 0;

function fakeDb(initial: Record<string, Row[]> = {}, failOn?: { table: string; op: string }) {
  const tables: Record<string, Row[]> = structuredClone(initial);
  const t = (name: string) => (tables[name] ??= []);

  const db: Db = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "insert" | "upsert" | "delete" = "select";
      let payload: Row[] = [];
      let opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
      let single: "one" | "maybe" | null = null;

      const exec = () => {
        if (failOn && failOn.table === table && failOn.op === op) return { data: null, error: { message: "panne simulée" } };
        const rows = t(table);
        let out: Row[] = [];
        if (op === "select") out = rows.filter((r) => filters.every((f) => f(r)));
        else if (op === "delete") {
          out = rows.filter((r) => filters.every((f) => f(r)));
          tables[table] = rows.filter((r) => !out.includes(r));
        } else if (op === "insert") {
          out = payload.map((p) => ({ id: p.id ?? `row-${++seq}`, ...p }));
          rows.push(...out);
        } else {
          const keys = opts.onConflict?.split(",") ?? PK[table];
          for (const p of payload) {
            const found = rows.find((r) => keys.every((k) => r[k] === p[k]));
            if (found) {
              if (opts.ignoreDuplicates) continue;
              Object.assign(found, p);
              out.push(found);
            } else {
              const row = { id: `row-${++seq}`, ...p };
              rows.push(row);
              out.push(row);
            }
          }
        }
        const copy = structuredClone(out);
        if (single === "one") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: "pas une ligne" } };
        if (single === "maybe") return { data: copy[0] ?? null, error: null };
        return { data: copy, error: null };
      };

      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        insert: (p: Row | Row[]) => ((op = "insert"), (payload = structuredClone(Array.isArray(p) ? p : [p])), q),
        upsert: (p: Row | Row[], o = {}) => ((op = "upsert"), (payload = structuredClone(Array.isArray(p) ? p : [p])), (opts = o), q),
        delete: () => ((op = "delete"), q),
        single: () => ((single = "one"), q),
        maybeSingle: () => ((single = "maybe"), q),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      };
      return q;
    },
  };
  return { db, tables };
}

const A = "athlete-1";
const COACH = "coach-1";
const TODAY = "2026-11-02";

function progRow(): Row {
  const prog: ProgSessionShape[] = [{
    id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
    blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [
      { id: "e1", exercise_id: "x", exercise_name: "Squat", mode: "classique", sort_order: 0,
        params: { nb_series: 4, reps: { mode: "global", value: 8 }, reps_mode: { mode: "global", value: "EC" }, charge_unit: "kg",
          charge: { mode: "global", value: 100 }, rir: { mode: "global", value: 2 }, tempo: { mode: "global", value: "" } } },
    ] }],
  }];
  return { athlete_id: A, key: "asp:prog", value: prog };
}

function initial(): Record<string, Row[]> {
  return {
    app_data: [progRow()],
    day_themes: [{ id: "t-old", athlete_id: A, coach_id: COACH, date: "2026-11-04", label: "Ancien", intensity: "easy", dominante: null, color: "#22c55e", note: "" }],
    workout_logs: [],
    energy_sessions: [],
    energy_session_assignments: [],
  };
}

let n = 0;
function weekOps(): DraftOp[] {
  const r = validateDraft({
    kind: "semaine", title: "S45", ops: [
      { op: "create_session", ref: "f", name: "Force haut", blocs: [{ name: "A", exercices: [{ exercise_name: "Développé couché", params: { nb_series: 5, reps: 5 } }] }] },
      { op: "create_energy_session", ref: "v", name: "VMA", session_kind: "vo2", intervals: [
        { type: "interval", role: "work", duration: { kind: "time", value: 600 } },
      ] },
      { op: "place_session", date: "2026-11-03", ref: "f" },
      { op: "place_session", date: "2026-11-05", session_id: "s1" },
      { op: "place_energy_session", date: "2026-11-04", ref: "v" },
      { op: "set_day_theme", date: "2026-11-03", intensity: "hard", dominante: "force" },
      { op: "set_day_theme", date: "2026-11-04", label: "Nouveau", intensity: "moyen" },
    ],
  }, { prog: progRow().value as ProgSessionShape[], newId: () => `n-${++n}`, today: TODAY, energy: new Map() });
  if (!r.ok) throw new Error(r.error);
  return r.value.ops;
}

/** État comparable : ce que l'athlète verrait. */
function snapshot(tables: Record<string, Row[]>) {
  const strip = (rows: Row[] = []) => rows.map(({ id: _id, updated_at: _u, ...r }) => r);
  return {
    app_data: tables.app_data,
    day_themes: strip(tables.day_themes),
    workout_logs: tables.workout_logs ?? [],
    energy_sessions: tables.energy_sessions ?? [],
    energy_session_assignments: tables.energy_session_assignments ?? [],
  };
}

describe("semaine — appliquer puis annuler", () => {
  it("annuler remet tout exactement comme avant", async () => {
    const { db, tables } = fakeDb(initial());
    const before = snapshot(structuredClone(tables));
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "semaine", ops: weekOps() });

    expect((tables.app_data[0].value as ProgSessionShape[]).map((s) => s.name)).toEqual(["Bas du corps", "Force haut"]);
    expect(tables.workout_logs).toHaveLength(2);
    expect(tables.energy_sessions[0]).toMatchObject({ name: "VMA", athlete_id: A, total_duration_s: 600 });
    expect(tables.energy_session_assignments).toHaveLength(1);
    expect(tables.day_themes.find((t) => t.date === "2026-11-04")).toMatchObject({ label: "Nouveau" });

    // Le journal passe par la base (jsonb) avant d'être relu.
    const report = await undoSteps(db, A, COACH, parseUndo(JSON.parse(JSON.stringify(res.undo))));
    expect(report.kept).toBe(0);
    expect(snapshot(tables)).toEqual(before);
  });

  it("garde ce que l'athlète a réalisé, et la séance qui va avec", async () => {
    const { db, tables } = fakeDb(initial());
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "semaine", ops: weekOps() });
    const done = tables.workout_logs.find((l) => l.scheduled_date === "2026-11-03")!;
    done.status = "completed";

    const report = await undoSteps(db, A, COACH, res.undo);
    expect(report.kept).toBe(2); // la séance faite et sa définition
    expect(tables.workout_logs).toEqual([done]);
    const names = (tables.app_data[0].value as ProgSessionShape[]).map((s) => s.name);
    expect(names).toEqual(["Bas du corps", "Force haut"]);
  });

  it("une panne en route défait ce qui était déjà écrit", async () => {
    const { db, tables } = fakeDb(initial(), { table: "day_themes", op: "upsert" });
    const before = snapshot(structuredClone(tables));
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "semaine", ops: weekOps() })).rejects.toThrow("panne simulée");
    expect(snapshot(tables)).toEqual(before);
  });

  it("ne supprime jamais chez un autre athlète, même avec un journal trafiqué", async () => {
    const other = { id: "autre", athlete_id: "athlete-2", status: "planned", session_id: "s9", scheduled_date: TODAY };
    const { db, tables } = fakeDb({ ...initial(), workout_logs: [other] });
    await undoSteps(db, A, COACH, parseUndo([{ t: "inserted", table: "workout_logs", ids: ["autre"] }, { t: "inserted", table: "profiles", ids: ["x"] }]));
    expect(tables.workout_logs).toEqual([other]);
  });
});

describe("programme et objectifs — annulation", () => {
  const programmeOps = (): DraftOp[] => {
    const r = validateDraft({
      kind: "programme", title: "t", ops: [{ op: "remove_exercice", session_id: "s1", exercice_id: "e1" }],
    }, { prog: progRow().value as ProgSessionShape[], newId: () => "x" });
    if (!r.ok) throw new Error(r.error);
    return r.value.ops;
  };

  it("refuse d'écraser un programme modifié depuis, sauf si on force", async () => {
    const { db, tables } = fakeDb(initial());
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: programmeOps() });
    expect((tables.app_data[0].value as ProgSessionShape[])[0].blocs[0].exercices).toHaveLength(0);

    // Le coach renomme la séance entre-temps.
    (tables.app_data[0].value as ProgSessionShape[])[0].name = "Jambes";
    await expect(undoSteps(db, A, COACH, res.undo)).rejects.toBeInstanceOf(UndoConflict);
    expect((tables.app_data[0].value as ProgSessionShape[])[0].name).toBe("Jambes");

    await undoSteps(db, A, COACH, res.undo, true);
    expect(tables.app_data[0]).toEqual(progRow());
  });

  it("des objectifs absents redeviennent absents", async () => {
    const { db, tables } = fakeDb(initial());
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "objectifs", ops: [{ op: "set_goals", sessionsPerWeek: 4 }] });
    expect(res.goals).toEqual({ sessionsPerWeek: 4, sleepTarget: 8 });
    await undoSteps(db, A, COACH, res.undo);
    expect(tables.app_data.filter((r) => r.key === "asp:goals")).toEqual([]);
  });
});
