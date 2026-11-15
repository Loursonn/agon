import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import {
  wellnessLight, type LoadSignals, type MorningEntry, type MorningHistory, type WatchDay, type WellnessSignals,
} from "../wellnessLight";

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

  it("même tableau sans hausse de charge : rouge depuis le 14/11, VFC et FC de repos se répètent", () => {
    const r = wellnessLight({ today: TODAY, watch: [...habit, ...lowWeek], wellness: W({ envie: 2 }), load: L({ done: 500, planned: 560, previous: 544 }) })!;
    expect(r.light).toBe("red");
    expect(r.morning.map((s) => s.key)).toEqual(["envie_down", "resting_hr_high", "hrv_low"]);
    expect(r.morning.find((s) => s.key === "hrv_low")!.days).toBe(3);
    expect(r.sentence).toContain("VFC sous ta zone habituelle depuis 3 jours");
    expect(r.sentence).toContain("les signaux se répètent");
    // L'envie basse d'un seul jour ne fait pas partie de la répétition.
    expect(r.sentence).not.toContain("Envie");
  });

  it("tout dans l'habitude : vert", () => {
    const r = wellnessLight({ today: TODAY, watch: [...habit, ...fineWeek], wellness: W(), load: L() })!;
    expect(r.light).toBe("green");
    expect(r.sentence).toBe("Rien à signaler ce matin");
    expect(r.morning).toEqual([]);
    expect(r.brand).toBe("garmin");
  });

  it("sans montre ni historique : un jour de ressentis bas reste orange, malade = rouge", () => {
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
    expect(r.orange.map((s) => s.key)).toEqual(["pain", "load_over_plan", "km_rise", "unplanned_over_ceiling", "monotony", "wellness_items"]);
    expect(r.sentence).toBe("Douleur 4/10 : signal isolé, à surveiller (rouge s'il se répète demain)");
  });

  it("orange sans signal du matin : la phrase reprend le premier signal", () => {
    const r = wellnessLight({ today: TODAY, watch: [], wellness: W(), load: L({ done: 600, planned: 500 }) })!;
    expect(r.light).toBe("orange");
    expect(r.sentence).toBe("Charge des 7 jours 20 % au-dessus du prévu : à surveiller");
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

// ── Règles d'Hugo du 14/11 : signaux du matin et persistance ──────────────────

/** Saisie du matin `offset` jours avant aujourd'hui (0 = aujourd'hui). */
const day = (offset: number) => addDays(TODAY, -offset);
const E = (over: Partial<MorningEntry> & { fatigue?: number | null } = {}): MorningEntry => {
  const { fatigue = 4, ...rest } = over;
  return { envie: 4, pain: 0, items: { fatigue }, ...rest };
};
/** `n` saisies habituelles finissant `endOffset` jours avant aujourd'hui. */
function habitEntries(n: number, endOffset: number, e: MorningEntry = E()): MorningHistory {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [day(endOffset + i), e]));
}
const run = (morning: MorningHistory, watch: WatchDay[] = []) =>
  wellnessLight({ today: TODAY, watch, wellness: W(morning[TODAY] ? { pain: morning[TODAY].pain, envie: morning[TODAY].envie } : {}), morning, load: null })!;

