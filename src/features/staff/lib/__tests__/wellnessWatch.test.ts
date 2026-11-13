import { describe, it, expect } from "vitest";
import type { WellnessEntry, WellnessHistory } from "@shared/domain/wellness";
import type { IsoDay } from "@shared/domain/dates";
import { wellnessDrop } from "../wellnessWatch";

const entry = (day: string, sommeil: number | null): WellnessEntry =>
  ({ day, items: { fatigue: 4, sommeil, stress: 4, energie: 4, doms: 4 }, sleep: {}, domsZones: [], domsPoints: [], domsLevels: {} }) as unknown as WellnessEntry;
const hist = (...e: WellnessEntry[]) => Object.fromEntries(e.map((x) => [x.day, x])) as WellnessHistory;

describe("wellnessDrop", () => {
  it("repère un sommeil à 2/5 deux matins de suite", () => {
    const h = hist(entry("2026-11-11", 2), entry("2026-11-12", 2));
    expect(wellnessDrop(h, "2026-11-13" as IsoDay)).toMatchObject({ label: "Sommeil", value: 2, day: "2026-11-12" });
  });
  it("ignore un seul matin, des jours non consécutifs ou un relevé ancien", () => {
    expect(wellnessDrop(hist(entry("2026-11-11", 4), entry("2026-11-12", 2)), "2026-11-13" as IsoDay)).toBeNull();
    expect(wellnessDrop(hist(entry("2026-11-09", 2), entry("2026-11-12", 2)), "2026-11-13" as IsoDay)).toBeNull();
    expect(wellnessDrop(hist(entry("2026-10-01", 2), entry("2026-10-02", 2)), "2026-11-13" as IsoDay)).toBeNull();
  });
  it("ne prend pas une note absente pour une note basse", () => {
    expect(wellnessDrop(hist(entry("2026-11-11", null), entry("2026-11-12", null)), "2026-11-13" as IsoDay)).toBeNull();
  });
});
