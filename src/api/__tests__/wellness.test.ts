import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { parseWellnessEntry } from "@shared/domain/wellness";
import { setDbForTests } from "@/api/client";
import {
  deleteWellnessEntry,
  getTodayWellness,
  getWellnessHistories,
  getWellnessHistory,
  invalidateWellness,
  saveWellnessEntry,
  saveWellnessForm,
  wellnessKeys,
} from "@/api/wellness";

const day = (date: string, o: Record<string, unknown> = {}) => ({
  fatigue: 4, sommeil: 4, stress: 4, energie: 4, doms: 4, score: 80, date, ...o,
});

function seed() {
  return {
    app_data: [
      // Comme en base : clés compactes, plus des clés de semaine parasites.
      { athlete_id: "a", key: "asp:wh", value: { "20261106": day("20261106"), "20261107": day("20261107", { injComment: "Genou" }), "1": 3, "4": 2 } },
      { athlete_id: "a", key: "asp:blockHistory", value: [{ wellnessHistory: { "20260901": day("20260901"), "20261106": day("20261106", { fatigue: 1 }) } }] },
      { athlete_id: "a", key: "asp:prog", value: {} },
      { athlete_id: "b", key: "asp:wh", value: { "20261107": day("20261107", { doms: 2 }) } },
    ] as Row[],
  };
}

/** Même effet que les RPC SQL (supabase/migrations/20261108110000_wellness_rpcs.sql). */
const rpcs: Record<string, FakeRpc> = {
  wellness_set_day: (args, tables) => {
    const key = String(args.p_day).replace(/-/g, "");
    const entry = { ...(args.p_entry as Record<string, unknown>), date: key };
    const row = tables.app_data.find((r) => r.athlete_id === args.p_athlete && r.key === "asp:wh");
    if (row) {
      const v = { ...(row.value as Record<string, unknown>) };
      delete v[String(args.p_day)];
      row.value = { ...v, [key]: entry };
    } else tables.app_data.push({ athlete_id: args.p_athlete as string, key: "asp:wh", value: { [key]: entry } });
    return entry;
  },
  wellness_delete_day: (args, tables) => {
    const key = String(args.p_day).replace(/-/g, "");
    const row = tables.app_data.find((r) => r.athlete_id === args.p_athlete && r.key === "asp:wh");
    const v = { ...((row?.value as Record<string, unknown>) ?? {}) };
    if (!row || !(key in v)) return false;
    delete v[key];
    row.value = v;
    return true;
  },
};

/** Lignes de `wellness_entries` équivalentes au seed (ce que la synchro serveur produit). */
const row = (athlete_id: string, day: string, o: Record<string, unknown> = {}) => ({
  athlete_id, day, fatigue: 4, sommeil: 4, stress: 4, energie: 4, doms: 4, score: 80,
  bedtime: null, wake: null, sleep_hours: null, sleep_interrupted: null, sleep_interrupt_note: null,
  doms_zones: [], doms_points: [], injury_note: null, weight_kg: null, archived: false, ...o,
});

function seedTables() {
  return {
    ...seed(),
    wellness_entries: [
      row("a", "2026-09-01", { archived: true }),
      row("a", "2026-11-06"),
      row("a", "2026-11-07", { injury_note: "Genou" }),
      row("b", "2026-11-07", { doms: 2, score: 72 }),
    ] as Row[],
  };
}

/** Comme PostgREST quand la table n'existe pas encore (migration pas appliquée). */
function withoutTable(db: unknown) {
  const real = db as { from: (t: string) => unknown };
  const missing = { data: null, error: { message: "Could not find the table 'public.wellness_entries'", code: "PGRST205" } };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "lte", "order", "range"]) chain[m] = () => chain;
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(missing).then(ok);
  return { ...real, from: (t: string) => (t === "wellness_entries" ? chain : real.from(t)) };
}

