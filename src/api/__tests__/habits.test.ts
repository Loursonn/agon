import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  defaultHabitSince, getHabitLogs, getHabitTrackerEnabled, getHabits, habitKeys, invalidateHabits,
  logHabit, setHabitDone, setHabitTrackerEnabled, unlogHabit,
} from "@/api/habits";

afterEach(() => setDbForTests(null));

describe("api/habits", () => {
  it("getHabits : actives de l'athlète seulement ; lève si illisible", async () => {
    setDbForTests(fakeDb({ habits: [
      { id: "h1", athlete_id: "a", name: "Eau", is_active: true, sort_order: 2 },
      { id: "h2", athlete_id: "a", name: "Old", is_active: false, sort_order: 1 },
      { id: "h3", athlete_id: "a", name: "Sommeil", is_active: true, sort_order: 1 },
      { id: "h4", athlete_id: "b", name: "Autre", is_active: true, sort_order: 0 },
    ] }).db);
    expect((await getHabits("a")).map((h) => h.id)).toEqual(["h3", "h1"]);
    setDbForTests(fakeDb({}, { table: "habits", op: "select" }).db);
    await expect(getHabits("a")).rejects.toThrow(/Lecture des habitudes impossible/);
  });

  it("getHabitLogs : jours cochés par habitude, depuis la borne", async () => {
    setDbForTests(fakeDb({ habit_logs: [
      { habit_id: "h1", athlete_id: "a", date: "2026-11-01" },
      { habit_id: "h1", athlete_id: "a", date: "2026-11-02" },
      { habit_id: "h3", athlete_id: "a", date: "2026-11-02" },
      { habit_id: "h1", athlete_id: "a", date: "2025-01-01" },
    ] }).db);
    expect(await getHabitLogs("a", "2026-01-01")).toEqual({ h1: ["2026-11-01", "2026-11-02"], h3: ["2026-11-02"] });
    expect(defaultHabitSince("2026-11-08")).toBe("2025-11-08");
  });

  it("tracker : lecture (faux par défaut) et écriture", async () => {
    const { db, tables } = fakeDb({ profiles: [{ id: "a", habit_tracker_enabled: null }] });
    setDbForTests(db);
    expect(await getHabitTrackerEnabled("a")).toBe(false);
    await setHabitTrackerEnabled("a", true);
    expect(tables.profiles[0].habit_tracker_enabled).toBe(true);
    expect(await getHabitTrackerEnabled("a")).toBe(true);
    expect(await getHabitTrackerEnabled("inconnu")).toBe(false);
  });

  it("cocher / décocher un jour, sans toucher aux autres ; jour mal formé refusé", async () => {
    const { db, tables } = fakeDb({ habit_logs: [{ habit_id: "h1", athlete_id: "a", date: "2026-11-01" }] });
    setDbForTests(db);
    await logHabit("a", "h1", "2026-11-02");
    expect(tables.habit_logs.map((r) => r.date)).toEqual(["2026-11-01", "2026-11-02"]);
    await unlogHabit("a", "h1", "2026-11-01");
    expect(tables.habit_logs.map((r) => r.date)).toEqual(["2026-11-02"]);
    await expect(logHabit("a", "h1", "20261102")).rejects.toThrow(/Jour d'habitude invalide/);
  });

  it("setHabitDone coche / décoche et renvoie les jours à jour, sans doublon", async () => {
    const { db, tables } = fakeDb({ habit_logs: [] });
    setDbForTests(db);
    expect(await setHabitDone("a", "h1", "2026-11-02", true, ["2026-11-01"])).toEqual(["2026-11-01", "2026-11-02"]);
    expect(await setHabitDone("a", "h1", "2026-11-02", true, ["2026-11-01", "2026-11-02"])).toEqual(["2026-11-01", "2026-11-02"]);
    expect(tables.habit_logs).toHaveLength(1);
    expect(await setHabitDone("a", "h1", "2026-11-02", false, ["2026-11-01", "2026-11-02"])).toEqual(["2026-11-01"]);
    expect(tables.habit_logs).toHaveLength(0);
  });

  it("invalidateHabits vise le préfixe de l'athlète", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateHabits(qc as never, "a");
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["habits", "a"] });
    expect(habitKeys.logs("a", "2026-01-01").slice(0, 2)).toEqual(["habits", "a"]);
  });
});
