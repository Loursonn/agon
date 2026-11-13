import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { wellnessLight, type LoadSignals, type WatchDay, type WellnessSignals } from "../wellnessLight";

const TODAY = "2026-11-13";

/** `n` nuits finissant `endOffset` jours avant aujourd'hui (0 = aujourd'hui). */
function nights(n: number, endOffset: number, f: (i: number) => Partial<WatchDay>, brand = "garmin"): WatchDay[] {
  return Array.from({ length: n }, (_, i) => ({
    day: addDays(TODAY, -(endOffset + n - 1 - i)),
    brand, hrvMs: null, restingHr: null, sleepMin: null, ...f(i),
  }));
}

/** Contre-exemple 1 d'Hugo (07/11) : zone VFC 4,19-4,31, 7 j à 4,12 ; FC de repos 51,0 ± 1,4, 7 j à 54. */
const habit = nights(28, 7, (i) => ({ hrvMs: Math.exp(i % 2 ? 4.37 : 4.13), restingHr: i % 2 ? 52.4 : 49.6 }));
const lowWeek = nights(7, 0, () => ({ hrvMs: Math.exp(4.12), restingHr: 54 }));
const fineWeek = nights(7, 0, (i) => ({ hrvMs: Math.exp(i % 2 ? 4.3 : 4.2), restingHr: 51 }));

const W = (over: Partial<WellnessSignals> = {}): WellnessSignals => ({
  day: TODAY, itemsLow: 0, scoreZ: 0, sleepItemLow: false, envie: 4, pain: 0, sick: false, ...over,
});
const L = (over: Partial<LoadSignals> = {}): LoadSignals => ({
  done: 500, planned: 520, previous: 520, kmVariationPct: 0, monotony: 1.5, unplannedOverCeiling: false, ...over,
});

