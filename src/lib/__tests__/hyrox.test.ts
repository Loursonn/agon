import { describe, it, expect } from "vitest";
import { parseMmSs, formatMmSs, formatDelta } from "@/lib/time";
import {
  runTotal, stationsTotal, roxzoneTotal, shares, runStats,
  percentile, alerts, stationPriorities, typology, bracketOf,
  generatePlan, planVsActual, estimateFromTests,
  type RefLookup,
} from "@/lib/hyrox/calc";
import type { HyroxResult, HyroxReferenceSegment } from "@/features/shared/types/hyrox";

// ── Helper: sample race (recette spec: HYROX Bordeaux, division men) ────────

function sampleRace(overrides: Partial<HyroxResult> = {}): HyroxResult {
  return {
    id: "test-1", athlete_id: "a1", competition_id: null, created_by: null,
    date: "2026-10-12", event_name: "HYROX Bordeaux", venue: "Bordeaux",
    format: "solo", division: "men", age_group: "30-34",
    is_official: true, status: "finished",
    total_s: 5052,
    run_1_s: 271, run_2_s: 302, run_3_s: 328, run_4_s: 325,
    run_5_s: 341, run_6_s: 330, run_7_s: 334, run_8_s: 419,
    ski_s: 278, sled_push_s: 178, sled_pull_s: 195, bbj_s: 326,
    row_s: 292, farmers_s: 131, lunges_s: 300, wall_balls_s: 300,
    roxzone_total_s: 402, roxzone_splits: null,
    penalties_s: 0, penalties_note: null,
    rank_overall: 842, rank_age_group: 71,
    participants_overall: 1450, participants_age_group: 120,
    activity_url: null, athlete_comment: null, coach_comment: null,
    source: "manual", created_at: "", updated_at: "",
    ...overrides,
  };
}

// ── Reference data for tests ────────────────────────────────────────────────

const REFS: HyroxReferenceSegment[] = [
  { id: "r1", division: "men", bracket: "all", segment: "total", p1_s: 3720, p5_s: 3950, p10_s: 4238, p25_s: 4670, p50_s: 5275, p75_s: 6076, p90_s: 7043, source: "test", is_estimate: false, sample_size: 305593 },
  { id: "r2", division: "men", bracket: "all", segment: "run_total", p1_s: 1750, p5_s: 1880, p10_s: 2016, p25_s: 2225, p50_s: 2507, p75_s: 2873, p90_s: 3340, source: "test", is_estimate: false, sample_size: 294469 },
  { id: "r3", division: "men", bracket: "all", segment: "ski", p1_s: 210, p5_s: 230, p10_s: 250, p25_s: 260, p50_s: 273, p75_s: 290, p90_s: 308, source: "test", is_estimate: false, sample_size: 305540 },
  { id: "r4", division: "men", bracket: "all", segment: "sled_push", p1_s: 85, p5_s: 105, p10_s: 135, p25_s: 155, p50_s: 183, p75_s: 220, p90_s: 269, source: "test", is_estimate: false, sample_size: 305289 },
  { id: "r5", division: "men", bracket: "all", segment: "sled_pull", p1_s: 150, p5_s: 180, p10_s: 220, p25_s: 252, p50_s: 298, p75_s: 360, p90_s: 436, source: "test", is_estimate: false, sample_size: 305136 },
  { id: "r6", division: "men", bracket: "all", segment: "bbj", p1_s: 160, p5_s: 195, p10_s: 232, p25_s: 276, p50_s: 337, p75_s: 419, p90_s: 516, source: "test", is_estimate: false, sample_size: 305414 },
  { id: "r7", division: "men", bracket: "all", segment: "row", p1_s: 220, p5_s: 240, p10_s: 266, p25_s: 277, p50_s: 293, p75_s: 314, p90_s: 339, source: "test", is_estimate: false, sample_size: 305141 },
  { id: "r8", division: "men", bracket: "all", segment: "farmers", p1_s: 65, p5_s: 80, p10_s: 99, p25_s: 112, p50_s: 131, p75_s: 158, p90_s: 191, source: "test", is_estimate: false, sample_size: 305459 },
  { id: "r9", division: "men", bracket: "all", segment: "lunges", p1_s: 155, p5_s: 190, p10_s: 232, p25_s: 268, p50_s: 319, p75_s: 389, p90_s: 481, source: "test", is_estimate: false, sample_size: 305298 },
  { id: "r10", division: "men", bracket: "all", segment: "wall_balls", p1_s: 190, p5_s: 235, p10_s: 290, p25_s: 342, p50_s: 422, p75_s: 541, p90_s: 701, source: "test", is_estimate: false, sample_size: 305471 },
  { id: "r11", division: "men", bracket: "all", segment: "roxzone_total", p1_s: 180, p5_s: 230, p10_s: 296, p25_s: 356, p50_s: 446, p75_s: 576, p90_s: 735, source: "test", is_estimate: false, sample_size: 288726 },
];

const pickRef: RefLookup = (div, seg, bracket) => {
  return REFS.find(r => r.division === div && r.segment === seg && (r.bracket === bracket || r.bracket === "all")) ?? undefined;
};

