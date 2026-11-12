import { describe, expect, it } from "vitest";
import { formatNumberFr, isFreshResult, joinSeconds, parseNumberFr, recordOutcome, splitSeconds } from "../testEntry";
import type { TestPoint } from "../athleteTestValues";

const pt = (date: string, value: number): TestPoint => ({ resultId: date, date, value, testName: "VMA", notes: null });

describe("nombres", () => {
  it("virgule française", () => {
    expect(parseNumberFr("64,6")).toBe(64.6);
    expect(parseNumberFr(" 16 ")).toBe(16);
    expect(parseNumberFr("")).toBeNull();
    expect(parseNumberFr("abc")).toBeNull();
    expect(formatNumberFr(16)).toBe("16");
    expect(formatNumberFr(15.5)).toBe("15,5");
    expect(formatNumberFr(null)).toBe("");
  });
});

describe("allures et durées", () => {
  it("découpe et recompose", () => {
    expect(splitSeconds(245)).toEqual({ h: "", m: "4", s: "05" });
    expect(splitSeconds(3725)).toEqual({ h: "1", m: "2", s: "05" });
    expect(joinSeconds({ m: "4", s: "05" })).toBe(245);
    expect(joinSeconds({ h: "1", m: "2", s: "5" })).toBe(3725);
    expect(joinSeconds({ m: "", s: "" })).toBeNull();
    expect(joinSeconds({ m: "3", s: "75" })).toBeNull();
    expect(joinSeconds({ m: "52", s: "" })).toBe(3120);
  });
});

describe("recordOutcome", () => {
  const hist = [pt("2026-09-01", 15), pt("2026-10-21", 15.5), pt("2026-11-08", 14)];
  it("bat le record (plus haut = mieux), sans compter le résultat du même jour", () => {
    const r = recordOutcome(16, hist, "higher", "2026-11-08");
    expect(r.isRecord).toBe(true);
    expect(r.previousBest?.date).toBe("2026-10-21");
    expect(r.delta).toBeCloseTo(0.5);
  });
  it("sous le record", () => {
    expect(recordOutcome(15.2, hist, "higher", "2026-11-09")).toMatchObject({ isRecord: false });
  });
  it("plus bas = mieux", () => {
    expect(recordOutcome(230, [pt("2026-10-01", 240)], "lower", "2026-11-08").isRecord).toBe(true);
  });
  it("premier test = record", () => {
    expect(recordOutcome(10, [], "higher", "2026-11-08")).toEqual({ isRecord: true, previousBest: null, delta: null });
  });
});

describe("isFreshResult", () => {
  it("24 h", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(isFreshResult("2026-11-08T08:00:00Z", now)).toBe(true);
    expect(isFreshResult("2026-11-07T11:00:00Z", now)).toBe(false);
    expect(isFreshResult(null, now)).toBe(false);
  });
});
