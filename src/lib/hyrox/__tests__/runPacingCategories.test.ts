import { describe, expect, it } from "vitest";
import type { HyroxReferenceSegment, HyroxResult } from "@/features/shared/types/hyrox";
import { POSITION_BRACKET, percentile, timeAtPercentile, type RefLookup } from "@/lib/hyrox/calc";
import { cruisePace, cruiseSpread, excessLevel, levelRunPattern, stationRunCosts } from "@/lib/hyrox/runPacing";
import { categoryOptions, crossFormatNote, raceCategory, raceFormat } from "@/lib/hyrox/categories";

const runs = (v: number[]) => (k: string) => {
  const i = Number(k.replace("run_", "")) - 1;
  return Number.isInteger(i) && i >= 0 && i < v.length ? v[i] : null;
};

describe("allure de croisière (runs 2 à 7)", () => {
  it("médiane des runs 2 à 7, run 1 et run 8 ignorés", () => {
    expect(cruisePace(runs([200, 300, 310, 320, 330, 340, 350, 500]))).toBe(325);
    expect(cruisePace(runs([200, 300, 310]))).toBeNull(); // moins de 3 runs comparables
  });

  it("coût de chaque station sur le run suivant, comparé à l'habituel du niveau", () => {
    const athlete = runs([270, 300, 330, 300, 300, 300, 310, 320]);
    const level = levelRunPattern(runs([280, 290, 300, 290, 290, 290, 295, 305]))!;
    expect(level.cruiseS).toBe(290);
    const costs = stationRunCosts(athlete, level);
    expect(costs.map((c) => c.station)).toEqual(["ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges"]);
    const push = costs.find((c) => c.station === "sled_push")!;
    // Run 3 : +30 vs croisière (300) ; d'habitude +10 → surcoût 20.
    expect(push).toMatchObject({ run: "run_3", costS: 30, usualS: 10, excessS: 20, special: false });
    expect(costs.find((c) => c.station === "lunges")!.special).toBe(true);
    expect(excessLevel(20)).toBe("bad");
    expect(excessLevel(12)).toBe("warn");
    expect(excessLevel(null)).toBe("ok");
  });

  it("écart des runs 2 à 7 et écart habituel", () => {
    const s = cruiseSpread(runs([200, 300, 330, 300, 305, 300, 310, 500]), runs([0, 290, 300, 290, 290, 290, 295, 0]))!;
    expect(s).toEqual({ spreadS: 30, usualSpreadS: 10, fastest: "run_2", slowest: "run_3" });
  });
});

const ref = (division: string, bracket: string, segment: string, p: number[]): HyroxReferenceSegment => ({
  id: `${division}-${bracket}-${segment}`, division, bracket, segment,
  p1_s: p[0], p5_s: p[1], p10_s: p[2], p25_s: p[3], p50_s: p[4], p75_s: p[5], p90_s: p[6],
  source: "test", is_estimate: false, sample_size: 1000,
});

// SkiErg hommes : la tranche « moins de 1:10 » est bien plus serrée que la catégorie entière (données pyrox).
const REFS = [
  ref("men", "all", "ski", [235, 244, 249, 259, 271, 286, 301]),
  ref("men", "sub70", "ski", [227, 234, 238, 244, 252, 259, 267]),
  ref("men", "all", "total", [3600, 3900, 4100, 4500, 5000, 5600, 6200]),
  ref("doubles_men", "all", "total", [3300, 3500, 3700, 4000, 4400, 4900, 5400]),
  ref("men_pro", "all", "total", [3500, 3700, 3850, 4150, 4550, 5000, 5500]),
];
const lookup: RefLookup = (d, s, b) => REFS.find((r) => r.division === d && r.segment === s && r.bracket === b);

const race = (o: Partial<HyroxResult> = {}): HyroxResult => ({
  id: "r", athlete_id: "a", competition_id: null, created_by: null, date: "2026-10-01", event_name: "HYROX Test", venue: null,
  format: "solo", division: "men", age_group: null, is_official: true, status: "finished", total_s: 4000,
  run_1_s: 240, run_2_s: 250, run_3_s: 260, run_4_s: 255, run_5_s: 258, run_6_s: 256, run_7_s: 262, run_8_s: 270,
  ski_s: 255, sled_push_s: 150, sled_pull_s: 200, bbj_s: 220, row_s: 270, farmers_s: 100, lunges_s: 220, wall_balls_s: 280,
  roxzone_total_s: 300, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: null, rank_age_group: null, participants_overall: null, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "", updated_at: "",
  ...o,
});

describe("calibrage : position dans toute la catégorie, seuils nets", () => {
  it("un SkiErg de 4:15 est dans le bon tiers des hommes open, pas un point faible", () => {
    const all = percentile(255, lookup("men", "ski", POSITION_BRACKET)!)!;
    const tranche = percentile(255, lookup("men", "ski", "sub70")!)!;
    expect(all).toBeLessThanOrEqual(35);
    // Dans la seule tranche < 1:10, le même temps passerait au-dessus de la médiane.
    expect(tranche).toBeGreaterThan(50);
  });

  it("percentile ↔ temps : aller-retour", () => {
    const r = lookup("men", "total", "all")!;
    expect(timeAtPercentile(r, 25)).toBe(4500);
    // Position arrondie à l'unité : l'aller-retour reste à quelques secondes près.
    expect(Math.abs(timeAtPercentile(r, percentile(4300, r)!)! - 4300)).toBeLessThan(30);
  });
});

describe("catégories : format + division", () => {
  it("« Doubles » + « Men » se compare aux doubles hommes", () => {
    expect(raceCategory({ format: "doubles", division: "men" })).toBe("doubles_men");
    expect(raceCategory({ format: "doubles", division: "women_pro" })).toBe("doubles_women_pro");
    expect(raceCategory({ format: "relay", division: "women" })).toBe("relay_women");
    expect(raceCategory({ format: "solo", division: "doubles_men" })).toBe("men");
    expect(raceCategory({ format: "sim_full", division: "women" })).toBe("women");
    expect(raceCategory({ format: "doubles", division: "doubles_mixed" })).toBe("doubles_mixed");
    expect(raceFormat({ format: "doubles", division: "men" })).toBe("duo");
  });

  it("stations entre solo et duo : avertissement", () => {
    expect(crossFormatNote("men", "men_pro")).toBeNull();
    expect(crossFormatNote("men", "doubles_men")).toMatch(/^Stations non comparables/);
  });

  it("options du sélecteur de catégorie", () => {
    expect(categoryOptions("women")[0]).toBe("women");
    expect(categoryOptions("women").slice(1, 4)).toEqual(["women_pro", "doubles_women", "doubles_women_pro"]);
  });
});
