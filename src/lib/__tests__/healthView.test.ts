import { describe, expect, it } from "vitest";
import { baselineAt, dailyValues, fmtMinutes, seriesTo, stateOf, streakOf } from "../healthView";
import type { HealthDay } from "@/api/health";
import { addDays } from "@shared/domain/dates";

const day = (d: string, hrv: number | null, source = "garmin") => ({ day: d, source, attribution: source === "garmin" ? "Garmin" : "COROS", hrvMs: hrv } as unknown as HealthDay);
const start = "2026-10-01";
const hist = Array.from({ length: 28 }, (_, i) => day(addDays(start, i), 58 + (i % 5))); // 58..62
const last = addDays(start, 28);

describe("healthView", () => {
  it("une valeur par jour, Garmin d'abord", () => {
    const v = dailyValues([day("2026-11-01", 50, "coros"), day("2026-11-01", 55)], (d) => d.hrvMs);
    expect(v.get("2026-11-01")).toEqual({ v: 55, source: "Garmin" });
  });

  it("zone habituelle et état", () => {
    const v = dailyValues([...hist, day(last, 54)], (d) => d.hrvMs);
    const b = baselineAt(v, last)!;
    expect(b.mean).toBeCloseTo(60, 0);
    expect(stateOf(54, b)).toBe("low");
    expect(stateOf(60, b)).toBe("normal");
    expect(stateOf(70, b)).toBe("high");
    expect(stateOf(null, b)).toBeNull();
    expect(baselineAt(dailyValues(hist.slice(0, 5), (d) => d.hrvMs), addDays(start, 5))).toBeNull();
  });

  it("nuits de suite sous la zone", () => {
    const v = dailyValues([...hist, day(last, 50), day(addDays(last, 1), 50), day(addDays(last, 2), 49)], (d) => d.hrvMs);
    expect(streakOf(v, addDays(last, 2), "low")).toBe(3);
  });

  it("série et format", () => {
    const v = dailyValues([day("2026-11-03", 50)], (d) => d.hrvMs);
    expect(seriesTo(v, "2026-11-03", 3)).toEqual([{ day: "2026-11-01", v: null }, { day: "2026-11-02", v: null }, { day: "2026-11-03", v: 50 }]);
    expect(fmtMinutes(475)).toBe("7 h 55");
    expect(fmtMinutes(22)).toBe("22 min");
    expect(fmtMinutes(null)).toBe("—");
  });
});
