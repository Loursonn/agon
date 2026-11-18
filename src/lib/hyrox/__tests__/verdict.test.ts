import { describe, expect, it } from "vitest";
import type { HyroxReferenceSegment } from "@/features/shared/types/hyrox";
import type { RefLookup } from "../calc";
import { race } from "../objective/__tests__/fixtures";
import type { EffortAxis } from "../effortProfile";
import type { StrategyResult } from "../objective/strategy";
import { profileSentence, raceVerdict, sourceLabel, tierLabel, tierOf, topRange, verdictProfile } from "../verdict";

// Références pyrox S7-S9, Femmes open, toutes tranches (reference_data.sql).
const W: Record<string, [number, number, number, number, number, number, number, number]> = {
  //            p1    p5    p10   p25   p50   p75   p90   n
  ski: [268, 279, 286, 297, 312, 329, 346, 145695],
  sled_push: [101, 117, 127, 144, 167, 195, 225, 145625],
  sled_pull: [211, 239, 256, 288, 333, 387, 447, 145672],
  bbj: [209, 253, 277, 323, 384, 458, 535, 145606],
  row: [279, 291, 297, 310, 326, 344, 363, 145604],
  farmers: [91, 102, 108, 119, 134, 155, 180, 145580],
  lunges: [171, 208, 225, 257, 298, 349, 402, 145697],
  wall_balls: [215, 253, 276, 319, 380, 461, 551, 145641],
  roxzone_total: [243, 291, 320, 377, 454, 551, 665, 134855],
  run_total: [1923, 2134, 2247, 2458, 2719, 3002, 3262, 138339],
  total: [4098, 4439, 4648, 5050, 5575, 6176, 6686, 145698],
};
const refs: RefLookup = (division, segment) => {
  const v = division === "women" ? W[segment] : undefined;
  if (!v) return undefined;
  const [p1, p5, p10, p25, p50, p75, p90, n] = v;
  return {
    id: segment, division, bracket: "all", segment, p1_s: p1, p5_s: p5, p10_s: p10, p25_s: p25, p50_s: p50, p75_s: p75, p90_s: p90,
    source: `pyrox S7-S9 (n=${n})`, is_estimate: false, sample_size: n,
  } as HyroxReferenceSegment;
};

// Léa Démo, HYROX Paris 16/09/2026 (seed démo) : 1:17:38.
const lea = race({
  division: "women",
  run_1_s: 290, run_2_s: 296, run_3_s: 298, run_4_s: 299, run_5_s: 300, run_6_s: 300, run_7_s: 302, run_8_s: 305,
  ski_s: 262, sled_push_s: 215, sled_pull_s: 262, bbj_s: 300, row_s: 270, farmers_s: 138, lunges_s: 250, wall_balls_s: 355,
  roxzone_total_s: 216, rank_overall: 412, participants_overall: 2310,
});
const strategy: StrategyResult = {
  currentS: 4658, possibleS: 4576, runLoss: {},
  levers: [
    { key: "no_reps", group: "strategie", label: "No reps wall balls", gainS: 20, detail: "" },
    { key: "sled_push", group: "capacite", label: "Sled push", gainS: 52, detail: "" },
    { key: "farmers", group: "capacite", label: "Farmers", gainS: 10, detail: "" },
  ],
} as StrategyResult;

const axis = (key: EffortAxis["key"], pct: number | null): EffortAxis => ({
  key, label: key, actualS: null, top1S: null, medianS: null, pct, rankValue: pct == null ? null : 100 - pct,
  levelPct: null, levelValue: null, levelClipped: false,
});

describe("tierOf / tierLabel", () => {
  it("paliers validés (Q1)", () => {
    expect([1, 2, 5, 6, 25, 26, 50, 51, 99].map(tierOf)).toEqual(
      ["elite", "tres_haut", "tres_haut", "avance", "avance", "confirme", "confirme", "progression", "progression"],
    );
  });
  it("accord avec la catégorie", () => {
    expect(tierLabel("avance", "women")).toBe("Avancée");
    expect(tierLabel("avance", "men")).toBe("Avancé");
    expect(tierLabel("confirme", "mixed")).toBe("Confirmé");
  });
});

describe("sourceLabel", () => {
  it("pyrox", () => expect(sourceLabel("pyrox S7-S9 (n=145698)")).toBe("saisons 7 à 9 (pyrox)"));
  it("autre source gardée", () => expect(sourceLabel("RoxHype 2025")).toBe("RoxHype 2025"));
});

