import { describe, expect, it } from "vitest";
import type { WellnessEntry, WellnessHistory } from "@shared/domain/wellness";
import { wellnessTrend } from "../wellnessTrend";

const entry = (day: string, v: number, extra: Partial<WellnessEntry> = {}): WellnessEntry =>
  ({
    day,
    items: { fatigue: v, sommeil: v, stress: v, energie: v, doms: v },
    sleep: {},
    domsZones: [],
    domsPoints: [],
    domsLevels: {},
    envie: v,
    pain: null,
    ...extra,
  }) as unknown as WellnessEntry;

describe("wellnessTrend", () => {
  it("fenêtre de n jours finissant aujourd'hui, jours vides à null", () => {
    const h: WellnessHistory = { "2026-11-13": entry("2026-11-13", 4), "2026-11-11": entry("2026-11-11", 2) };
    const t = wellnessTrend(h, "2026-11-13", 3);
    expect(t.days).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(t.scores).toEqual([40, null, 80]);
    expect(t.avgScore).toBe(60);
    expect(t.itemAvgs.sommeil).toBe(3);
    expect(t.itemAvgs.envie).toBe(3);
  });

  it("aucune saisie : moyennes null, jamais 0", () => {
    const t = wellnessTrend({}, "2026-11-13", 7);
    expect(t.avgScore).toBeNull();
    expect(t.itemAvgs.fatigue).toBeNull();
    expect(t.topZone).toBeNull();
  });

  it("zone la plus notée", () => {
    const h: WellnessHistory = {
      "2026-11-12": entry("2026-11-12", 3, { domsLevels: { ischios: 2, quadri: 1 } }),
      "2026-11-13": entry("2026-11-13", 3, { domsLevels: { ischios: 1 } }),
    };
    expect(wellnessTrend(h, "2026-11-13", 7).topZone).toEqual({ id: "ischios", days: 2 });
  });
});
