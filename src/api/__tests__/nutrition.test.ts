import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getDays, getLog, getStrategy, invalidateNutrition, nutritionKeys, saveDay, saveStrategy } from "@/api/nutrition";

/** Ce que fait la RPC en base : remplace un jour, crée la ligne si besoin. */
function saveDayRpc(args: Record<string, unknown>, tables: Record<string, Row[]>) {
  const rows = (tables.app_data ??= []);
  let row = rows.find((r) => r.athlete_id === args.p_athlete && r.key === "asp:nutrition_log");
  if (!row) rows.push((row = { athlete_id: args.p_athlete, key: "asp:nutrition_log", value: {} }));
  row.value = { ...(row.value as object), [args.p_day as string]: args.p_log };
  return args.p_log;
}

const seed = (value: unknown) => fakeDb(
  { app_data: [{ athlete_id: "a", key: "asp:nutrition_log", value }, { athlete_id: "b", key: "asp:nutrition_log", value: { "2026-11-01": {} } }] },
  undefined,
  { nutrition_save_day: saveDayRpc },
);

describe("api/nutrition", () => {
  afterEach(() => setDbForTests(null));

  it("getLog lit le journal par jour ISO, et {} seulement si rien n'a été saisi", async () => {
    setDbForTests(seed({ "20261102": { total_calories_consumed: 1800 } }).db);
    expect(await getLog("a")).toEqual({ "2026-11-02": { total_calories_consumed: 1800 } });
    expect(await getLog("inconnu")).toEqual({});
  });

  it("getLog lève si la lecture échoue (jamais {} à la place d'une erreur)", async () => {
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "select" }).db);
    await expect(getLog("a")).rejects.toThrow(/Lecture du journal nutrition impossible/);
    await expect(getStrategy("a")).rejects.toThrow(/stratégie/);
  });

  it("getDays renvoie des lignes datées, bornées", async () => {
    setDbForTests(seed({
      "2026-10-31": { total_calories_consumed: 2000 },
      "2026-11-02": { total_calories_consumed: 1800, glucides_consumed: 150 },
    }).db);
    const days = await getDays("a", "2026-11-01", "2026-11-07");
    expect(days).toEqual([{
      date: "2026-11-02", active_calories: null, total_calories_consumed: 1800,
      glucides_consumed: 150, lipides_consumed: null, proteines_consumed: null,
    }]);
  });

  it("saveDay passe par la RPC, un jour à la fois : les autres jours restent", async () => {
    const { db, tables } = seed({ "2026-11-01": { total_calories_consumed: 2000 } });
    setDbForTests(db);
    await saveDay("a", "2026-11-02", { total_calories_consumed: 1900, junk: 1 } as never);
    const value = tables.app_data.find((r) => r.athlete_id === "a")!.value as Record<string, Record<string, unknown>>;
    expect(Object.keys(value).sort()).toEqual(["2026-11-01", "2026-11-02"]);
    expect(value["2026-11-02"]).toEqual({
      active_calories: null, total_calories_consumed: 1900, glucides_consumed: null,
      lipides_consumed: null, proteines_consumed: null,
    });
  });

  it("saveDay crée le journal s'il n'existe pas, refuse un jour mal formé et remonte un refus", async () => {
    const { db, tables } = fakeDb({}, undefined, { nutrition_save_day: saveDayRpc });
    setDbForTests(db);
    await saveDay("c", "2026-11-08", { total_calories_consumed: 1500 });
    expect(Object.keys(tables.app_data[0].value as object)).toEqual(["2026-11-08"]);
    await expect(saveDay("c", "20261108", {})).rejects.toThrow(/Journée nutrition invalide/);
    setDbForTests(fakeDb({}, { table: "nutrition_save_day", op: "rpc" }).db);
    await expect(saveDay("c", "2026-11-08", {})).rejects.toThrow(/Enregistrement de la journée impossible/);
  });

  it("stratégie : lecture, null si absente, écriture", async () => {
    const { db, tables } = fakeDb({ app_data: [] });
    setDbForTests(db);
    expect(await getStrategy("a")).toBeNull();
    await saveStrategy("a", { strategy: "seche", can_track_calories: false, surplus_deficit_min: -15, surplus_deficit_max: -15 });
    expect(await getStrategy("a")).toMatchObject({ strategy: "seche", surplus_deficit_min: -15 });
    expect(tables.app_data).toHaveLength(1);
  });

  it("invalidateNutrition couvre stratégie, journal et Retours", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateNutrition(qc as never, "a");
    const keys = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual([nutritionKeys.all("a"), ["weeklyRetours", "a"], ["monthlyRetours", "a"]]);
    expect(nutritionKeys.days("a", "2026-11-01", "2026-11-07").slice(0, 2)).toEqual(nutritionKeys.all("a"));
  });
});