describe("lecture (table wellness_entries)", () => {
  afterEach(() => setDbForTests(null));

  it("historique : jours ISO croissants, archive incluse, champs relus", async () => {
    const { db } = fakeDb({
      wellness_entries: [
        row("a", "2026-11-07", {
          injury_note: " Genou ", bedtime: "23:15:00", wake: "07:00:00", sleep_hours: "7.5", sleep_interrupted: false,
          doms_zones: ["quadri"], doms_points: [{ id: "p1", x: 12.5, y: 40, side: "front", intensity: 2 }, { x: 1, y: 2, side: "top" }],
          weight_kg: "72.4", fatigue: "5",
        }),
        row("a", "2026-09-01", { archived: true }),
        row("a", "2026-10-01", { fatigue: null, score: null }),
      ] as Row[],
    });
    setDbForTests(db);
    const h = await getWellnessHistory("a");
    expect(Object.keys(h)).toEqual(["2026-09-01", "2026-10-01", "2026-11-07"]);
    expect(h["2026-09-01"].archived).toBe(true);
    expect(h["2026-10-01"].items.fatigue).toBeNull();
    expect(h["2026-11-07"]).toEqual({
      day: "2026-11-07",
      items: { fatigue: 5, sommeil: 4, stress: 4, energie: 4, doms: 4 },
      sleep: { bedtime: { h: 23, m: 15 }, wake: { h: 7, m: 0 }, hours: 7.5, interrupted: false, interruptNote: null },
      domsZones: ["quadri"],
      domsPoints: [{ id: "p1", x: 12.5, y: 40, side: "front", intensity: 2 }],
      domsLevels: {},
      envie: null,
      pain: null,
      sick: null,
      domsWorkout: null,
      injuryNote: "Genou",
      weightKg: 72.4,
      archived: false,
    });
  });

  it("même résultat que la lecture de l'ancien stockage (seed équivalent)", async () => {
    const { db } = fakeDb(seedTables());
    setDbForTests(db);
    const fromTable = await getWellnessHistory("a");
    setDbForTests(withoutTable(fakeDb(seedTables()).db));
    const fromLegacy = await getWellnessHistory("a");
    expect(fromTable).toEqual(fromLegacy);
  });

  it("bornes de dates et archive exclue sur demande", async () => {
    const { db } = fakeDb(seedTables());
    setDbForTests(db);
    expect(Object.keys(await getWellnessHistory("a", { from: "2026-11-07" }))).toEqual(["2026-11-07"]);
    expect(Object.keys(await getWellnessHistory("a", { to: "2026-11-06" }))).toEqual(["2026-09-01", "2026-11-06"]);
    expect(Object.keys(await getWellnessHistory("a", { includeArchived: false }))).toEqual(["2026-11-06", "2026-11-07"]);
  });

  it("plusieurs athlètes en une requête ; un athlète sans saisie a un historique vide", async () => {
    const { db } = fakeDb(seedTables());
    setDbForTests(db);
    const all = await getWellnessHistories(["a", "b", "c"]);
    expect(Object.keys(all["a"])).toHaveLength(3);
    expect(all["b"]["2026-11-07"].items.doms).toBe(2);
    expect(all["c"]).toEqual({});
    expect(await getWellnessHistories([])).toEqual({});
  });

  it("wellness du jour : lu dans la table", async () => {
    const { db } = fakeDb(seedTables());
    setDbForTests(db);
    expect((await getTodayWellness("a", "2026-11-07"))?.injuryNote).toBe("Genou");
    expect(await getTodayWellness("a", "2026-11-08")).toBeNull();
  });

  it("une lecture en erreur lève, elle ne renvoie pas {} (et ne retombe pas sur l'ancien stockage)", async () => {
    const { db } = fakeDb(seedTables(), { table: "wellness_entries", op: "select" });
    setDbForTests(db);
    await expect(getWellnessHistory("a")).rejects.toThrow(/Lecture du wellness impossible/);
    await expect(getWellnessHistories(["a"])).rejects.toThrow(/Lecture du wellness des athlètes impossible/);
  });
});

describe("lecture (table absente : ancien stockage app_data)", () => {
  afterEach(() => setDbForTests(null));

  it("historique : jours ISO, clés parasites écartées, archive incluse, asp:wh prioritaire", async () => {
    setDbForTests(withoutTable(fakeDb(seed()).db));
    const h = await getWellnessHistory("a");
    expect(Object.keys(h)).toEqual(["2026-09-01", "2026-11-06", "2026-11-07"]);
    expect(h["2026-11-06"].items.fatigue).toBe(4);
    expect(h["2026-09-01"].archived).toBe(true);
    expect(h["2026-11-07"].injuryNote).toBe("Genou");
    expect(Object.keys(await getWellnessHistory("a", { from: "2026-11-07" }))).toEqual(["2026-11-07"]);
    expect(Object.keys(await getWellnessHistory("a", { includeArchived: false }))).toEqual(["2026-11-06", "2026-11-07"]);
  });

  it("plusieurs athlètes", async () => {
    setDbForTests(withoutTable(fakeDb(seed()).db));
    const all = await getWellnessHistories(["a", "b", "c"]);
    expect(Object.keys(all["a"])).toHaveLength(3);
    expect(all["b"]["2026-11-07"].items.doms).toBe(2);
    expect(all["c"]).toEqual({});
  });

  it("ancien stockage en erreur : lève", async () => {
    setDbForTests(withoutTable(fakeDb(seed(), { table: "app_data", op: "select" }).db));
    await expect(getWellnessHistory("a")).rejects.toThrow(/Lecture du wellness impossible/);
  });
});