describe("feu du matin : signaux d'Hugo (14/11)", () => {
  it("douleur : 1-3 = gêne, pas de signal ; 4 et plus = douleur", () => {
    expect(run({ [TODAY]: E({ pain: 3 }) }).light).toBe("green");
    const r = run({ [TODAY]: E({ pain: 4 }) });
    expect(r.light).toBe("orange");
    expect(r.morning).toEqual([{ key: "pain", text: "Douleur 4/10", days: 1 }]);
  });

  it("douleur deux jours de suite : rouge, « depuis 2 jours »", () => {
    const r = run({ [day(1)]: E({ pain: 4 }), [TODAY]: E({ pain: 5 }) });
    expect(r.light).toBe("red");
    expect(r.sentence).toBe("Douleur 5/10 depuis 2 jours : le signal se répète, à prendre au sérieux");
  });

  it("douleur trois jours de suite : « depuis 3 jours »", () => {
    const r = run({ [day(2)]: E({ pain: 6 }), [day(1)]: E({ pain: 4 }), [TODAY]: E({ pain: 5 }) });
    expect(r.morning[0].days).toBe(3);
    expect(r.light).toBe("red");
  });

  it("un jour sans saisie casse la série : douleur aujourd'hui et avant-hier = orange", () => {
    const r = run({ [day(2)]: E({ pain: 6 }), [TODAY]: E({ pain: 6 }) });
    expect(r.light).toBe("orange");
    expect(r.morning[0].days).toBe(1);
  });

  it("douleur de la veille seulement (pas encore de saisie aujourd'hui) : signal d'hier ; d'avant-hier : rien", () => {
    expect(run({ [day(2)]: E({ pain: 6 }), [day(1)]: E({ pain: 6 }) }).light).toBe("red");
    const old = wellnessLight({ today: TODAY, watch: [], wellness: null, morning: { [day(2)]: E({ pain: 6 }) }, load: L() })!;
    expect(old.morning).toEqual([]);
  });

  it("douleur un jour, envie basse le lendemain : signaux différents, pas de répétition", () => {
    const r = run({ [day(1)]: E({ pain: 6 }), [TODAY]: E({ envie: 2 }) });
    expect(r.light).toBe("orange");
    expect(r.morning.map((s) => s.key)).toEqual(["envie_down"]);
  });

  it("envie touchée : ≤ 2/5, ou nettement sous l'habitude", () => {
    expect(run({ [TODAY]: E({ envie: 2 }) }).morning).toEqual([{ key: "envie_down", text: "Envie 2/5", days: 1 }]);
    // Habituellement 5/5 : 3/5 est une baisse nette (z = −4 avec le plancher 0,5).
    const r = run({ ...habitEntries(10, 1, E({ envie: 5 })), [TODAY]: E({ envie: 3 }) });
    expect(r.morning).toEqual([{ key: "envie_down", text: "Envie 3/5 (habitude 5,0)", days: 1 }]);
    // Habituellement 3/5 : 3/5 n'est pas une baisse.
    expect(run({ ...habitEntries(10, 1, E({ envie: 3 })), [TODAY]: E({ envie: 3 }) }).morning).toEqual([]);
    // Moins de 7 saisies d'habitude : seul le seuil fixe compte.
    expect(run({ ...habitEntries(6, 1, E({ envie: 5 })), [TODAY]: E({ envie: 3 }) }).morning).toEqual([]);
  });

  it("envie en baisse deux jours de suite : rouge", () => {
    const r = run({ ...habitEntries(10, 2, E({ envie: 5 })), [day(1)]: E({ envie: 3 }), [TODAY]: E({ envie: 3 }) });
    expect(r.light).toBe("red");
    expect(r.morning[0]).toMatchObject({ key: "envie_down", days: 2 });
  });

  it("fatigue : récupération ≤ 2/5 ; deux jours de suite = rouge ; item absent = aucun signal", () => {
    const one = run({ [TODAY]: E({ fatigue: 2 }) });
    expect(one.light).toBe("orange");
    expect(one.morning).toEqual([{ key: "fatigue", text: "Fatigue (récupération 2/5)", days: 1 }]);
    expect(run({ [day(1)]: E({ fatigue: 1 }), [TODAY]: E({ fatigue: 2 }) }).light).toBe("red");
    expect(run({ [day(1)]: E({ fatigue: 1 }), [TODAY]: E({ fatigue: null, envie: null, pain: null }) }).light).toBe("green");
  });

  it("FC de repos : un jour au-dessus = orange, la semaine entière = rouge", () => {
    const rhrHabit = nights(28, 7, (i) => ({ restingHr: i % 2 ? 52.4 : 49.6 }));
    const spike = nights(7, 0, (i) => ({ restingHr: i === 6 ? 62 : 51 }));
    const r = run({}, [...rhrHabit, ...spike]);
    expect(r.light).toBe("orange");
    expect(r.morning.map((s) => [s.key, s.days])).toEqual([["resting_hr_high", 1]]);
    const week = run({}, [...rhrHabit, ...nights(7, 0, () => ({ restingHr: 54 }))]);
    expect(week.light).toBe("red");
    expect(week.sentence).toMatch(/^FC de repos au-dessus de l'habitude \(54 contre 51 bpm\) depuis \d jours/);
  });

  it("VFC anormalement au-dessus : 1 jour = orange, 2 jours = rouge", () => {
    const hrvHabit = nights(28, 7, (i) => ({ hrvMs: Math.exp(i % 2 ? 4.37 : 4.13) }));
    const week = (high: number) => nights(7, 0, (i) => ({ hrvMs: Math.exp(i >= 7 - high ? 4.8 : 4.25) }));
    const one = run({}, [...hrvHabit, ...week(2)]);
    expect(one.hrv.above).toBe(true);
    expect(one.morning.map((s) => [s.key, s.days])).toEqual([["hrv_high", 1]]);
    expect(one.light).toBe("orange");
    const two = run({}, [...hrvHabit, ...week(3)]);
    expect(two.hrv.aboveDays).toBe(2);
    expect(two.light).toBe("red");
    expect(two.sentence).toBe("VFC anormalement au-dessus de ta zone depuis 2 jours : le signal se répète, à prendre au sérieux");
    // Un peu au-dessus de la zone (± 0,5 écart-type) n'est pas « anormal ».
    expect(run({}, [...hrvHabit, ...nights(7, 0, () => ({ hrvMs: Math.exp(4.33) }))]).hrv.above).toBe(false);
  });

  it("VFC en déclin un seul jour (moyenne 7 j tout juste sous la zone) : orange", () => {
    const low = nights(7, 0, (i) => ({ hrvMs: Math.exp(i < 2 ? 4.25 : 4.12) }));
    const r = run({}, [...habit, ...low]);
    expect(r.hrv.belowDays).toBe(1);
    expect(r.light).toBe("orange");
  });

  it("nuits manquantes : pas de moyenne 7 j, pas de signal montre", () => {
    const r = run({ [TODAY]: E() }, [...habit, ...lowWeek.slice(0, 2)]);
    expect(r.hrv.mean7).toBeNull();
    expect(r.restingHr.mean7).toBeNull();
    expect(r.light).toBe("green");
  });

  it("plusieurs signaux isolés : phrase au pluriel", () => {
    const r = run({ [TODAY]: E({ pain: 5, envie: 2, fatigue: 2 }) });
    expect(r.light).toBe("orange");
    expect(r.sentence).toBe("Douleur 5/10 · Envie 2/5 · Fatigue (récupération 2/5) : signaux isolés, à surveiller (rouge s'ils se répètent demain)");
  });
});
