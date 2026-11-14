import { describe, expect, it } from "vitest";
import type { HealthDay } from "@/api/health";
import { watchSleepOf } from "@/lib/watchSleep";

const day = (o: Partial<HealthDay>): HealthDay => ({
  day: "2026-11-13", source: "garmin", attribution: "Garmin Forerunner 265",
  sleepStartAt: null, sleepEndAt: null, sleepSubscores: null, sleepTotalMin: null, ...o,
} as HealthDay);

describe("watchSleepOf", () => {
  it("aucune nuit mesurée → null (saisie manuelle)", () => {
    expect(watchSleepOf([], "2026-11-13")).toBeNull();
    expect(watchSleepOf([day({ sleepTotalMin: null })], "2026-11-13")).toBeNull();
    expect(watchSleepOf([day({ sleepTotalMin: 420, day: "2026-11-12" })], "2026-11-13")).toBeNull();
    expect(watchSleepOf(undefined, "2026-11-13")).toBeNull();
  });

  it("heures au dixième, coucher et réveil locaux, attribution", () => {
    const s = watchSleepOf([day({
      sleepTotalMin: 452,
      sleepStartAt: new Date(2026, 10, 12, 23, 10).toISOString(),
      sleepEndAt: new Date(2026, 10, 13, 6, 50).toISOString(),
    })], "2026-11-13")!;
    expect(s).toEqual({ hours: 7.5, start: { h: 23, m: 10 }, end: { h: 6, m: 50 }, attribution: "Garmin Forerunner 265" });
  });

  it("deux sources le même jour : la plus longue nuit", () => {
    const s = watchSleepOf([
      day({ sleepTotalMin: 120, source: "coros", attribution: "COROS" }),
      day({ sleepTotalMin: 400 }),
    ], "2026-11-13")!;
    expect(s.attribution).toBe("Garmin Forerunner 265");
    expect(s.hours).toBe(6.7);
  });
});
