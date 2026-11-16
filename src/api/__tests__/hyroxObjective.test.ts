import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  deleteSeasonGoal, hyroxObjectiveKeys, invalidateHyroxObjective, listSeasonGoals, saveSeasonGoal,
} from "@/api/hyroxObjective";

afterEach(() => setDbForTests(null));

describe("objectifs de saison HYROX", () => {
  it("crée, remplace le même couple saison × division, liste la plus récente d'abord, supprime", async () => {
    const { db, tables } = fakeDb({
      hyrox_season_goals: [
        { id: "g1", athlete_id: "a", season: "2025-26", division: "women", run_avg_s: 310, note: null },
        { id: "x", athlete_id: "b", season: "2026-27", division: "women", run_avg_s: 280, note: null },
      ],
    });
    setDbForTests(db);
    await saveSeasonGoal({ athlete_id: "a", season: "2026-27", division: "women", run_avg_s: 299.6, note: null }, "coach");
    await saveSeasonGoal({ athlete_id: "a", season: "2026-27", division: "women", run_avg_s: 295, note: "Tenerife" }, "coach");
    const goals = await listSeasonGoals("a");
    expect(goals.map((g) => [g.season, g.run_avg_s, g.note])).toEqual([["2026-27", 295, "Tenerife"], ["2025-26", 310, null]]);
    await deleteSeasonGoal("g1");
    expect(tables.hyrox_season_goals.map((g) => g.athlete_id).sort()).toEqual(["a", "b"]);
  });

  it("refuse un run moyen hors bornes ; une lecture en erreur lève", async () => {
    const { db } = fakeDb({}, { table: "hyrox_season_goals", op: "select" });
    setDbForTests(db);
    await expect(saveSeasonGoal({ athlete_id: "a", season: "2026-27", division: "men", run_avg_s: 90, note: null }, null)).rejects.toThrow("hors bornes");
    await expect(listSeasonGoals("a")).rejects.toThrow("Objectifs de saison non chargés");
  });

  it("invalide les objectifs de l'athlète", async () => {
    const qc = new QueryClient();
    qc.setQueryData(hyroxObjectiveKeys.seasonGoals("a"), []);
    qc.setQueryData(hyroxObjectiveKeys.seasonGoals("b"), []);
    await invalidateHyroxObjective(qc, "a");
    expect(qc.getQueryState(hyroxObjectiveKeys.seasonGoals("a"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(hyroxObjectiveKeys.seasonGoals("b"))?.isInvalidated).toBe(false);
  });
});
