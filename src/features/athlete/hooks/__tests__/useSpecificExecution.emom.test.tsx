import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import { useSpecificExecution } from "../useSpecificExecution";

const ex = (id: string): EnergyStep => ({
  type: "exercise", id, role: "work", exercise_id: id, exercise_name: id, reps_min: 10, target: { kind: "none" },
});
const steps: EnergyStep[] = [
  { type: "group", id: "g", repeat: 3, departure_every_s: 60, children: [ex("burpees")] } as EnergyGroup,
];

describe("useSpecificExecution — EMOM", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  // Seconde par seconde : React rejoue ses effets entre deux ticks, comme dans le navigateur.
  const tick = (ms: number) => { for (let t = 0; t < ms; t += 1000) act(() => { vi.advanceTimersByTime(Math.min(1000, ms - t)); }); };

  it("« Fait » en avance : repos = reste de la minute, puis minute suivante", () => {
    const { result } = renderHook(() => useSpecificExecution(steps));
    act(() => result.current.start());
    expect(result.current.currentFlatStep?.roundLabel).toBe("Minute 1 / 3");
    tick(20_000);
    expect(result.current.minuteLeft).toBe(40);
    act(() => result.current.skip()); // burpees faits en 20 s
    expect(result.current.currentFlatStep?.emom?.gap).toBe(true);
    expect(result.current.secondsLeft).toBe(40);
    tick(40_000);
    expect(result.current.currentFlatStep?.roundLabel).toBe("Minute 2 / 3");
    expect(result.current.currentFlatStep?.emom?.gap).toBeUndefined();
    expect(result.current.minuteLeft).toBe(60);
  });

  it("minute écoulée sans « Fait » : la minute suivante part toute seule", () => {
    const { result } = renderHook(() => useSpecificExecution(steps));
    act(() => result.current.start());
    tick(61_000);
    expect(result.current.currentFlatStep?.roundLabel).toBe("Minute 2 / 3");
    expect(result.current.currentFlatStep?.step.id).toBe("burpees");
  });

  it("fin de la dernière minute : séance terminée", () => {
    const { result } = renderHook(() => useSpecificExecution(steps));
    act(() => result.current.start());
    tick(3 * 60_000 + 2_000);
    expect(result.current.phase).toBe("completed");
  });
});