describe("raceVerdict — Léa Démo", () => {
  const v = raceVerdict({ race: lea, refs, objective: { targetS: 4883, deltaS: -225, state: "ahead" }, strategy });

  it("top X % arrondi vers le haut, jamais flatteur", () => {
    // 4658 s entre p10 (4648) et p25 (5050) : 10,37 → 11.
    expect(v.level).toMatchObject({ topPct: 11, tier: "avance", tierLabel: "Avancée", categoryLabel: "Femmes open", sampleSize: 145698, source: "saisons 7 à 9 (pyrox)" });
    expect(v.place).toEqual({ rank: 412, of: 2310 });
  });

  it("points forts, freins et phrase de profil", () => {
    expect(v.profile?.strengths.map((a) => a.key)).toEqual(["ski", "row", "roxzone"]);
    expect(v.profile?.strengths.every((a) => a.topPct === 1)).toBe(true);
    expect(v.profile?.brakes.map((a) => a.key)).toEqual(["sled_push", "farmers"]);
    expect(v.profile?.sentence).toBe("Profil ergo : très forte sur les machines, freinée par les charges lourdes.");
  });

  it("marge : leviers classés, possible = somme", () => {
    expect(v.margin).toEqual({
      possibleS: 4576, gainS: 82,
      levers: [{ label: "Sled push", gainS: 52 }, { label: "No reps wall balls", gainS: 20 }, { label: "Farmers", gainS: 10 }],
    });
  });

  it("radar : 10 axes avec un rang", () => {
    expect(v.axes).toHaveLength(10);
    expect(v.axes.every((a) => a.rankValue != null)).toBe(true);
  });
});

describe("raceVerdict — sans rang", () => {
  it("simulation : ni niveau ni profil, l'objectif reste", () => {
    const v = raceVerdict({ race: { ...lea, is_official: false }, refs, objective: { targetS: 4883, deltaS: -225, state: "ahead" }, strategy: null });
    expect(v.level).toBeNull();
    expect(v.profile).toBeNull();
    expect(v.margin).toBeNull();
    expect(v.objective?.deltaS).toBe(-225);
  });
  it("pas de référence pour la catégorie (règle 3)", () => {
    const v = raceVerdict({ race: { ...lea, division: "men" }, refs, objective: null, strategy });
    expect(v.level).toBeNull();
    expect(v.profile).toBeNull();
  });
});

describe("verdictProfile", () => {
  it("un frein est toujours nommé, même si tout est fort", () => {
    const p = verdictProfile([axis("ski", 2), axis("row", 3), axis("run", 10)], "men");
    expect(p?.brakes.map((a) => a.key)).toEqual(["run"]);
    expect(p?.strengths.map((a) => a.key)).toEqual(["ski", "row"]);
  });
  it("aucun point fort du top 25 % : le meilleur axe", () => {
    const p = verdictProfile([axis("ski", 40), axis("row", 60), axis("run", 80)], "men");
    expect(p?.strengths.map((a) => a.key)).toEqual(["ski"]);
    expect(p?.brakes.map((a) => a.key)).toEqual(["run", "row"]);
  });
  it("moins de deux axes classés : pas de profil", () => {
    expect(verdictProfile([axis("ski", 40), axis("row", null)], "men")).toBeNull();
  });
});

describe("profileSentence", () => {
  it("profil équilibré sous 20 points d'écart", () => {
    expect(profileSentence([axis("ski", 30), axis("sled_push", 40), axis("run", 35)], "men"))
      .toBe("Profil équilibré : moins de 20 points d'écart de rang entre les machines, la course, les charges lourdes.");
  });
  it("coureur au masculin", () => {
    expect(profileSentence([axis("run", 15), axis("sled_push", 60), axis("bbj", 40)], "men"))
      .toBe("Profil coureur : fort sur la course, freiné par les charges lourdes.");
  });
  it("une seule famille : pas de phrase", () => {
    expect(profileSentence([axis("ski", 5), axis("row", 60)], "women")).toBeNull();
  });
});

describe("topRange", () => {
  it("un seul rang ou une plage", () => {
    expect(topRange([{ key: "ski", label: "", topPct: 1 }, { key: "row", label: "", topPct: 1 }])).toBe("top 1 %");
    expect(topRange([{ key: "ski", label: "", topPct: 1 }, { key: "row", label: "", topPct: 5 }])).toBe("top 1 à 5 %");
  });
});
