import { describe, expect, it } from "vitest";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";
import { byRank, effortProfile, levelRadius } from "../effortProfile";
import { objectiveForRace } from "../objective/forRace";
import { race } from "../objective/__tests__/fixtures";

// Percentiles Femmes open, toutes tranches (pyrox S7-S9, extrait de reference_data.sql).
const P: Record<string, [number, number, number, number, number, number, number]> = {
  run_total: [1923, 2134, 2247, 2458, 2719, 3002, 3262],
  ski: [268, 279, 286, 297, 312, 329, 346],
  sled_push: [101, 117, 127, 144, 167, 195, 225],
  sled_pull: [211, 239, 256, 288, 333, 387, 447],
  bbj: [209, 253, 277, 323, 384, 458, 535],
  row: [279, 291, 297, 310, 326, 344, 363],
  farmers: [91, 102, 108, 119, 134, 155, 180],
  lunges: [171, 208, 225, 257, 298, 349, 402],
  wall_balls: [215, 253, 276, 319, 380, 461, 551],
  roxzone_total: [243, 291, 320, 377, 454, 551, 665],
};
const refs = (division: string, segment: string, bracket: string): HyroxReferenceSegment | undefined => {
  const p = division === "women" && bracket === "all" ? P[segment] : undefined;
  return p && {
    id: segment, division, bracket, segment, source: "pyrox", is_estimate: false, sample_size: 1000,
    p1_s: p[0], p5_s: p[1], p10_s: p[2], p25_s: p[3], p50_s: p[4], p75_s: p[5], p90_s: p[6],
  };
};

// HYROX Paris de Léa Démo (scripts/seed-demo.mjs).
const paris = race({
  division: "women",
  run_1_s: 268, run_2_s: 292, run_3_s: 300, run_4_s: 298, run_5_s: 305, run_6_s: 310, run_7_s: 312, run_8_s: 305,
  ski_s: 262, sled_push_s: 215, sled_pull_s: 262, bbj_s: 300, row_s: 270, farmers_s: 138, lunges_s: 250, wall_balls_s: 355,
  roxzone_total_s: 216,
});

describe("profil d'effort", () => {
  const objective = objectiveForRace(paris, [])!.objective.segments;
  const axes = effortProfile(paris, refs, objective);
  const ax = (k: string) => axes.find((a) => a.key === k)!;

  it("10 axes : course, 8 stations, Roxzone", () => {
    expect(axes.map((a) => a.key)).toEqual(["run", "ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls", "roxzone"]);
  });

  it("rang dans toute la catégorie, temps du top 1 % et médiane", () => {
    expect(ax("ski")).toMatchObject({ actualS: 262, top1S: 268, medianS: 312, pct: 1, rankValue: 99 });
    expect(ax("sled_push")).toMatchObject({ actualS: 215, top1S: 101, pct: 85, rankValue: 15 });
    // Course : allure par km, réalisée et de référence.
    expect(ax("run")).toMatchObject({ actualS: 299, top1S: 240, medianS: 340, pct: 20 });
  });

  it("niveau = objectif ÷ réalisé ; la course vaut 100 % sur son run du jour", () => {
    expect(ax("run").levelPct).toBe(100);
    expect(ax("sled_push")).toMatchObject({ levelPct: 74, levelClipped: false });
    expect(ax("roxzone")).toMatchObject({ levelPct: 175, levelValue: 100, levelClipped: true });
  });

  it("sans référence ni objectif : « — », jamais 0", () => {
    const duo = effortProfile({ ...paris, division: "men" }, refs, null);
    expect(duo.every((a) => a.pct == null && a.levelPct == null && a.rankValue == null)).toBe(true);
    expect(duo[1].actualS).toBe(262);
  });

  it("classement du meilleur rang au moins bon", () => {
    expect(byRank(axes).slice(-2).map((a) => a.key)).toEqual(["farmers", "sled_push"]);
  });

  it("échelle du niveau : 100 % au milieu, bornée", () => {
    expect(levelRadius(100)).toEqual({ value: 50, clipped: false });
    expect(levelRadius(140)).toEqual({ value: 100, clipped: false });
    expect(levelRadius(50)).toEqual({ value: 0, clipped: true });
  });
});
