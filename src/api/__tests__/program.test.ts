import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  addProgramSessions, cloneProgSession, diffProgram, getBlocBank, getProgram, getSessionBank,
  invalidateProgram, isProgramConflict, listAthleteCycles, listCycleWeeks, programKeys,
  rescheduleSessionDay, saveBlocBank, saveProgram, saveSessionBank, type ProgSession,
} from "@/api/program";

const sess = (id: string, o: Partial<ProgSession> = {}): ProgSession => ({
  id, name: `Séance ${id}`, short: id, recurrence: "weekly", multi_semaine: false, blocs: [], ...o,
});

/** Ce que fait `program_save_sessions` en base (migration 20261109110000), en JS. */
function saveSessionsRpc(args: Record<string, unknown>, tables: Record<string, Row[]>) {
  const rows = (tables.app_data ??= []);
  let row = rows.find((r) => r.athlete_id === args.p_athlete && r.key === "asp:prog");
  if (!row) rows.push((row = { athlete_id: args.p_athlete, key: "asp:prog", value: [] }));
  const cur = row.value as ProgSession[];
  const by = new Map(cur.map((s) => [s.id, s]));
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const upsert = args.p_upsert as ProgSession[];
  const base = (args.p_base ?? {}) as Record<string, ProgSession>;
  const remove = (args.p_remove ?? []) as string[];
  for (const s of upsert) {
    const now = by.get(s.id);
    if (!now && base[s.id]) throw new Error("40001 supprimée");
    if (now && !eq(now, s) && (!base[s.id] || !eq(now, base[s.id]))) throw new Error("40001 modifiée");
  }
  for (const id of remove) {
    const now = by.get(id);
    if (now && (!base[id] || !eq(now, base[id]))) throw new Error("40001 modifiée");
  }
  for (const s of upsert) by.set(s.id, s);
  for (const id of remove) by.delete(id);
  const seen = new Set<string>();
  const out: ProgSession[] = [];
  const order = (args.p_order as string[] | null) ?? [];
  for (const id of [...order, ...cur.map((s) => s.id), ...upsert.map((s) => s.id)]) {
    if (by.has(id) && !seen.has(id)) { seen.add(id); out.push(by.get(id)!); }
  }
  row.value = out;
  return out;
}

/** La RPC lève une erreur 40001 comme la base (le faux client ne garde que le message). */
function withConflictCode(db: ReturnType<typeof fakeDb>["db"]) {
  const rpc = db.rpc.bind(db);
  return {
    ...db,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const res = await rpc(fn, args);
      if (res.error?.message.startsWith("40001")) return { data: null, error: { ...res.error, code: "40001" } };
      return res;
    },
  };
}

const seed = (prog: ProgSession[]) => {
  const f = fakeDb({ app_data: [{ athlete_id: "a", key: "asp:prog", value: prog }] }, undefined, { program_save_sessions: saveSessionsRpc });
  return { db: withConflictCode(f.db), tables: f.tables };
};
const stored = (tables: Record<string, Row[]>, id = "a") =>
  tables.app_data.find((r) => r.athlete_id === id && r.key === "asp:prog")!.value as ProgSession[];

afterEach(() => setDbForTests(null));

describe("diffProgram", () => {
  const base = [sess("s1"), sess("s2"), sess("s3")];

  it("rien n'a changé → null", () => {
    expect(diffProgram(base, structuredClone(base))).toBeNull();
  });

  it("n'envoie que la séance modifiée, avec sa version lue ; ordre inchangé → null", () => {
    const next = base.map((s) => (s.id === "s2" ? { ...s, name: "Haut du corps" } : s));
    expect(diffProgram(base, next)).toEqual({
      upsert: [next[1]], base: { s2: base[1] }, remove: [], order: null,
    });
  });

  it("ajout, suppression et réordonnancement", () => {
    const next = [base[2], base[0], sess("s4")];
    const d = diffProgram(base, next)!;
    expect(d.upsert.map((s) => s.id)).toEqual(["s4"]);
    expect(d.remove).toEqual(["s2"]);
    expect(d.base).toEqual({ s2: base[1] });
    expect(d.order).toEqual(["s3", "s1", "s4"]);
  });

  it("ajout seul à la fin : pas d'ordre à envoyer", () => {
    expect(diffProgram(base, [...base, sess("s4")])!.order).toBeNull();
  });

  it("programme jamais lu : tout part en création, rien n'est supprimé ni réordonné", () => {
    const d = diffProgram(undefined, [sess("new")])!;
    expect(d).toEqual({ upsert: [sess("new")], base: {}, remove: [], order: null });
  });

  it("refuse une séance sans id ou deux fois la même", () => {
    expect(() => diffProgram(base, [sess("s1"), sess("s1")])).toThrow(/en double/);
    expect(() => diffProgram(base, [sess("")])).toThrow(/sans identifiant/);
  });
});