describe("écriture", () => {
  afterEach(() => setDbForTests(null));

  it("enregistre un jour par la RPC, au format historique, sans toucher aux autres", async () => {
    const { db, tables } = fakeDb(seed(), undefined, rpcs);
    setDbForTests(db);
    const e = parseWellnessEntry({ fatigue: 5, sommeil: 5, stress: 5, energie: 5, doms: 5, score: 3 }, "2026-11-08")!;
    const saved = await saveWellnessEntry("a", e);
    expect(saved.day).toBe("2026-11-08");
    const wh = tables.app_data.find((r) => r.athlete_id === "a" && r.key === "asp:wh")!.value as Record<string, Record<string, unknown>>;
    expect(wh["20261108"]).toMatchObject({ date: "20261108", fatigue: 5, score: 100 });
    expect(Object.keys(wh).sort()).toEqual(["1", "20261106", "20261107", "20261108", "4"]);
  });

  it("formulaire athlète (ancien format) → le jour local, score recalculé", async () => {
    const { db, tables } = fakeDb(seed(), undefined, rpcs);
    setDbForTests(db);
    const form = { fatigue: 3, sommeil: 3, stress: 3, energie: 3, doms: 2, score: 99, poids: 70, injComment: "Rhume", domsZones: [], domsPoints: [] };
    const saved = await saveWellnessForm("b", form, "2026-11-08");
    expect(saved).toMatchObject({ day: "2026-11-08", injuryNote: "Rhume", weightKg: 70 });
    const wh = tables.app_data.find((r) => r.athlete_id === "b" && r.key === "asp:wh")!.value as Record<string, Record<string, unknown>>;
    expect(wh["20261108"]).toMatchObject({ date: "20261108", score: 56, poids: 70, injComment: "Rhume" });
    expect(wh["20261107"]).toBeDefined();
    await expect(saveWellnessForm("b", null, "2026-11-08")).rejects.toThrow(/saisie illisible/);
  });

  it("efface un jour par la RPC", async () => {
    const { db, tables } = fakeDb(seed(), undefined, rpcs);
    setDbForTests(db);
    expect(await deleteWellnessEntry("a", "2026-11-07")).toBe(true);
    expect(await deleteWellnessEntry("a", "2026-11-07")).toBe(false);
    const wh = tables.app_data.find((r) => r.athlete_id === "a" && r.key === "asp:wh")!.value as Record<string, unknown>;
    expect("20261107" in wh).toBe(false);
  });

  it("refuse un jour invalide et remonte une erreur lisible", async () => {
    const { db } = fakeDb(seed(), { table: "wellness_set_day", op: "rpc" }, rpcs);
    setDbForTests(db);
    const e = parseWellnessEntry(day("20261108"), "20261108")!;
    await expect(saveWellnessEntry("a", { ...e, day: "20261108" })).rejects.toThrow(/jour invalide/);
    await expect(saveWellnessEntry("a", e)).rejects.toThrow(/Enregistrement du wellness impossible/);
    await expect(deleteWellnessEntry("a", "hier")).rejects.toThrow(/jour invalide/);
  });
});

describe("cache", () => {
  it("invalide l'athlète, les vues multi-athlètes qui le contiennent, retours et micro-stats", async () => {
    const qc = new QueryClient();
    const keys = [
      wellnessKeys.history("a"),
      wellnessKeys.many(["b", "a"]),
      wellnessKeys.many(["b"]),
      ["weeklyRetours", "a", "2026-11-02"],
      ["monthlyRetours", "a", "2026-11"],
      ["micro-stats", "a", "2026-11-02", "2026-11-08"],
      ["weeklyRetours", "b", "2026-11-02"],
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateWellness(qc, "a");
    const stale = keys.map((k) => qc.getQueryState(k)?.isInvalidated);
    expect(stale).toEqual([true, true, false, true, true, true, false]);
  });
});
