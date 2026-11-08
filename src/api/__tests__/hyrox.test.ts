import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { BATTERY_IDS } from "@/lib/hyrox/tests";
import {
  cancelTestWeek,
  getActiveGridSet,
  getAxesDraft,
  getHyroxFlag,
  getHyroxResult,
  hyroxKeys,
  invalidateBatterySessions,
  invalidateHyrox,
  listBatteryCalendar,
  listBatteryResults,
  listHyroxAnalyses,
  listHyroxResults,
  pickRef,
  saveAxesDraft,
  saveBatteryEntry,
  scheduleTestWeek,
  setHyroxCategory,
  setHyroxFlag,
  sortBattery,
  validateAxes,
  createHyroxResult,
  updateHyroxResult,
  deleteHyroxResult,
  type BatteryTest,
} from "@/api/hyrox";
import type { HyroxReferenceSegment, HyroxResultInsert } from "@/features/shared/types/hyrox";

afterEach(() => setDbForTests(null));

const v = (key: string, label = key) => ({ id: key, key, label, unit: "s", value_type: "duration" as const, better_when: "lower" as const });
const test = (o: Partial<BatteryTest> = {}): BatteryTest => ({
  id: BATTERY_IDS.row_2000m, name: "Rameur 2000 m", fill_mode: "self", media_url: null, description: null, protocol: null,
  battery_session: "S2", battery_order: 1, test_variables: [v("hr_avg", "FC moy"), v("time", "Temps")], ...o,
});

describe("drapeau et profil", () => {
  it("lit et bascule is_hyrox_athlete ; catégorie", async () => {
    const { db, tables } = fakeDb({ profiles: [{ id: "a", is_hyrox_athlete: false }] });
    setDbForTests(db);
    expect(await getHyroxFlag("a")).toBe(false);
    await setHyroxFlag("a", true);
    expect(await getHyroxFlag("a")).toBe(true);
    expect(await getHyroxFlag("inconnu")).toBe(false);
    await setHyroxCategory("a", "pro");
    expect(tables.profiles[0].hyrox_category).toBe("pro");
  });

  it("une lecture en erreur lève (le drapeau ne retombe plus silencieusement à « non »)", async () => {
    setDbForTests(fakeDb({}, { table: "profiles", op: "select" }).db);
    await expect(getHyroxFlag("a")).rejects.toThrow("Profil HYROX non chargé");
  });
});

describe("courses", () => {
  it("crée (avec l'auteur), liste du plus récent, modifie, supprime", async () => {
    const { db, tables } = fakeDb({ hyrox_results: [{ id: "old", athlete_id: "a", date: "2026-03-01" }, { id: "x", athlete_id: "b", date: "2026-05-01" }] });
    setDbForTests(db);
    const r = await createHyroxResult({ athlete_id: "a", date: "2026-10-01", event_name: "Paris" } as HyroxResultInsert, "coach");
    expect(tables.hyrox_results.find((x) => x.id === r.id)?.created_by).toBe("coach");
    expect((await listHyroxResults("a")).map((x) => x.id)).toEqual([r.id, "old"]);
    expect((await updateHyroxResult(r.id, { event_name: "Paris Grand Palais" })).event_name).toBe("Paris Grand Palais");
    expect((await getHyroxResult(r.id))?.id).toBe(r.id);
    expect(await getHyroxResult("absente")).toBeNull();
    await deleteHyroxResult(r.id);
    expect(tables.hyrox_results.map((x) => x.id)).toEqual(["old", "x"]);
  });

  it("référence : repli bracket puis division", () => {
    const ref = (division: string, bracket: string): HyroxReferenceSegment => ({ id: `${division}-${bracket}`, division, bracket, segment: "ski" } as HyroxReferenceSegment);
    const refs = [ref("all", "all"), ref("men_open", "all"), ref("men_open", "30-34")];
    expect(pickRef(refs, "men_open", "ski", "30-34")?.id).toBe("men_open-30-34");
    expect(pickRef(refs, "men_open", "ski", "40-44")?.id).toBe("men_open-all");
    expect(pickRef(refs, "women_pro", "ski")?.id).toBe("all-all");
    expect(pickRef(refs, "men_open", "row")).toBeNull();
  });
});

