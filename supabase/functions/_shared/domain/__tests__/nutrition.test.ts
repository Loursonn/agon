import { describe, it, expect } from "vitest";
import {
  cleanDailyLog, dayDepense, evaluateLoggedDay, evaluateNutritionDay, nutritionAdherence, nutritionDays,
  type NutritionStrategy,
} from "../nutrition";

const seche: NutritionStrategy = {
  strategy: "seche", can_track_calories: true, calorie_mode: "active", deficit_mode: "fixed",
  tdee_ref: 2500, surplus_deficit_min: -20, surplus_deficit_max: -20,
};

describe("nutritionDays", () => {
  it("date, trie, borne et relit l'ancien format de jour", () => {
    const raw = {
      "2026-11-03": { total_calories_consumed: 2000, glucides_consumed: 200 },
      "20261101": { total_calories_consumed: 1800 },
      "2026-10-20": { total_calories_consumed: 1500 },
      "pas-un-jour": { total_calories_consumed: 99 },
    };
    const days = nutritionDays(raw, "2026-11-01", "2026-11-07");
    expect(days.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-03"]);
    expect(days[1]).toEqual({
      date: "2026-11-03", active_calories: null, total_calories_consumed: 2000,
      glucides_consumed: 200, lipides_consumed: null, proteines_consumed: null,
    });
  });

  it("valeur absente ou abîmée → aucune journée", () => {
    expect(nutritionDays(null)).toEqual([]);
    expect(nutritionDays([1, 2])).toEqual([]);
  });
});

describe("cleanDailyLog", () => {
  it("ne garde que les champs connus, en nombres", () => {
    expect(cleanDailyLog({ total_calories_consumed: 2100, glucides_consumed: "12", note: "x" } as never)).toEqual({
      active_calories: null, total_calories_consumed: 2100, glucides_consumed: null,
      lipides_consumed: null, proteines_consumed: null,
    });
  });
});

describe("évaluation en % (et non en kcal)", () => {
  it("2000 kcal pour une dépense de 2500 = -20 % → dans l'objectif d'une sèche à -20 %", () => {
    const e = evaluateNutritionDay(seche, 2000);
    expect(e?.status).toBe("ok");
    expect(e?.actualPct).toBeCloseTo(-20);
    expect(e?.targetMin).toBe(2000);
  });

  it("les calories actives saisies + le MB remplacent la dépense du plan", () => {
    const log = { total_calories_consumed: 2000, active_calories: 700 };
    expect(dayDepense(seche, 1800, log)).toBe(2500);
    expect(dayDepense({ ...seche, calorie_mode: "nap" }, 1800, log)).toBeNull();
    expect(dayDepense(seche, null, log)).toBeNull();
    expect(evaluateLoggedDay(seche, 1800, { total_calories_consumed: 2000, active_calories: 1200 })?.status).toBe("off");
  });

  it("rien de consommé → pas d'évaluation", () => {
    expect(evaluateLoggedDay(seche, 1800, { total_calories_consumed: 0 })).toBeNull();
  });
});

describe("nutritionAdherence", () => {
  it("compte les jours dans l'objectif parmi les jours saisis", () => {
    const days = [
      { total_calories_consumed: 2000 }, // -20 % → ok
      { total_calories_consumed: 2150 }, // -14 % → hors objectif
      { total_calories_consumed: null },
    ];
    expect(nutritionAdherence(seche, null, days)).toEqual({ logged: 2, ok: 1, close: 0, pctOk: 50 });
  });

  it("sans stratégie : jours saisis comptés, pas de %", () => {
    expect(nutritionAdherence(null, null, [{ total_calories_consumed: 2000 }])).toEqual({ logged: 1, ok: 0, close: 0, pctOk: null });
  });
});