// ══════════════════════════════════════════════════════════════════════════════
// parseMmSs / formatMmSs
// ══════════════════════════════════════════════════════════════════════════════

describe("parseMmSs", () => {
  it("parses h:mm:ss", () => expect(parseMmSs("1:27:49")).toBe(5269));
  it("parses mm:ss", () => expect(parseMmSs("4:36")).toBe(276));
  it("parses seconds only", () => expect(parseMmSs("95")).toBe(95));
  it("returns null on invalid", () => {
    expect(parseMmSs("")).toBeNull();
    expect(parseMmSs("abc")).toBeNull();
    expect(parseMmSs("1:60:00")).toBeNull();
  });
});

describe("formatMmSs", () => {
  it("formats h:mm:ss for large values", () => expect(formatMmSs(5269)).toBe("1:27:49"));
  it("formats m:ss for small values", () => expect(formatMmSs(276)).toBe("4:36"));
  it("returns — for null", () => expect(formatMmSs(null)).toBe("—"));
  it("forces hours format", () => expect(formatMmSs(276, { hours: true })).toBe("0:04:36"));
});

describe("formatDelta", () => {
  it("positive delta", () => expect(formatDelta(101)).toBe("+1:41"));
  it("negative delta", () => expect(formatDelta(-12)).toBe("−0:12"));
  it("zero delta", () => expect(formatDelta(0)).toBe("+0:00"));
});

// ══════════════════════════════════════════════════════════════════════════════
// Core calc functions
// ══════════════════════════════════════════════════════════════════════════════

describe("runTotal / stationsTotal / roxzoneTotal", () => {
  const r = sampleRace();

  it("runTotal = 2650", () => expect(runTotal(r)).toBe(2650));
  it("stationsTotal = 2000", () => expect(stationsTotal(r)).toBe(2000));
  it("roxzoneTotal (explicit) = 402", () => expect(roxzoneTotal(r)).toBe(402));

  it("roxzoneTotal deduced when null", () => {
    const r2 = sampleRace({ roxzone_total_s: null });
    // 5052 - 2650 - 2000 = 402
    expect(roxzoneTotal(r2)).toBe(402);
  });

  it("returns null with a missing segment", () => {
    const r2 = sampleRace({ run_3_s: null });
    expect(runTotal(r2)).toBeNull();
  });
});

