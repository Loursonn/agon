import { describe, expect, it } from "vitest";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import { emomLabel, emomNextRoundIndex, emomSecondsLeft, flattenExecSteps, isEmomRoundStart } from "../execSteps";
import { roundOf, roundView, wodSummary } from "../specificTimer";

const ex = (id: string, name: string): EnergyStep => ({
  type: "exercise", id, role: "work", exercise_id: id, exercise_name: name, reps_min: 10, target: { kind: "none" },
});
const emom = (every: number, repeat: number): EnergyGroup => ({
  type: "group", id: "g", repeat, departure_every_s: every,
  children: [ex("b", "Burpees"), ex("k", "Kettlebell swing")],
  rest_between: { type: "interval", id: "rb", role: "rest", duration: { kind: "time", value: 30 }, target: { kind: "none" } },
} as EnergyGroup);

describe("execSteps — EMOM", () => {
  it("libellés", () => {
    expect(emomLabel(60, 7, 12)).toBe("Minute 7 / 12");
    expect(emomLabel(120, 3, 10)).toBe("Départ 3 / 10");
  });

  it("chaque minute = ses exercices puis le reste de la minute, sans rest_between", () => {
    const flat = flattenExecSteps([emom(60, 12)]);
    expect(flat).toHaveLength(12 * 3);
    expect(flat[18].roundLabel).toBe("Minute 7 / 12");
    expect(flat.map((f) => f.step.id).slice(0, 3)).toEqual(["b", "k", "g-emom-1"]);
    expect(flat.some((f) => f.step.id === "rb")).toBe(false);
    expect(flat[2].emom).toEqual({ every: 60, round: 1, rounds: 12, gap: true });
    expect(flat[2].step.notes).toBe("Repos jusqu'à la minute suivante");
    expect(flat[35].step.notes).toBe("Fin du dernier tour");
    expect(roundOf(flat[18])).toEqual({ round: 7, rounds: 12 });
    expect(roundView(flat, 2).names).toEqual(["Burpees", "Kettlebell swing"]);
  });

  it("début de répétition et répétition suivante", () => {
    const flat = flattenExecSteps([emom(60, 3)]);
    expect([0, 1, 2, 3, 4].map((i) => isEmomRoundStart(flat, i))).toEqual([true, false, false, true, false]);
    expect(emomNextRoundIndex(flat, 0)).toBe(3);
    expect(emomNextRoundIndex(flat, 7)).toBe(9);
  });

  it("secondes restantes dans la minute", () => {
    expect(emomSecondsLeft(0, 0, 60)).toBe(60);
    expect(emomSecondsLeft(0, 26_400, 60)).toBe(34);
    expect(emomSecondsLeft(0, 75_000, 60)).toBe(0);
  });

  it("résumé", () => {
    expect(wodSummary(flattenExecSteps([emom(60, 12)]))).toBe("EMOM · 12 min");
    expect(wodSummary(flattenExecSteps([emom(120, 10)]))).toBe("Départ toutes les 2:00 · 10 tours");
  });

  it("groupe sans départ fixe : Tour n / m et rest_between inchangés", () => {
    const g = { ...emom(60, 2), departure_every_s: undefined } as EnergyGroup;
    const flat = flattenExecSteps([g]);
    expect(flat.map((f) => f.step.id)).toEqual(["b", "k", "rb", "b", "k"]);
    expect(flat[0].roundLabel).toBe("Tour 1 / 2");
    expect(flat[0].emom).toBeUndefined();
  });
});