describe("batterie", () => {
  it("tri : séances, ordre, variables dans l'ordre du protocole (FC en dernier)", () => {
    const sorted = sortBattery([
      test({ id: "b", battery_session: "W1", battery_order: 1 }),
      test({ id: "c", battery_session: "S1", battery_order: 2 }),
      test({ id: "a", battery_session: "S1", battery_order: 1 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(sorted[0].test_variables.map((x) => x.key)).toEqual(["time", "hr_avg"]);
  });

  it("résultats : seulement les tests de la batterie, valeurs par clé", async () => {
    const { db } = fakeDb({
      athlete_test_results: [
        { id: "r1", athlete_id: "a", test_definition_id: BATTERY_IDS.row_2000m, performed_at: "2026-11-01T00:00:00",
          athlete_test_values: [{ value: "450", test_variables: { key: "time" } }, { value: 1, test_variables: null }] },
        { id: "r2", athlete_id: "a", test_definition_id: "autre", performed_at: "2026-11-01", athlete_test_values: [] },
      ],
    });
    setDbForTests(db);
    expect(await listBatteryResults("a")).toEqual([
      { id: "r1", test_definition_id: BATTERY_IDS.row_2000m, performed_at: "2026-11-01", values: { time: 450 } },
    ]);
  });

  it("saisie : met à jour la séance du jour (titre sans casse)", async () => {
    const { db, tables } = fakeDb({
      test_sessions: [{ id: "s", athlete_id: "a", date: "2026-11-08", title: "rameur 2000 M", completed: false }],
    });
    setDbForTests(db);
    await saveBatteryEntry("a", { test: test(), date: "2026-11-08", values: { time: 450, hr_avg: null }, comment: " dur " }, "c");
    expect(tables.test_sessions).toHaveLength(1);
    expect(tables.test_sessions[0]).toMatchObject({
      completed: true, results_note: "Temps: 450 s", results_structured: { variables: { time: 450, hr_avg: null }, comment: "dur" },
    });
  });

  it("saisie : reprend un test programmé non fait, à la date réelle", async () => {
    const { db, tables } = fakeDb({
      test_sessions: [
        { id: "tard", athlete_id: "a", date: "2026-11-20", title: "Rameur 2000 m", completed: false },
        { id: "tot", athlete_id: "a", date: "2026-11-12", title: "Rameur 2000 m", completed: false },
      ],
    });
    setDbForTests(db);
    await saveBatteryEntry("a", { test: test(), date: "2026-11-08", values: { time: 450 } }, "c");
    expect(tables.test_sessions.find((s) => s.id === "tot")).toMatchObject({ completed: true, date: "2026-11-08" });
    expect(tables.test_sessions.find((s) => s.id === "tard")).toMatchObject({ completed: false, date: "2026-11-20" });
  });

  it("saisie : sinon crée la séance, rattachée au coach donné", async () => {
    const { db, tables } = fakeDb({});
    setDbForTests(db);
    await saveBatteryEntry("a", { test: test(), date: "2026-11-08", values: { time: 450 } }, "c");
    expect(tables.test_sessions[0]).toMatchObject({ athlete_id: "a", coach_id: "c", title: "Rameur 2000 m", type: "autre", completed: true });
  });

  it("saisie : une recherche en erreur lève avant toute écriture", async () => {
    const { db, tables } = fakeDb({}, { table: "test_sessions", op: "select" });
    setDbForTests(db);
    await expect(saveBatteryEntry("a", { test: test(), date: "2026-11-08", values: {} }, "c")).rejects.toThrow();
    expect(tables.test_sessions ?? []).toHaveLength(0);
  });

  it("semaine de tests : pose, liste par titre, retire seulement les tests non faits", async () => {
    const { db, tables } = fakeDb({ test_sessions: [{ id: "fait", athlete_id: "a", title: "Rameur 2000 m", date: "2026-11-01T00:00:00", completed: true }] });
    setDbForTests(db);
    expect(await scheduleTestWeek("a", [{ name: "Rameur 2000 m", date: "2026-11-10" }, { name: "Ski 2000 m", date: "2026-11-11" }], "c")).toBe(2);
    expect(await scheduleTestWeek("a", [], "c")).toBe(0);
    const cal = await listBatteryCalendar("a", ["Rameur 2000 m", "Ski 2000 m"]);
    expect(cal.map((r) => [r.date, r.completed])).toEqual([["2026-11-01", true], ["2026-11-10", false], ["2026-11-11", false]]);
    await cancelTestWeek(cal.map((r) => r.id));
    expect(tables.test_sessions.map((s) => s.id)).toEqual(["fait"]);
  });
});

describe("grilles et analyses", () => {
  it("pas de version active : erreur claire", async () => {
    setDbForTests(fakeDb({ hyrox_test_grid_versions: [{ version: "v1", active: false }] }).db);
    await expect(getActiveGridSet()).rejects.toThrow("Aucune version de grilles active");
  });

  it("brouillon d'axes : upsert + chrono visé ; validation datée et signée", async () => {
    const { db, tables } = fakeDb({
      hyrox_test_analyses: [{ id: "an", athlete_id: "a", date: "2026-11-01", target_s: null }],
      hyrox_test_axes_drafts: [],
    });
    setDbForTests(db);
    await saveAxesDraft({ analysis_id: "an", context: {} as never, axes_plan: null, target_s: 4500 }, "c");
    expect(tables.hyrox_test_analyses[0].target_s).toBe(4500);
    expect((await getAxesDraft("an"))?.updated_by).toBe("c");
    await validateAxes({ analysis_id: "an", axes: {} as never, validated: true }, "c");
    expect(tables.hyrox_test_analyses[0]).toMatchObject({ validated_by: "c" });
    expect(tables.hyrox_test_analyses[0].validated_at).toEqual(expect.any(String));
    await validateAxes({ analysis_id: "an", axes: {} as never, validated: false }, "c");
    expect(tables.hyrox_test_analyses[0]).toMatchObject({ validated_by: null, validated_at: null });
    expect(await listHyroxAnalyses("a")).toHaveLength(1);
  });
});

describe("invalidation", () => {
  it("HYROX de l'athlète, fiches course et brouillons ; la saisie de batterie rafraîchit aussi les tests", async () => {
    const qc = new QueryClient();
    const keys: Row = {
      flag: hyroxKeys.flag("a"), results: hyroxKeys.results("a"), one: hyroxKeys.result("r"), draft: hyroxKeys.axesDraft("an"),
      other: hyroxKeys.results("b"), grid: hyroxKeys.gridSet("v1"), tests: ["tests", "a", "results"], plan: ["activePlan", "a"],
    };
    for (const k of Object.values(keys)) qc.setQueryData(k as unknown[], 1);
    const stale = (k: unknown) => qc.getQueryState(k as unknown[])?.isInvalidated;
    await invalidateHyrox(qc, "a");
    expect([keys.flag, keys.results, keys.one, keys.draft].map(stale)).toEqual([true, true, true, true]);
    expect([keys.other, keys.grid, keys.tests].map(stale)).toEqual([false, false, false]);
    await invalidateBatterySessions(qc, "a");
    expect([keys.tests, keys.plan].map(stale)).toEqual([true, true]);
    expect(stale(keys.other)).toBe(false);
  });
});
