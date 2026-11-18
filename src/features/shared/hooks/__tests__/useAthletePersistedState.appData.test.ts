/**
 * Ancien stockage `app_data` : lu en deux requêtes groupées (clés globales, puis
 * clés du cycle ouvert), et le miroir des clés globales n'est réécrit que s'il
 * diffère (avant : ~16 lectures et 3 réécritures à chaque ouverture de l'app).
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { localIsoDay, addDays } from "@shared/domain/dates";
import { setDbForTests } from "@/api/client";
import { _resetLoadGuard, isKeyLoadFailed, SKEYS } from "@/lib/storage";
import { useAthletePersistedState } from "../useAthletePersistedState";

const today = localIsoDay();
const CYCLE = "c1";
const exos = { s1: [{ name: "Squat" }] };
const sessions = [{ id: "s1", name: "Bas du corps" }];
const completed = { 1: ["s1"] };

function data(legacy: { exos: unknown; sessions: unknown; completed: unknown }) {
  return {
    cycles: [{ id: CYCLE, athlete_id: "a", name: "Cycle", start_date: addDays(today, -7), end_date: addDays(today, 21), objective: null }],
    app_data: [
      { athlete_id: "a", key: "asp:percycle_migrated", value: true },
      { athlete_id: "a", key: SKEYS.goals, value: { sessionsPerWeek: 4, sleepTarget: 8 } },
      { athlete_id: "a", key: "asp:visibility", value: { nutrition: false } },
      { athlete_id: "a", key: `${SKEYS.exos}::${CYCLE}`, value: exos },
      { athlete_id: "a", key: `${SKEYS.sessions}::${CYCLE}`, value: sessions },
      { athlete_id: "a", key: `${SKEYS.completed}::${CYCLE}`, value: completed },
      { athlete_id: "a", key: SKEYS.exos, value: legacy.exos },
      { athlete_id: "a", key: SKEYS.sessions, value: legacy.sessions },
      { athlete_id: "a", key: SKEYS.completed, value: legacy.completed },
    ],
  };
}

/** Base simulée qui compte les requêtes `app_data` (lectures / écritures). */
function counted(tables: Record<string, unknown[]>, failOn?: { table: string; op: string }) {
  const fake = fakeDb(tables as never, failOn);
  const count = { reads: 0, writes: [] as string[] };
  const db = new Proxy(fake.db as object, {
    get(target, prop) {
      if (prop !== "from") return Reflect.get(target, prop);
      return (table: string) => {
        const q = (target as { from: (t: string) => Record<string, (...a: unknown[]) => unknown> }).from(table);
        if (table !== "app_data") return q;
        return new Proxy(q, {
          get(qt, p) {
            const v = Reflect.get(qt, p);
            if (p === "select") return (...a: unknown[]) => { count.reads++; return (v as (...x: unknown[]) => unknown).apply(qt, a); };
            if (p === "upsert") return (row: { key: string }, ...a: unknown[]) => { count.writes.push(row.key); return (v as (...x: unknown[]) => unknown).apply(qt, [row, ...a]); };
            return v;
          },
        });
      };
    },
  });
  return { db, count, tables: fake.tables };
}

afterEach(() => { setDbForTests(null); _resetLoadGuard(); });

describe("useAthletePersistedState — app_data groupé", () => {
  it("deux lectures app_data en tout, et aucune réécriture si le miroir est déjà à jour", async () => {
    const c = counted(data({ exos, sessions, completed }));
    setDbForTests(c.db);
    const { result } = renderHook(() => useAthletePersistedState("a"));
    await waitFor(() => expect(result.current.exos).toEqual(exos));
    const s = result.current;
    expect(s.goals).toEqual({ sessionsPerWeek: 4, sleepTarget: 8 });
    expect(s.visibilitySettings.nutrition).toBe(false);
    expect(s.visibilitySettings.muscu).toBe(true);
    expect(s.sessions).toEqual(sessions);
    expect(s.completedSessions).toEqual(completed);
    await new Promise((r) => setTimeout(r, 20));
    expect(c.count.reads).toBe(2);
    expect(c.count.writes).toEqual([]);
  });

  it("miroir différent : seules les clés globales qui diffèrent sont réécrites", async () => {
    const c = counted(data({ exos: {}, sessions, completed: {} }));
    setDbForTests(c.db);
    const { result } = renderHook(() => useAthletePersistedState("a"));
    await waitFor(() => expect(c.count.writes.length).toBe(2));
    expect(result.current.exos).toEqual(exos);
    expect(c.count.writes.sort()).toEqual([SKEYS.completed, SKEYS.exos].sort());
    const legacyExos = (c.tables.app_data as { key: string; value: unknown }[]).find((r) => r.key === SKEYS.exos);
    expect(legacyExos?.value).toEqual(exos);
  });

  it("lecture groupée en erreur : chaque clé reste bloquée en écriture", async () => {
    const c = counted(data({ exos, sessions, completed }), { table: "app_data", op: "select" });
    setDbForTests(c.db);
    const { result } = renderHook(() => useAthletePersistedState("a"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(isKeyLoadFailed(SKEYS.goals, "a")).toBe(true);
    expect(isKeyLoadFailed(SKEYS.sets, "a")).toBe(true);
    expect(result.current.unloadedKeys).toEqual(expect.arrayContaining([SKEYS.goals, SKEYS.sets]));
    expect(result.current.goals).toEqual({ sessionsPerWeek: 6, sleepTarget: 8 });
    expect(c.count.writes).toEqual([]);
  });
});
