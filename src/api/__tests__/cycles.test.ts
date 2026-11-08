import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  createCycle, cycleKeys, deleteCycle, deletePeriod, getCycleTree, getLatestCycle, getMicrocycle,
  invalidateCycles, listAthleteCycles, listCyclesEndingSoon, setCycleDates, updatePeriod,
} from "@/api/cycles";

afterEach(() => setDbForTests(null));

const A = "ath-1";

function seed(extra: Record<string, Row[]> = {}, failOn?: { table: string; op: string }, rpcs = {}) {
  return fakeDb({
    macrocycles: [
      { id: "ma1", athlete_id: A, name: "Saison", start_date: "2026-09-01", end_date: "2027-06-30" },
      { id: "ma-x", athlete_id: "autre", name: "Autre", start_date: "2026-09-01", end_date: "2027-06-30" },
    ],
    mesocycles: [{ id: "me1", macrocycle_id: "ma1", name: "Méso", start_date: "2026-09-01", end_date: "2026-12-31" }],
    cycles: [
      // rattaché au méso, sans athlete_id (anciens cycles)
      { id: "c-nested", mesocycle_id: "me1", athlete_id: null, name: "Force", start_date: "2026-10-05", end_date: "2026-11-01" },
      // rattaché au méso ET portant l'athlète (assistant)
      { id: "c-both", mesocycle_id: "me1", athlete_id: A, name: "Puissance", start_date: "2026-11-02", end_date: "2026-11-29" },
      // autonome
      { id: "c-solo", mesocycle_id: null, athlete_id: A, name: "Bloc", start_date: "2027-01-04", end_date: "2027-01-31" },
      { id: "c-other", mesocycle_id: null, athlete_id: "autre", name: "Pas à moi", start_date: "2027-01-04", end_date: "2027-01-31" },
    ],
    microcycles: [
      { id: "w1", cycle_id: "c-nested", week_number: 1, start_date: "2026-10-05", end_date: "2026-10-11", is_deload: false },
      { id: "w2", cycle_id: "c-nested", week_number: 2, start_date: "2026-10-12", end_date: "2026-10-18", is_deload: true },
      { id: "w9", cycle_id: "c-solo", week_number: 1, start_date: "2027-01-04", end_date: "2027-01-10", is_deload: false },
    ],
    ...extra,
  }, failOn, rpcs);
}

describe("getCycleTree", () => {
  it("assemble macro → méso → cycles (rattachés puis autonomes) → semaines", async () => {
    const { db } = seed();
    setDbForTests(db);
    const t = await getCycleTree(A);
    expect(t.macrocycles.map((m) => m.id)).toEqual(["ma1"]);
    expect(t.mesocycles.map((m) => m.id)).toEqual(["me1"]);
    expect(t.cycles.map((c) => c.id)).toEqual(["c-nested", "c-both", "c-solo"]);
    expect(t.microcycles.map((m) => m.id)).toEqual(["w1", "w2", "w9"]);
  });

  it("sans les semaines quand on n'en a pas besoin", async () => {
    const { db } = seed();
    setDbForTests(db);
    expect((await getCycleTree(A, { withMicrocycles: false })).microcycles).toEqual([]);
  });

  it("lève si une lecture échoue (jamais une frise vide par défaut)", async () => {
    const { db } = seed({}, { table: "microcycles", op: "select" });
    setDbForTests(db);
    await expect(getCycleTree(A)).rejects.toThrow(/semaines/);
  });
});

describe("listAthleteCycles / getLatestCycle", () => {
  it("cycles de l'athlète + ceux de ses mésos, dédoublonnés et triés", async () => {
    const { db } = seed();
    setDbForTests(db);
    expect((await listAthleteCycles(A)).map((c) => c.id)).toEqual(["c-nested", "c-both", "c-solo"]);
    expect((await listAthleteCycles(A, { direct: true })).map((c) => c.id)).toEqual(["c-both", "c-solo"]);
    expect((await listAthleteCycles(A, { direct: true, newestFirst: true })).map((c) => c.id)).toEqual(["c-solo", "c-both"]);
    expect((await getLatestCycle(A))?.id).toBe("c-solo");
  });

  it("aucun cycle → null", async () => {
    setDbForTests(fakeDb({}).db);
    expect(await getLatestCycle(A)).toBeNull();
  });
});

describe("listCyclesEndingSoon", () => {
  it("cycles commencés qui finissent dans la fenêtre", async () => {
    const { db } = seed();
    setDbForTests(db);
    const rows = await listCyclesEndingSoon([A], "2026-11-10", "2026-11-30");
    expect(rows.map((r) => r.id)).toEqual(["c-both"]);
    expect(await listCyclesEndingSoon([], "2026-11-10", "2026-11-30")).toEqual([]);
  });
});

describe("getMicrocycle", () => {
  it("numéro et cycle de la semaine, null si absente", async () => {
    const { db } = seed();
    setDbForTests(db);
    expect(await getMicrocycle("w2")).toEqual({ week_number: 2, cycle_id: "c-nested" });
    expect(await getMicrocycle("nope")).toBeNull();
  });
});