describe("api/program — lectures", () => {
  it("getProgram lit asp:prog, [] si rien n'a été écrit", async () => {
    setDbForTests(seed([sess("s1")]).db);
    expect((await getProgram("a")).map((s) => s.id)).toEqual(["s1"]);
    expect(await getProgram("inconnu")).toEqual([]);
  });

  it("lève si la lecture échoue ou si la valeur n'est pas une liste (jamais [] à la place)", async () => {
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "select" }).db);
    await expect(getProgram("a")).rejects.toThrow(/Programmation non chargée/);
    await expect(getSessionBank("c")).rejects.toThrow(/Banque de séances/);
    await expect(getBlocBank("c")).rejects.toThrow(/Banque de blocs/);
    setDbForTests(fakeDb({ app_data: [{ athlete_id: "a", key: "asp:prog", value: { oups: 1 } }] }).db);
    await expect(getProgram("a")).rejects.toThrow(/valeur inattendue/);
  });
});

describe("api/program — enregistrement", () => {
  it("ne réécrit que la séance changée ; ce qu'un autre a ajouté entre-temps reste", async () => {
    const { db, tables } = seed([sess("s1"), sess("s2")]);
    setDbForTests(db);
    const base = await getProgram("a");
    // Pendant ce temps, l'assistant (coach-api) ajoute une séance côté serveur.
    stored(tables).push(sess("ia"));
    const next = base.map((s) => (s.id === "s1" ? { ...s, name: "Modifiée" } : s));
    const saved = await saveProgram("a", base, next);
    expect(saved.map((s) => s.id)).toEqual(["s1", "s2", "ia"]);
    expect(stored(tables)[0].name).toBe("Modifiée");
  });

  it("refuse d'écraser une séance modifiée ailleurs (isProgramConflict)", async () => {
    const { db, tables } = seed([sess("s1")]);
    setDbForTests(db);
    const base = await getProgram("a");
    stored(tables)[0] = sess("s1", { name: "Version du co-coach" });
    const err = await saveProgram("a", base, [sess("s1", { name: "La mienne" })]).catch((e) => e);
    expect(isProgramConflict(err)).toBe(true);
    expect(stored(tables)[0].name).toBe("Version du co-coach");
  });

  it("cache vide (lecture en erreur) : un ajout ne remplace pas le programme", async () => {
    const { db, tables } = seed([sess("s1"), sess("s2")]);
    setDbForTests(db);
    await saveProgram("a", undefined, [sess("nouvelle")]);
    expect(stored(tables).map((s) => s.id)).toEqual(["s1", "s2", "nouvelle"]);
  });

  it("suppression et réordonnancement", async () => {
    const { db, tables } = seed([sess("s1"), sess("s2"), sess("s3")]);
    setDbForTests(db);
    const base = await getProgram("a");
    await saveProgram("a", base, [base[2], base[0]]);
    expect(stored(tables).map((s) => s.id)).toEqual(["s3", "s1"]);
  });

  it("rien à faire : aucun appel", async () => {
    const f = seed([sess("s1")]);
    const rpc = vi.fn(f.db.rpc);
    setDbForTests({ ...f.db, rpc });
    const base = await getProgram("a");
    expect(await saveProgram("a", base, structuredClone(base))).toEqual(base);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("addProgramSessions ajoute à la fin, crée le programme s'il n'existe pas", async () => {
    const { db, tables } = seed([sess("s1")]);
    setDbForTests(db);
    expect((await addProgramSessions("a", [sess("copie")])).map((s) => s.id)).toEqual(["s1", "copie"]);
    await addProgramSessions("b", [sess("x")]);
    expect(stored(tables, "b").map((s) => s.id)).toEqual(["x"]);
  });

  it("remonte une panne de la RPC", async () => {
    setDbForTests(fakeDb({}, { table: "program_save_sessions", op: "rpc" }).db);
    await expect(addProgramSessions("a", [sess("x")])).rejects.toThrow(/Enregistrement du programme impossible/);
  });

  it("cloneProgSession : nouveaux ids partout, contenu identique", () => {
    let n = 0;
    const src = sess("s1", {
      blocs: [{ id: "b1", name: "A", series_mode: "libre", timing_mode: "libre", sort_order: 0, exercices: [{ id: "e1" } as never] }],
    });
    const c = cloneProgSession(src, () => `n${++n}`);
    expect([c.id, c.blocs[0].id, c.blocs[0].exercices[0].id]).toEqual(["n1", "n2", "n3"]);
    expect(c.name).toBe(src.name);
    expect(src.id).toBe("s1");
  });
});

describe("api/program — banques du coach", () => {
  it("lit et écrit les banques sur l'id du coach", async () => {
    const { db, tables } = fakeDb({ app_data: [] });
    setDbForTests(db);
    expect(await getSessionBank("c")).toEqual([]);
    await saveSessionBank("c", [sess("m1")]);
    await saveBlocBank("c", [{ id: "b1" } as never]);
    expect((await getSessionBank("c")).map((s) => s.id)).toEqual(["m1"]);
    expect(await getBlocBank("c")).toEqual([{ id: "b1" }]);
    expect(tables.app_data.map((r) => r.key).sort()).toEqual(["asp:bloc-bank", "asp:session-bank"]);
  });

  it("remonte une écriture refusée", async () => {
    setDbForTests(fakeDb({}, { table: "app_data", op: "upsert" }).db);
    await expect(saveSessionBank("c", [])).rejects.toThrow(/banque de séances/);
  });
});

describe("api/program — cycles et jour d'une séance", () => {
  it("cycles de l'athlète par date, semaines d'un cycle ; lève en cas d'erreur", async () => {
    setDbForTests(fakeDb({
      cycles: [
        { id: "c2", athlete_id: "a", name: "B", start_date: "2026-12-01", end_date: "2026-12-28" },
        { id: "c1", athlete_id: "a", name: "A", start_date: "2026-11-01", end_date: "2026-11-28" },
        { id: "x", athlete_id: "autre", name: "X", start_date: "2026-01-01", end_date: "2026-01-28" },
      ],
      microcycles: [
        { id: "m2", cycle_id: "c1", start_date: "2026-11-09", end_date: "2026-11-15" },
        { id: "m1", cycle_id: "c1", start_date: "2026-11-02", end_date: "2026-11-08" },
      ],
    }).db);
    expect((await listAthleteCycles("a")).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect((await listCycleWeeks("c1")).map((m) => m.id)).toEqual(["m1", "m2"]);
    setDbForTests(fakeDb({}, { table: "cycles", op: "select" }).db);
    await expect(listAthleteCycles("a")).rejects.toThrow(/Cycles non chargés/);
  });

  it("rescheduleSessionDay déplace les occurrences à venir, garde celles de l'athlète et les séances faites", async () => {
    const w = (id: string, o: Row) => ({
      id, athlete_id: "a", session_id: "s1", scheduled_date: "2026-11-10", status: "planned",
      rescheduled_by_athlete: false, microcycles: { start_date: "2026-11-09" }, ...o,
    });
    const { db, tables } = fakeDb({
      workout_logs: [
        w("passee", { scheduled_date: "2026-11-03", microcycles: { start_date: "2026-11-02" } }),
        w("prevue", {}),
        w("athlete", { rescheduled_by_athlete: true }),
        w("faite", { status: "completed" }),
        w("autre", { session_id: "s2" }),
      ],
    });
    setDbForTests(db);
    // Jeudi = 3 → semaine du lundi 9 novembre → 12 novembre.
    expect(await rescheduleSessionDay({ athleteId: "a", sessionId: "s1", newDay: 3, today: "2026-11-08" }))
      .toEqual({ moved: 1, failed: 0, keptByAthlete: 1 });
    const date = (id: string) => tables.workout_logs.find((r) => r.id === id)!.scheduled_date;
    expect([date("passee"), date("prevue"), date("athlete"), date("faite"), date("autre")])
      .toEqual(["2026-11-03", "2026-11-12", "2026-11-10", "2026-11-10", "2026-11-10"]);
    expect(await rescheduleSessionDay({ athleteId: "a", sessionId: "rien", newDay: 1, today: "2026-11-08" })).toBeNull();
  });

  it("rescheduleSessionDay lève si les séances ne sont pas lues", async () => {
    setDbForTests(fakeDb({}, { table: "workout_logs", op: "select" }).db);
    await expect(rescheduleSessionDay({ athleteId: "a", sessionId: "s1", newDay: 1 })).rejects.toThrow(/Séances à venir/);
  });
});

describe("api/program — clés", () => {
  it("invalidateProgram couvre programme, banques et Retours de l'athlète", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateProgram(qc as never, "a");
    expect(qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      programKeys.all("a"), ["weeklyRetours", "a"], ["monthlyRetours", "a"],
    ]);
    expect(programKeys.sessions("a").slice(0, 2)).toEqual(programKeys.all("a"));
    expect(programKeys.sessionBank("c").slice(0, 2)).toEqual(programKeys.all("c"));
  });
});
