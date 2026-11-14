import { describe, expect, it } from "vitest";
import type { FlatExecStep } from "@/features/athlete/hooks/useSpecificExecution";
import { fmtClock, fmtShort, nextWork, roundOf, roundView, stepTitle, wodSummary } from "../specificTimer";

const ex = (name: string, label: string): FlatExecStep => ({
  depth: 1, roundLabel: label,
  step: { type: "exercise", id: name + label, role: "work", exercise_id: "x", exercise_name: name, duration: { kind: "time", value: 40 }, target: { type: "free" } } as never,
});
const rest = (label: string): FlatExecStep => ({
  depth: 1, roundLabel: label,
  step: { type: "interval", id: "r" + label, role: "recovery", duration: { kind: "time", value: 20 }, target: { type: "free" } } as never,
});
const round = (n: number) => {
  const l = `Tour ${n} / 2`;
  return [ex("SkiErg", l), rest(l), ex("Burpees", l), rest(l)];
};
const flat = [...round(1), ...round(2)];

describe("specificTimer", () => {
  it("tour et position", () => {
    expect(roundOf(flat[5])).toEqual({ round: 2, rounds: 2 });
    expect(roundView(flat, 2)).toEqual({ names: ["SkiErg", "Burpees"], current: 1 });
    // En récup : l'exercice qui vient.
    expect(roundView(flat, 1)).toEqual({ names: ["SkiErg", "Burpees"], current: 1 });
    expect(roundView(flat, 4).names).toEqual(["SkiErg", "Burpees"]);
  });
  it("prochain effort", () => {
    expect(stepTitle(nextWork(flat, 1)!.step)).toBe("Burpees");
    expect(stepTitle(nextWork(flat, 3)!.step)).toBe("SkiErg");
    expect(nextWork(flat, 7)).toBeNull();
  });
  it("résumé et horloges", () => {
    expect(wodSummary(flat)).toBe("WOD · 2 tours · 40 s / 20 s");
    expect(fmtShort(40)).toBe("40 s");
    expect(fmtShort(90)).toBe("1:30");
    expect(fmtClock(767)).toBe("12:47");
    expect(fmtClock(27)).toBe("0:27");
  });
});