describe("createCycle / setCycleDates (RPC)", () => {
  it("envoie les séances au format de la RPC et renvoie le cycle créé", async () => {
    let args: Record<string, unknown> = {};
    const { db } = seed({}, undefined, {
      create_cycle: (a: Record<string, unknown>) => {
        args = a;
        return { cycle: { id: "new", name: "X", start_date: a.p_start, end_date: a.p_end, mesocycle_id: null }, weeks: 3, sessions: 6 };
      },
    });
    setDbForTests(db);
    const res = await createCycle({
      athleteId: A, name: "X", start: "2026-11-02", end: "2026-11-22", deloadWeek: 0,
      sessions: [{ sessionId: "s1", sessionName: "Force", dayOfWeek: 0 }],
    });
    expect(res).toEqual({ cycle: expect.objectContaining({ id: "new" }), weeks: 3, sessions: 6 });
    expect(args).toEqual({
      p_athlete: A, p_name: "X", p_start: "2026-11-02", p_end: "2026-11-22",
      p_mesocycle: null, p_deload_week: null,
      p_sessions: [{ session_id: "s1", session_name: "Force", day_of_week: 0 }],
    });
  });

  it("une erreur de la RPC remonte", async () => {
    const { db } = seed({}, { table: "create_cycle", op: "rpc" });
    setDbForTests(db);
    await expect(createCycle({ athleteId: A, name: "X", start: "2026-11-02", end: "2026-11-08" })).rejects.toThrow(/Création du cycle/);
  });

  it("setCycleDates : mésocycle inchangé par défaut, détaché avec null", async () => {
    const calls: Record<string, unknown>[] = [];
    const { db } = seed({}, undefined, {
      set_cycle_dates: (a: Record<string, unknown>) => (calls.push(a), { id: a.p_cycle, start_date: a.p_start, end_date: a.p_end }),
    });
    setDbForTests(db);
    await setCycleDates({ cycleId: "c-solo", start: "2027-01-04", end: "2027-02-07", trimAfterEnd: true });
    await setCycleDates({ cycleId: "c-solo", start: "2027-01-04", end: "2027-02-07", mesocycleId: null, dropPlanned: false });
    expect(calls[0]).toMatchObject({ p_change_mesocycle: false, p_drop_planned: true, p_trim_after_end: true, p_mesocycle: null });
    expect(calls[1]).toMatchObject({ p_change_mesocycle: true, p_drop_planned: false, p_trim_after_end: false, p_mesocycle: null });
  });

  it("setCycleDates : réponse vide = erreur (cycle disparu)", async () => {
    const { db } = seed({}, undefined, { set_cycle_dates: () => null });
    setDbForTests(db);
    await expect(setCycleDates({ cycleId: "x", start: "2027-01-04", end: "2027-01-10" })).rejects.toThrow();
  });
});

describe("updatePeriod / deleteCycle / deletePeriod", () => {
  it("met à jour une période et lève en cas d'échec", async () => {
    const { db, tables } = seed();
    setDbForTests(db);
    await updatePeriod("cycles", "c-solo", { name: "Bloc 2", objective: "Force" });
    expect(tables.cycles.find((c) => c.id === "c-solo")).toMatchObject({ name: "Bloc 2", objective: "Force" });
    setDbForTests(seed({}, { table: "cycles", op: "update" }).db);
    await expect(updatePeriod("cycles", "c-solo", { name: "x" })).rejects.toThrow();
  });

  it("supprimer un cycle (removePlanned) retire les séances prévues sans trace, garde les réelles détachées", async () => {
    const log = (id: string, o: Row) => ({ id, athlete_id: A, microcycle_id: "w1", scheduled_date: "2026-10-06", status: "planned", athlete_modifications: null, rpe_score: null, ...o });
    const { db, tables } = seed({
      workout_logs: [log("prevue", {}), log("faite", { status: "completed" }), log("commencee", { athlete_modifications: { sessionForme: 3 } })],
    });
    setDbForTests(db);
    await deleteCycle("c-nested", { removePlanned: true });
    expect(tables.cycles.map((c) => c.id)).not.toContain("c-nested");
    expect(tables.microcycles.map((m) => m.id)).toEqual(["w9"]);
    expect(tables.workout_logs.map((l) => [l.id, l.microcycle_id])).toEqual([["faite", null], ["commencee", null]]);
  });

  it("supprimer un cycle sans removePlanned garde toutes ses séances (détachées)", async () => {
    const { db, tables } = seed({ workout_logs: [{ id: "p", athlete_id: A, microcycle_id: "w1", status: "planned" }] });
    setDbForTests(db);
    await deleteCycle("c-nested");
    expect(tables.workout_logs).toEqual([expect.objectContaining({ id: "p", microcycle_id: null })]);
  });

  it("supprimer un macrocycle emporte mésos, cycles et semaines", async () => {
    const { db, tables } = seed();
    setDbForTests(db);
    await deletePeriod("macrocycles", "ma1");
    expect(tables.mesocycles).toEqual([]);
    expect(tables.cycles.map((c) => c.id)).toEqual(["c-solo", "c-other"]);
    expect(tables.microcycles.map((m) => m.id)).toEqual(["w9"]);
  });
});

describe("invalidateCycles", () => {
  it("rafraîchit la périodisation et les séances de l'athlète, pas celles d'un autre", async () => {
    const qc = new QueryClient();
    const keys = [
      cycleKeys.timeline(A, "2026-01-01", "2026-12-31"),
      cycleKeys.summary(A),
      cycleKeys.athleteCycles(A),
      cycleKeys.lastCycle(A),
      cycleKeys.history(A),
      ["athlete-cycles-list", A],
      ["microcycles-nav", "c-solo"],
      ["activePlan", A, 0],
      ["workouts", A, "list", {}],
      cycleKeys.endingSoon("coach"),
      cycleKeys.summary("autre"),
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateCycles(qc, A);
    const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated;
    for (const k of keys.slice(0, -1)) expect(stale(k), JSON.stringify(k)).toBe(true);
    expect(stale(cycleKeys.summary("autre"))).toBe(false);
  });
});
