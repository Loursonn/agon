/**
 * Les clés santé (wellness, pesées, paliers, objectif) viennent des tables
 * (`src/api`), mais le contexte garde les formes des anciennes clés `asp:*`
 * (docs/SANTE_TABLES.md) : composants inchangés.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { localIsoDay, toCompactDay } from "@shared/domain/dates";
import { setDbForTests } from "@/api/client";
import { _resetLoadGuard, isKeyLoadFailed, SKEYS } from "@/lib/storage";
import { useAthletePersistedState } from "../useAthletePersistedState";

const blank = {
  fatigue: null, sommeil: null, stress: null, energie: null, doms: null,
  bedtime: null, wake: null, sleep_hours: null, sleep_interrupted: null, sleep_interrupt_note: null,
  doms_zones: [], doms_points: [], injury_note: null, weight_kg: null, archived: false,
};
const today = localIsoDay();

function tables() {
  return {
    wellness_entries: [
      { athlete_id: "a", day: "2026-11-06", ...blank, fatigue: 4, sommeil: 4, stress: 4, energie: 4, doms: 4, injury_note: "Genou" },
      { athlete_id: "a", day: today, ...blank, fatigue: 3, sommeil: 3, stress: 3, energie: 3, doms: 3 },
      { athlete_id: "a", day: "2026-09-01", ...blank, fatigue: 5, archived: true },
      { athlete_id: "b", day: "2026-11-06", ...blank, fatigue: 1 },
    ],
    body_weight_logs: [{ athlete_id: "a", day: "2026-11-05", kg: 70.5 }, { athlete_id: "a", day: "2026-11-06", kg: "70.2" }, { athlete_id: "b", day: "2026-11-06", kg: 99 }],
    body_weight_milestones: [{ athlete_id: "a", day: "2026-11-01", kg: 71 }],
    body_weight_goals: [{ athlete_id: "a", reference_kg: 71, target_kg: 68 }],
  };
}

afterEach(() => { setDbForTests(null); _resetLoadGuard(); });

describe("useAthletePersistedState — lecteurs santé", () => {
  it("rend les formes des anciennes clés (clés compactes, objectif 0 si absent)", async () => {
    setDbForTests(fakeDb(tables()).db);
    const { result } = renderHook(() => useAthletePersistedState("a"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const s = result.current;
    // asp:wh : jours compacts, sans l'archive ; une saisie = l'ancien WellnessData
    expect(Object.keys(s.wellnessHistory).sort()).toEqual(["20261106", toCompactDay(today)].sort());
    expect(s.wellnessHistory["20261106"]).toMatchObject({ date: "20261106", fatigue: 4, injComment: "Genou" });
    // asp:wellness : la saisie d'aujourd'hui seulement
    expect(s.wellness).toMatchObject({ date: toCompactDay(today), fatigue: 3 });
    expect(s.weightLog).toEqual({ "20261105": 70.5, "20261106": 70.2 });
    expect(s.weightMilestones).toEqual([{ date: "20261101", kg: 71 }]);
    expect(s.bodyWeight).toEqual({ current: 71, target: 68 });
  });

  it("athlète sans rien : défauts d'avant, objectif { current: 0, target: 0 }", async () => {
    setDbForTests(fakeDb(tables()).db);
    const { result } = renderHook(() => useAthletePersistedState("z"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const s = result.current;
    expect(s.wellnessHistory).toEqual({});
    expect(s.wellness).toBeNull();
    expect(s.weightLog).toEqual({});
    expect(s.weightMilestones).toEqual([]);
    expect(s.bodyWeight).toEqual({ current: 0, target: 0 });
  });

  it("lecture en erreur : l'écriture de la clé est bloquée (le défaut n'écrase pas la base)", async () => {
    setDbForTests(fakeDb(tables(), { table: "body_weight_logs", op: "select" }).db);
    const { result } = renderHook(() => useAthletePersistedState("a"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(isKeyLoadFailed(SKEYS.weightLog, "a")).toBe(true);
    expect(isKeyLoadFailed(SKEYS.wellnessHistory, "a")).toBe(false);
    expect(result.current.unloadedKeys).toContain(SKEYS.weightLog);
    expect(result.current.weightLog).toEqual({});
  });
});
