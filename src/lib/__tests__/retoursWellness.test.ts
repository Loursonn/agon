import { describe, expect, it } from "vitest";
import { archivedWellnessOf, parseWellnessHistory } from "@shared/domain/wellness";
import { averageWellness, dailyWellness } from "../retoursWellness";

// Format réel de la prod : clés compactes "YYYYMMDD".
const wh = {
  "20261102": { fatigue: 4, sommeil: 4, stress: 4, energie: 4, doms: 4, score: 10 },
  "20261104": { fatigue: 2, sommeil: 3, energie: 2, doms: 2 }, // stress manquant
  "20261105": { fatigue: 5, sommeil: 5, stress: 5, energie: 5, doms: 5, injComment: "cheville" },
  "3": 4, // clé parasite
};
const blockHistory = [{ wellnessHistory: { "20261001": { fatigue: 3, sommeil: 3, stress: 3, energie: 3, doms: 3 } } }];

describe("retoursWellness", () => {
  const h = parseWellnessHistory(wh, archivedWellnessOf(blockHistory));

  it("lit les clés compactes et l'archive, écarte les clés non datées", () => {
    expect(Object.keys(h).sort()).toEqual(["2026-10-01", "2026-11-02", "2026-11-04", "2026-11-05"]);
  });

  it("recalcule le score (ignore celui stocké) et laisse null si une note manque", () => {
    const days = dailyWellness(h, "2026-11-02", "2026-11-08");
    expect(Object.keys(days)).toHaveLength(7);
    expect(days["2026-11-02"]?.score).toBe(80);
    expect(days["2026-11-03"]).toBeNull();
    expect(days["2026-11-04"]).toMatchObject({ score: null, stress: null, fatigue: 2 });
    expect(days["2026-11-05"]).toMatchObject({ score: 100, injuryNote: "cheville" });
  });

  it("moyenne sans compter les scores absents", () => {
    expect(averageWellness(h, "2026-11-02", "2026-11-08")).toBe(90);
    expect(averageWellness(h, "2026-12-01", "2026-12-07")).toBeNull();
  });
});
