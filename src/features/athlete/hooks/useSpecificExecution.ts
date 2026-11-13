/**
 * useSpecificExecution — state machine for specific session execution.
 *
 * States: preview → executing → completed
 * Flattens EnergyStep tree into linear step list, handles timer countdown,
 * lap_button, round tracking within groups.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { EnergyStep, EnergyGroup, EnergyInterval, ExerciseInterval } from "@/types/energy";
import { estimateIntervalDuration } from "@/lib/energy";

export type ExecutionPhase = "preview" | "executing" | "completed";

export interface FlatExecStep {
  step: EnergyInterval | ExerciseInterval;
  /** Label like "Tour 3 / 8" if inside a repeat group */
  roundLabel?: string;
  /** Depth in group nesting */
  depth: number;
}

/** Flatten steps (expand groups × repeat) into linear ordered list. */
function flattenSteps(steps: EnergyStep[], depth = 0): FlatExecStep[] {
  const result: FlatExecStep[] = [];
  for (const step of steps) {
    if (step.type === "interval" || step.type === "exercise") {
      result.push({ step, depth });
    } else {
      // Group
      const group = step as EnergyGroup;
      for (let rep = 0; rep < group.repeat; rep++) {
        const roundLabel = group.repeat > 1 ? `Tour ${rep + 1} / ${group.repeat}` : undefined;
        for (const child of group.children) {
          if (child.type === "interval" || child.type === "exercise") {
            result.push({ step: child, roundLabel, depth: depth + 1 });
          } else {
            const nested = flattenSteps([child], depth + 1);
            for (const n of nested) {
              result.push({ ...n, roundLabel: roundLabel ?? n.roundLabel });
            }
          }
        }
        // rest_between after each rep except last
        if (group.rest_between && rep < group.repeat - 1) {
          result.push({ step: group.rest_between, roundLabel, depth: depth + 1 });
        }
      }
    }
  }
  return result;
}

export interface SpecificExecutionState {
  phase: ExecutionPhase;
  flatSteps: FlatExecStep[];
  currentIndex: number;
  secondsLeft: number;
  startTime: number | null;
  /** Total elapsed time since session start (seconds) */
  elapsedTotal: number;
}

/** Durée d'un pas, 0 = pas de décompte (lap_button, exercice sans durée). */
function stepDuration(fs: FlatExecStep | undefined): number {
  if (!fs) return 0;
  const s = fs.step;
  if (s.type === "exercise") return s.duration ? estimateIntervalDuration(s) : 0;
  return estimateIntervalDuration(s);
}

export function useSpecificExecution(intervals: EnergyStep[]) {
  const flatSteps = useMemo(() => flattenSteps(intervals), [intervals]);

  const [phase, setPhase] = useState<ExecutionPhase>("preview");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTotal, setElapsedTotal] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  // Index du pas dont le décompte est en cours. null = pas chronométré
  // (lap_button) : celui-là attend une action manuelle de l'athlète.
  const armedIndexRef = useRef<number | null>(null);

  const currentFlatStep = flatSteps[currentIndex] ?? null;
  const nextFlatStep = flatSteps[currentIndex + 1] ?? null;
  const isLastStep = currentIndex >= flatSteps.length - 1;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimerForStep = useCallback((stepIndex: number) => {
    clearTimer();
    const fs = flatSteps[stepIndex];
    if (!fs) return;
    const dur = stepDuration(fs);

    if (dur <= 0) {
      // lap_button or no-duration exercise — no countdown, wait for manual advance
      armedIndexRef.current = null;
      setSecondsLeft(0);
      return;
    }

    // Ce pas est chronométré : il devra s'enchaîner tout seul à l'arrivée à 0.
    armedIndexRef.current = stepIndex;
    setSecondsLeft(dur);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [flatSteps, clearTimer]);

  // Elapsed timer
  useEffect(() => {
    if (phase !== "executing" || !startTimeRef.current) return;
    const interval = setInterval(() => {
      setElapsedTotal(Math.floor((Date.now() - startTimeRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const start = useCallback(() => {
    setPhase("executing");
    setCurrentIndex(0);
    const now = Date.now();
    setStartTime(now);
    startTimeRef.current = now;
    setElapsedTotal(0);
    startTimerForStep(0);
  }, [startTimerForStep]);

  const goToStep = useCallback((index: number) => {
    if (index >= flatSteps.length) {
      // Session complete
      clearTimer();
      armedIndexRef.current = null;
      setPhase("completed");
      return;
    }
    setCurrentIndex(index);
    startTimerForStep(index);
  }, [flatSteps.length, clearTimer, startTimerForStep]);

  const next = useCallback(() => {
    goToStep(currentIndex + 1);
  }, [currentIndex, goToStep]);

  // Enchaînement automatique en fin d'intervalle chronométré.
  // Avant, le décompte tombait à 0, le timer s'arrêtait et plus rien ne se
  // passait : sur un 10×30/30 l'athlète devait taper "Suivant" à chaque
  // intervalle. `armedIndexRef` garantit qu'on n'enchaîne que sur un pas dont
  // le décompte a réellement été armé — un lap_button (durée 0) reste manuel.
  useEffect(() => {
    if (phase !== "executing") return;
    if (secondsLeft !== 0) return;
    if (armedIndexRef.current !== currentIndex) return;
    armedIndexRef.current = null;
    goToStep(currentIndex + 1);
  }, [phase, secondsLeft, currentIndex, goToStep]);

  const skip = useCallback(() => {
    goToStep(currentIndex + 1);
  }, [currentIndex, goToStep]);

  /** Arrête le minuteur et clôt la séance (bouton « Terminer »). */
  const stop = useCallback(() => {
    clearTimer();
    armedIndexRef.current = null;
    setPhase("completed");
  }, [clearTimer]);

  // Cleanup
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    phase,
    setPhase,
    stop,
    flatSteps,
    currentIndex,
    currentFlatStep,
    nextFlatStep,
    isLastStep,
    secondsLeft,
    startTime,
    elapsedTotal,
    start,
    next,
    skip,
  };
}
