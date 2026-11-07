import { describe, it, expect } from "vitest";
import { toIsoDay, isIsoDay, toCompactDay, localIsoDay, addDays, byIsoDay } from "../dates";

describe("dates", () => {
  it("lit les deux formats de jour", () => {
    expect(toIsoDay("20261107")).toBe("2026-11-07");
    expect(toIsoDay("2026-11-07")).toBe("2026-11-07");
  });
  it("écarte ce qui n'est pas un jour", () => {
    for (const k of ["1", "4", "", "2026-13-01", "20260230", "hier", null, 20261107]) expect(toIsoDay(k)).toBeNull();
  });
  it("isIsoDay / toCompactDay", () => {
    expect(isIsoDay("2026-11-07")).toBe(true);
    expect(isIsoDay("20261107")).toBe(false);
    expect(toCompactDay("2026-11-07")).toBe("20261107");
  });
  it("jour local, pas UTC", () => {
    expect(localIsoDay(new Date(2026, 10, 8, 0, 30))).toBe("2026-11-08");
  });
  it("addDays traverse mois et changement d'heure", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28");
  });
  it("byIsoDay : clés compactes et ISO, clés de semaine ignorées, ISO prioritaire", () => {
    expect(byIsoDay({ "20261107": 1, "1": 9, "2026-11-08": 2 })).toEqual({ "2026-11-07": 1, "2026-11-08": 2 });
    expect(byIsoDay({ "20261107": "compact", "2026-11-07": "iso" })["2026-11-07"]).toBe("iso");
  });
});
