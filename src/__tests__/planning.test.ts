/**
 * Tests Vitest — §8
 * Couverture :
 * - Détection chevauchement même-type
 * - effectiveParents (logique pure)
 * - Snap au lundi
 * - Cascade auto-shift
 */

import { describe, it, expect } from "vitest";
import {
  snapMonday, snapSunday, chainNextStart, endFromWeeks, computeCascade,
} from "@/features/coach/components/planning/utils/planningHelpers";
import {
  effectiveParentsMeso, effectiveParentsCycle,
} from "@/features/coach/components/planning/hooks/effectiveParents";
import type { TimelineData } from "@/features/coach/components/planning/hooks/useTimelineData";
import { PERIOD_DEFAULTS } from "@/types/planning";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if two date ranges overlap */
function overlaps(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// ── §2.a — Overlap detection ──────────────────────────────────────────────────

describe("overlap detection (same-type)", () => {
  const periods = [
    { id: "1", start_date: "2026-01-05", end_date: "2026-03-29" }, // Q1
    { id: "2", start_date: "2026-04-06", end_date: "2026-06-28" }, // Q2
    { id: "3", start_date: "2026-07-06", end_date: "2026-09-27" }, // Q3
  ];

  it("non-overlapping periods → no conflict", () => {
    const candidate = { start_date: "2026-10-05", end_date: "2026-12-27" };
    const conflicts = periods.filter(
      (p) => overlaps(p.start_date, p.end_date, candidate.start_date, candidate.end_date),
    );
    expect(conflicts).toHaveLength(0);
  });

  it("overlapping period → conflict detected", () => {
    const candidate = { start_date: "2026-03-01", end_date: "2026-04-30" }; // overlaps Q1 + Q2
    const conflicts = periods.filter(
      (p) => overlaps(p.start_date, p.end_date, candidate.start_date, candidate.end_date),
    );
    expect(conflicts).toHaveLength(2);
  });

  it("adjacent periods (touching edge) → no overlap", () => {
    // Q1 ends 2026-03-29, Q2 starts 2026-04-06 → gap, no overlap
    const [q1, q2] = periods;
    expect(overlaps(q1.start_date, q1.end_date, q2.start_date, q2.end_date)).toBe(false);
  });

  it("exact same range → overlap", () => {
    expect(overlaps("2026-01-05", "2026-03-29", "2026-01-05", "2026-03-29")).toBe(true);
  });
});

// ── §3 — effectiveParents ──────────────────────────────────────────────────

const mockData: TimelineData = {
  macrocycles: [
    { id: "macro1", athlete_id: "a1", coach_id: "c1", name: "Macro 2026", start_date: "2026-01-05", end_date: "2026-12-27" },
    { id: "macro2", athlete_id: "a1", coach_id: "c1", name: "Macro 2027", start_date: "2027-01-04", end_date: "2027-06-27" },
  ],
  mesocycles: [
    { id: "meso1", macrocycle_id: "macro1", name: "Force", start_date: "2026-01-05", end_date: "2026-03-29" },
    { id: "meso2", macrocycle_id: "macro1", name: "Hyper", start_date: "2026-04-06", end_date: "2026-06-28" },
    // Overflow: crosses macro1 end into macro2 territory
    { id: "meso3", macrocycle_id: "macro1", name: "Peak",  start_date: "2026-11-02", end_date: "2027-01-25" },
  ],
  cycles: [
    { id: "cycle1", mesocycle_id: "meso1", name: "Cycle A", start_date: "2026-01-05", end_date: "2026-01-25" },
  ],
  microcycles: [],
  competitions: [],
  tests: [],
};

describe("effectiveParentsMeso", () => {
  it("returns primary macrocycle for a standard meso", () => {
    const result = effectiveParentsMeso("meso1", mockData);
    expect(result.primary?.id).toBe("macro1");
    expect(result.secondary).toHaveLength(0);
  });

  it("detects secondary parent when meso overflows into adjacent macro", () => {
    const result = effectiveParentsMeso("meso3", mockData);
    expect(result.primary?.id).toBe("macro1");
    // meso3 ends 2027-01-25 which overlaps macro2 (2027-01-04 → 2027-06-27)
    expect(result.secondary.some((m) => m.id === "macro2")).toBe(true);
  });

  it("returns null primary for unknown id", () => {
    const result = effectiveParentsMeso("unknown", mockData);
    expect(result.primary).toBeNull();
    expect(result.secondary).toHaveLength(0);
  });
});

describe("effectiveParentsCycle", () => {
  it("returns primary meso for a standard cycle", () => {
    const result = effectiveParentsCycle("cycle1", mockData);
    expect(result.primary?.id).toBe("meso1");
  });
});

// ── Snap au lundi ─────────────────────────────────────────────────────────────

describe("snapMonday", () => {
  it("Monday stays on Monday", () => {
    expect(snapMonday("2026-01-05")).toBe("2026-01-05"); // Monday
  });

  it("Wednesday snaps to previous Monday", () => {
    expect(snapMonday("2026-01-07")).toBe("2026-01-05"); // Mon Jan 5
  });

  it("Sunday snaps to previous Monday", () => {
    expect(snapMonday("2026-01-11")).toBe("2026-01-05"); // Mon Jan 5
  });
});

describe("snapSunday", () => {
  it("Sunday stays on Sunday", () => {
    expect(snapSunday("2026-01-11")).toBe("2026-01-11"); // Sunday
  });

  it("Monday snaps to next Sunday", () => {
    expect(snapSunday("2026-01-05")).toBe("2026-01-11"); // Sun Jan 11
  });
});

describe("chainNextStart", () => {
  it("returns Monday after Sunday end", () => {
    // Jan 11 = Sunday → addDays = Jan 12 (Mon) → startOfISOWeek = Jan 12
    expect(chainNextStart("2026-01-11")).toBe("2026-01-12");
  });

  it("prevEnd always expected to be a Sunday (snapSunday guarantees this)", () => {
    // All period ends are snapped to Sunday — test valid input only
    expect(chainNextStart("2026-02-01")).toBe("2026-02-02"); // Sun Feb 1 → Mon Feb 2
  });
});

describe("endFromWeeks", () => {
  it("1 week from Monday = Sunday of same week", () => {
    const s = "2026-01-05"; // Monday
    expect(endFromWeeks(s, 1)).toBe("2026-01-11"); // Sun Jan 11
  });

  it("4 weeks from Monday = Sunday 4 weeks later", () => {
    const s = "2026-01-05"; // Monday
    expect(endFromWeeks(s, 4)).toBe("2026-02-01"); // Sun Feb 1
  });
});

// ── §2.a — Cascade auto-shift ─────────────────────────────────────────────────

describe("computeCascade", () => {
  // All dates are Monday starts / Sunday ends (as enforced by snap functions)
  const later = [
    { id: "b", start_date: "2026-04-06", end_date: "2026-06-28" }, // Mon Apr 6 → Sun Jun 28
    { id: "c", start_date: "2026-07-06", end_date: "2026-09-27" }, // Mon Jul 6 → Sun Sep 27
  ];

  it("cascade: b starts right after newEnd", () => {
    const newEnd = "2026-04-12"; // extended Sunday
    const result = computeCascade(newEnd, later);
    const expectedBStart = chainNextStart(newEnd); // Mon Apr 13
    expect(result[0].start_date).toBe(expectedBStart);
    // c starts right after b
    expect(result[1].start_date).toBe(chainNextStart(result[0].end_date));
  });

  it("preserves original week counts in cascade", () => {
    const newEnd = "2026-03-29"; // Sun
    const result = computeCascade(newEnd, later);
    const bStart = chainNextStart(newEnd);
    expect(result[0].start_date).toBe(bStart);
    // b had same week count as original (floor, as in computeCascade implementation)
    const origWeeks = Math.max(1, Math.floor(
      (new Date(later[0].end_date).getTime() - new Date(later[0].start_date).getTime())
      / (7 * 86400_000)
    ) + 1);
    const expectedEnd = endFromWeeks(bStart, origWeeks);
    expect(result[0].end_date).toBe(expectedEnd);
  });
});

// ── PERIOD_DEFAULTS ───────────────────────────────────────────────────────────

describe("PERIOD_DEFAULTS", () => {
  it("macrocycle = 52 weeks", () => { expect(PERIOD_DEFAULTS.macrocycle).toBe(52); });
  it("mesocycle = 13 weeks",  () => { expect(PERIOD_DEFAULTS.mesocycle).toBe(13); });
  it("cycle = 4 weeks",       () => { expect(PERIOD_DEFAULTS.cycle).toBe(4); });
  it("microcycle = 1 week",   () => { expect(PERIOD_DEFAULTS.microcycle).toBe(1); });
});
