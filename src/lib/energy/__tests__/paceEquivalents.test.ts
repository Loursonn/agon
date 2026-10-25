import { describe, it, expect } from "vitest";
import type { EnergyTarget } from "@/types/energy";
import {
  formatMmSs,
  formatPaceEquivalents,
  formatTargetPaceEquivalents,
  paceEquivalents,
  targetPaceEquivalents,
  paceFromLapTime,
  paceFromSpeed,
  paceFromTimeOverDistance,
  paceFromVmaPct,
  speedFromPace,
  timeForDistance,
  vmaPctFromPace,
} from "@/lib/energy/paceEquivalents";

describe("conversions", () => {
  it("allure ↔ vitesse", () => {
    expect(speedFromPace(157)).toBe(22.9);
    expect(paceFromSpeed(23)).toBe(157);
    expect(speedFromPace(0)).toBe(0);
    expect(paceFromSpeed(0)).toBe(0);
  });
  it("temps sur distance → allure", () => {
    expect(paceFromTimeOverDistance(63, 400)).toBe(158);
    expect(paceFromLapTime(63)).toBe(158);
    expect(paceFromTimeOverDistance(63, 0)).toBe(0);
  });
  it("% VMA → allure", () => {
    expect(paceFromVmaPct(100, 20)).toBe(180);
    expect(paceFromVmaPct(105, 20)).toBe(171);
    expect(paceFromVmaPct(105, 0)).toBe(0);
  });
  it("allure → % VMA", () => {
    expect(vmaPctFromPace(180, 20)).toBe(100);
    expect(vmaPctFromPace(171, 20)).toBe(105);
    expect(vmaPctFromPace(180, 0)).toBe(0);
  });
  it("temps pour une distance", () => {
    expect(timeForDistance(180, 400)).toBe(72);
    expect(timeForDistance(180, 1000)).toBe(180);
    expect(timeForDistance(0, 400)).toBe(0);
  });
  it("formatage M'SS", () => {
    expect(formatMmSs(63)).toBe("1'03");
    expect(formatMmSs(157)).toBe("2'37");
    expect(formatMmSs(600)).toBe("10'00");
  });
});

describe("paceEquivalents", () => {
  it("valeur unique : pas de fourchette affichée", () => {
    expect(formatPaceEquivalents({ minSPerKm: 180 })).toBe("20 km/h · 3'00/km · tour de piste 1'12");
  });
  it("fourchette : vitesse en ordre croissant", () => {
    const txt = formatPaceEquivalents({ minSPerKm: 150, maxSPerKm: 180 });
    expect(txt).toBe("20–24 km/h · 2'30–3'00/km · tour de piste 1'00–1'12");
  });
  it("min et max identiques → pas de « x–x »", () => {
    expect(formatPaceEquivalents({ minSPerKm: 180, maxSPerKm: 180 })).not.toContain("–");
  });
  it("distance de répétition affichée", () => {
    expect(formatPaceEquivalents({ minSPerKm: 180, repDistanceM: 200 })).toContain("200 m en 0'36");
  });
  it("répétition de 400 m : pas de doublon avec le tour de piste", () => {
    const parts = paceEquivalents({ minSPerKm: 180, repDistanceM: 400 });
    expect(parts.filter((p) => p.text.includes("1'12"))).toHaveLength(1);
    expect(parts.some((p) => p.unit === "rep_distance")).toBe(false);
  });
  it("% VMA seulement si la VMA est connue", () => {
    expect(formatPaceEquivalents({ minSPerKm: 171 })).not.toContain("VMA");
    expect(formatPaceEquivalents({ minSPerKm: 171, vma: 20 })).toContain("105 % VMA");
  });
  it("% VMA en fourchette croissante", () => {
    expect(formatPaceEquivalents({ minSPerKm: 171, maxSPerKm: 180, vma: 20 })).toContain("100–105 % VMA");
  });
  it("unité du coach en tête", () => {
    const parts = paceEquivalents({ minSPerKm: 180, vma: 20, primary: "vma_pct" });
    expect(parts[0].unit).toBe("vma_pct");
    expect(parts[0].primary).toBe(true);
    expect(parts.slice(1).map((p) => p.unit)).toEqual(["kmh", "min_per_km", "lap_400"]);
  });
  it("bornes inversées tolérées", () => {
    expect(formatPaceEquivalents({ minSPerKm: 180, maxSPerKm: 150 })).toBe(
      formatPaceEquivalents({ minSPerKm: 150, maxSPerKm: 180 }),
    );
  });
  it("allure inexploitable → liste vide", () => {
    expect(paceEquivalents({ minSPerKm: 0 })).toEqual([]);
    expect(paceEquivalents({ minSPerKm: -5 })).toEqual([]);
  });
});

describe("targetPaceEquivalents", () => {
  const pace = (over: Partial<Extract<EnergyTarget, { kind: "pace" }>> = {}): EnergyTarget => ({
    kind: "pace", min_s_per_unit: 171, max_s_per_unit: 180, unit: "min_per_km", ...over,
  });

  it("cible pace : unité du coach en tête", () => {
    expect(targetPaceEquivalents(pace())[0].unit).toBe("min_per_km");
    expect(targetPaceEquivalents(pace({ unit: "kmh" }))[0].unit).toBe("kmh");
  });
  it("format legacy { min, max }", () => {
    const legacy = { kind: "pace", min: 180, max: 180, unit: "min_per_km" } as unknown as EnergyTarget;
    expect(formatTargetPaceEquivalents(legacy)).toContain("3'00/km");
  });
  it("pace_test_pct VMA → allures réelles", () => {
    const t: EnergyTarget = { kind: "pace_test_pct", test_metric: "VMA", min: 100, max: 105 };
    const txt = formatTargetPaceEquivalents(t, { vma: 20 });
    expect(txt).toContain("100–105 % VMA");
    expect(txt).toContain("2'51–3'00/km");
    expect(targetPaceEquivalents(t, { vma: 20 })[0].unit).toBe("vma_pct");
  });
  it("pace_test_pct sans VMA → rien", () => {
    expect(targetPaceEquivalents({ kind: "pace_test_pct", test_metric: "VMA", min: 100, max: 105 })).toEqual([]);
  });
  it("pace_test_pct sur une autre métrique → rien", () => {
    expect(targetPaceEquivalents({ kind: "pace_test_pct", test_metric: "FTP", min: 90, max: 95 }, { vma: 20 })).toEqual([]);
  });
  it("cibles non-allure → rien", () => {
    expect(targetPaceEquivalents({ kind: "hr_bpm", min: 140, max: 160 }, { vma: 20 })).toEqual([]);
    expect(targetPaceEquivalents({ kind: "none" })).toEqual([]);
    expect(targetPaceEquivalents(null)).toEqual([]);
  });
});