describe("shares", () => {
  it("percentages sum to ~100%", () => {
    const s = shares(sampleRace());
    expect(s.run).toBe(52.5); // 2650/5052 * 100 = 52.45... → 52.5
    expect(s.stations).toBe(39.6); // 2000/5052 * 100 = 39.588... → 39.6
    expect(s.roxzone).toBe(8.0); // 402/5052 * 100 = 7.95... → 8.0
    const sum = (s.run ?? 0) + (s.stations ?? 0) + (s.roxzone ?? 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// runStats — uses men `all` reference runs
// ══════════════════════════════════════════════════════════════════════════════

describe("runStats", () => {
  const stats = runStats(sampleRace());

  it("best = run 1 (index 0)", () => {
    expect(stats.best?.index).toBe(0);
    expect(stats.best?.s).toBe(271);
  });
  it("worst = run 8 (index 7)", () => {
    expect(stats.worst?.index).toBe(7);
    expect(stats.worst?.s).toBe(419);
  });
  it("fade18 = 148", () => expect(stats.fade18).toBe(148));
  it("drop12 = 31", () => expect(stats.drop12).toBe(31));
  it("halvesDelta ≈ 50", () => {
    // avg(341,330,334,419) = 356 ; avg(271,302,328,325) = 306.5 → delta 49.5 → rounded 50
    expect(stats.halvesDelta).toBe(50);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// percentile
// ══════════════════════════════════════════════════════════════════════════════

describe("percentile", () => {
  const ref = { p10_s: 4211, p50_s: 5269, p90_s: 7057 };

  it("p10 → 10", () => expect(percentile(4211, ref)).toBe(10));
  it("p50 → 50", () => expect(percentile(5269, ref)).toBe(50));
  it("p90 → 90", () => expect(percentile(7057, ref)).toBe(90));

  it("mid p10-p50 → ~30", () => {
    const mid = (4211 + 5269) / 2;
    expect(percentile(mid, ref)).toBe(30);
  });

  it("below p10 → bounded to 1", () => {
    expect(percentile(3000, ref)).toBe(1);
  });

  it("returns null when p10 or p90 is null", () => {
    expect(percentile(5000, { p10_s: null, p50_s: 5269, p90_s: 7057 })).toBeNull();
    expect(percentile(5000, { p10_s: 4211, p50_s: 5269, p90_s: null })).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// alerts
// ══════════════════════════════════════════════════════════════════════════════

describe("alerts", () => {
  it("triggers pacing and late_fade on sample race", () => {
    const al = alerts(sampleRace());
    const codes = al.map(a => a.code);
    expect(codes).toContain("pacing");     // fade18 = 148 > 90
    expect(codes).toContain("late_fade");  // halvesDelta = 50 > 20
    expect(codes).not.toContain("early_drop"); // drop12 = 31 < 60
    expect(codes).toContain("roxzone");    // 8.0% > 7%
  });

  it("triggers too_safe when run 8 is best", () => {
    const r = sampleRace({ run_8_s: 200 }); // artificially make run8 best
    const al = alerts(r);
    expect(al.some(a => a.code === "too_safe")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// stationPriorities
// ══════════════════════════════════════════════════════════════════════════════

describe("stationPriorities", () => {
  it("returns sorted by score descending", () => {
    const prios = stationPriorities(sampleRace(), pickRef);
    expect(prios.length).toBeGreaterThan(0);
    for (let i = 1; i < prios.length; i++) {
      expect(prios[i].score).toBeLessThanOrEqual(prios[i - 1].score);
    }
  });

  it("roxzone included", () => {
    const prios = stationPriorities(sampleRace(), pickRef);
    expect(prios.some(p => p.key === "roxzone")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// typology
// ══════════════════════════════════════════════════════════════════════════════

describe("typology", () => {
  it("runner when stations much worse", () => expect(typology(20, 50)).toBe("runner"));
  it("powerhouse when runs much worse", () => expect(typology(50, 20)).toBe("powerhouse"));
  it("hybrid when close", () => expect(typology(40, 45)).toBe("hybrid"));
  it("null when missing data", () => expect(typology(null, 40)).toBeNull());
});

// ══════════════════════════════════════════════════════════════════════════════
// bracketOf
// ══════════════════════════════════════════════════════════════════════════════

describe("bracketOf", () => {
  it("sub70", () => expect(bracketOf(4000)).toBe("sub70"));
  it("70_80", () => expect(bracketOf(4500)).toBe("70_80"));
  it("80_90", () => expect(bracketOf(5000)).toBe("80_90"));
  it("90_plus", () => expect(bracketOf(6000)).toBe("90_plus"));
  it("boundary 4200", () => expect(bracketOf(4200)).toBe("70_80"));
  it("boundary 4800", () => expect(bracketOf(4800)).toBe("80_90"));
});

// ══════════════════════════════════════════════════════════════════════════════
// generatePlan
// ══════════════════════════════════════════════════════════════════════════════

describe("generatePlan", () => {
  it("sum = target_total_s exactly", () => {
    const plan = generatePlan({
      target_total_s: 5100,
      division: "men",
      profile: "hybrid",
      pickRef,
    });
    const runSum = plan.run_1 + plan.run_2 + plan.run_3 + plan.run_4 +
                   plan.run_5 + plan.run_6 + plan.run_7 + plan.run_8;
    const stationSum = plan.ski + plan.sled_push + plan.sled_pull + plan.bbj +
                       plan.row + plan.farmers + plan.lunges + plan.wall_balls;
    const roxTotal = 8 * plan.roxzone_per_transition;
    expect(runSum + stationSum + roxTotal).toBe(5100);
  });

  it("roxzone = 8 × per_transition", () => {
    const plan = generatePlan({
      target_total_s: 5100,
      division: "men",
      profile: "hybrid",
      pickRef,
    });
    // 5100 → bracket 80_90 → 40s per transition
    expect(plan.roxzone_per_transition).toBe(40);
  });

  it("runs 2-8 generally increasing", () => {
    const plan = generatePlan({
      target_total_s: 5100,
      division: "men",
      profile: "hybrid",
      pickRef,
    });
    // run_1 should be fastest (a-20)
    expect(plan.run_1).toBeLessThan(plan.run_5);
    expect(plan.run_8).toBeGreaterThanOrEqual(plan.run_2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// planVsActual
// ══════════════════════════════════════════════════════════════════════════════

describe("planVsActual", () => {
  it("returns 17 entries (16 segments + roxzone)", () => {
    const plan = generatePlan({
      target_total_s: 5100,
      division: "men",
      profile: "hybrid",
      pickRef,
    });
    const pva = planVsActual(plan, sampleRace());
    expect(pva.length).toBe(17);
    expect(pva[pva.length - 1].key).toBe("roxzone_total");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// estimateFromTests
// ══════════════════════════════════════════════════════════════════════════════

describe("estimateFromTests", () => {
  it("returns null without fiveK or lastRace", () => {
    const est = estimateFromTests({ division: "men", pickRef });
    expect(est).toBeNull();
  });

  it("returns low < high with fiveK", () => {
    const est = estimateFromTests({ fiveK: 1500, division: "men", pickRef });
    expect(est).not.toBeNull();
    expect(est!.low_s).toBeLessThan(est!.high_s);
    expect(est!.from).toHaveProperty("5km");
  });
});

describe("affichage des runs (/run)", () => {
  it("formatPerRun / formatAvgPerRun", async () => {
    const { formatPerRun, formatAvgPerRun, RUN_AXIS_UNIT } = await import("@/lib/hyrox/calc");
    expect(formatPerRun(272)).toBe("4:32 /run");
    expect(formatPerRun(null)).toBe("—");
    expect(formatAvgPerRun(272.4)).toBe("moy. 4:32 /run");
    expect(RUN_AXIS_UNIT).toBe("min/run");
    expect(formatPerRun(272)).not.toContain("km");
  });
});