describe("feu du matin", () => {
  it("contre-exemple 1 : charge en hausse, VFC sous la zone, FC de repos z +2, envie 2 → rouge", () => {
    const r = wellnessLight({
      today: TODAY, watch: [...habit, ...lowWeek], wellness: W({ envie: 2 }), load: L({ done: 580, planned: 560, previous: 544 }),
    })!;
    expect(r.hrv.zoneLow).toBeCloseTo(4.19, 2);
    expect(r.hrv.zoneHigh).toBeCloseTo(4.31, 2);
    expect(r.hrv.mean7).toBeCloseTo(4.12, 6);
    expect(r.restingHr.z).toBeCloseTo(2.1, 1);
    expect(r.light).toBe("red");
    expect(r.redSigns.map((s) => s.key)).toEqual(["resting_hr_high", "envie_low"]);
    expect(r.sentence).toContain("VFC sous ta zone");
    // La moyenne 7 j passe sous la zone à la 5e nuit basse : 3 jours de suite (avec 4 nuits basses sur 7, elle reste dans la zone).
    expect(r.hrv.belowDays).toBe(3);
  });

  it("même tableau sans hausse de charge : orange, pas rouge", () => {
    const r = wellnessLight({ today: TODAY, watch: [...habit, ...lowWeek], wellness: W({ envie: 2 }), load: L({ done: 500, planned: 560, previous: 544 }) })!;
    expect(r.light).toBe("orange");
    expect(r.orange.map((s) => s.key)).toEqual(["hrv_low", "resting_hr_high"]);
    expect(r.sentence).toBe("VFC sous ta zone habituelle depuis 3 jours");
  });

  it("tout dans l'habitude : vert", () => {
    const r = wellnessLight({ today: TODAY, watch: [...habit, ...fineWeek], wellness: W(), load: L() })!;
    expect(r.light).toBe("green");
    expect(r.sentence).toBe("Rien à signaler");
    expect(r.brand).toBe("garmin");
  });

  it("sans montre : rouge seulement si malade", () => {
    const base = { today: TODAY, watch: [], load: L({ done: 700, planned: 500, previous: 400 }) };
    const bad = wellnessLight({ ...base, wellness: W({ envie: 1, scoreZ: -2, itemsLow: 3 }) })!;
    expect(bad.light).toBe("orange");
    expect(bad.brand).toBeNull();
    expect(bad.hrv.mean7).toBeNull();
    expect(wellnessLight({ ...base, wellness: W({ sick: true }) })!.light).toBe("red");
  });

  it("moins de 5 nuits sur 7 : pas de moyenne VFC, pas d'alerte", () => {
    const sparse = lowWeek.filter((_, i) => i % 2 === 0); // 4 nuits
    const r = wellnessLight({ today: TODAY, watch: [...habit, ...sparse], wellness: W(), load: null })!;
    expect(r.hrv.mean7).toBeNull();
    expect(r.orange.some((s) => s.key === "hrv_low")).toBe(false);
  });

  it("avant J14 : zone calculée depuis J1, alerte VFC pas encore active", () => {
    const young = [...nights(6, 7, () => ({ hrvMs: Math.exp(4.3) })), ...nights(7, 0, () => ({ hrvMs: Math.exp(4.0) }))];
    const r = wellnessLight({ today: TODAY, watch: young, wellness: W(), load: null })!;
    expect(r.hrv.dayIndex).toBe(13);
    expect(r.hrv.zoneLow).not.toBeNull();
    expect(r.hrv.active).toBe(false);
    expect(r.light).toBe("green");
    const r14 = wellnessLight({ today: TODAY, watch: [...nights(1, 13, () => ({ hrvMs: Math.exp(4.3) })), ...young], wellness: W(), load: null })!;
    expect(r14.hrv.dayIndex).toBe(14);
    expect(r14.hrv.active).toBe(true);
  });

  it("changement de montre : seule la nouvelle marque compte, l'habitude repart de J1", () => {
    const old = nights(40, 8, (i) => ({ hrvMs: Math.exp(i % 2 ? 4.37 : 4.13), restingHr: 50 }), "garmin");
    const fresh = nights(8, 0, () => ({ hrvMs: Math.exp(3.9), restingHr: 58 }), "coros");
    const r = wellnessLight({ today: TODAY, watch: [...old, ...fresh], wellness: W(), load: null })!;
    expect(r.brand).toBe("coros");
    expect(r.hrv.dayIndex).toBe(8);
    expect(r.hrv.active).toBe(false);
    expect(r.restingHr.z).toBeNull();
    expect(r.light).toBe("green");
  });

  it("orange : charge > prévu + 10 %, km +7 %, monotonie > 2, douleur > 3, 2 ressentis bas", () => {
    const r = wellnessLight({
      today: TODAY, watch: [],
      wellness: W({ pain: 4, itemsLow: 2 }),
      load: L({ done: 600, planned: 500, kmVariationPct: 8, monotony: 2.3, unplannedOverCeiling: true }),
    })!;
    expect(r.light).toBe("orange");
    expect(r.orange.map((s) => s.key)).toEqual(["load_over_plan", "km_rise", "unplanned_over_ceiling", "monotony", "wellness_items", "pain"]);
    expect(r.sentence).toBe("Charge des 7 jours 20 % au-dessus du prévu");
  });

  it("aucune donnée : pas de feu (« — »)", () => {
    expect(wellnessLight({ today: TODAY, watch: [], wellness: null, load: null })).toBeNull();
    expect(wellnessLight({ today: TODAY, watch: [], wellness: null, load: L({ done: 0, planned: null }) })).toBeNull();
  });

  it("sommeil de la montre en baisse : signe de rouge", () => {
    const sleepHabit = nights(28, 7, (i) => ({ hrvMs: Math.exp(i % 2 ? 4.37 : 4.13), restingHr: 51, sleepMin: i % 2 ? 460 : 440 }));
    const sleepLow = nights(7, 0, () => ({ hrvMs: Math.exp(4.12), restingHr: 51, sleepMin: 380 }));
    const r = wellnessLight({ today: TODAY, watch: [...sleepHabit, ...sleepLow], wellness: W({ envie: 2 }), load: L({ done: 600, previous: 500 }) })!;
    expect(r.redSigns.map((s) => s.key)).toEqual(["envie_low", "sleep_drop"]);
    expect(r.light).toBe("red");
  });
});
