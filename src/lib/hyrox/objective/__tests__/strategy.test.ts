import { describe, expect, it } from "vitest";
import { objectiveFromRun } from "../model";
import { raceStrategy } from "../strategy";
import { race } from "./fixtures";

const obj = objectiveFromRun("men", 300)!.segments;
const gain = (s: ReturnType<typeof raceStrategy>, k: string) => s.levers.find((l) => l.key === k)?.gainS ?? 0;

describe("meilleure stratégie", () => {
  it("course pile sur l'objectif : aucun levier, chrono possible = chrono", () => {
    const s = raceStrategy(race(), obj);
    expect(s.levers).toEqual([]);
    expect(s.possibleS).toBe(s.currentS);
  });

  it("départ trop rapide : 1,5 × l'avance, plafonné par ce qui est perdu ensuite, sans double comptage", () => {
    // Run 1 20 s sous l'objectif ; runs 5 à 8 25 s au-dessus.
    const r = race({ run_1_s: 250, run_5_s: 334, run_6_s: 328, run_7_s: 328, run_8_s: 355 });
    const s = raceStrategy(r, obj);
    expect(gain(s, "depart")).toBe(30);
    // Pertes au-delà de la tolérance : 19 + 19 + 19 + 18 = 75 ; 30 pris par le départ (du run 8 vers le run 5).
    expect(gain(s, "run_8")).toBe(0);
    expect(gain(s, "regularite")).toBe(45);
    expect(gain(s, "allure")).toBe(0); // ralentir en fin de course, ce n'est pas un manque d'allure
    expect(s.possibleS).toBe(s.currentS - 75);
  });

  it("course après les sleds et Roxzone", () => {
    const s = raceStrategy(race({ run_3_s: 330, run_4_s: 322, roxzone_total_s: 444 }), obj);
    expect(gain(s, "apres_sleds")).toBe(37); // (27 − 6) + (22 − 6)
    expect(gain(s, "roxzone")).toBe(36); // 44 − 8
    expect(s.levers.every((l) => l.group === "strategie")).toBe(true);
  });

  it("tous les runs plus lents : c'est l'allure de course (capacité), pas la régularité", () => {
    const slower = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`run_${i}_s`, (race() as unknown as Record<string, number>)[`run_${i}_s`] + 20]));
    const s = raceStrategy(race(slower), obj);
    expect(gain(s, "allure")).toBe(160);
    expect(gain(s, "regularite")).toBe(0);
    expect(s.levers.find((l) => l.key === "allure")?.group).toBe("capacite");
  });

  it("no reps : une répétition de plus par no rep, déduite de la capacité aux wall balls", () => {
    const s = raceStrategy(race({ wall_balls_s: 450, wall_balls_no_rep_target: 4, wall_balls_no_rep_depth: 2 }), obj);
    expect(gain(s, "no_reps")).toBe(25); // 6 × 450 / 106
    expect(gain(s, "wall_balls")).toBe(11); // 450 − 25,5 − 405 − 8,1
    expect(s.levers[0].group).toBe("strategie");
    expect(s.levers[s.levers.length - 1].group).toBe("capacite");
  });

  it("un levier sous 10 s n'est pas cité", () => {
    const s = raceStrategy(race({ farmers_s: 135 }), obj); // 10 − 3 = 7
    expect(s.levers).toEqual([]);
  });
});
