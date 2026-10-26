import { describe, it, expect } from "vitest";
import { defaultExerciceParams, type ExerciceParams } from "@/features/coach/components/programmation/types";
import {
  formatPlannedSetsReps, formatReps, formatSetsReps, hasIso, isAllIso, isIsoAt,
} from "@/lib/formatSetsReps";

const base = (over: Partial<ExerciceParams>): ExerciceParams => ({ ...defaultExerciceParams(4), ...over });

describe("formatSetsReps", () => {
  it("EC → 4 × 8", () => {
    expect(formatSetsReps(base({ reps: { mode: "global", value: 8 } }))).toBe("4 × 8");
  });
  it("iso → 4 × 30 s", () => {
    expect(formatSetsReps(base({ reps: { mode: "global", value: 30 }, reps_mode: { mode: "global", value: "iso" } }))).toBe("4 × 30 s");
  });
  it("fourchette EC et iso", () => {
    expect(formatSetsReps(base({ reps: { mode: "global", value: 8 }, reps_max: { mode: "global", value: 10 } }))).toBe("4 × 8-10");
    expect(formatSetsReps(base({
      reps: { mode: "global", value: 30 }, reps_max: { mode: "global", value: 40 },
      reps_mode: { mode: "global", value: "iso" },
    }))).toBe("4 × 30-40 s");
  });
  it("par série", () => {
    expect(formatSetsReps(base({ nb_series: 3, reps: { mode: "par_serie", values: [8, 6, 4] } }))).toBe("8 / 6 / 4");
    expect(formatSetsReps(base({ nb_series: 2, reps: { mode: "par_serie", values: [30, 20] }, reps_mode: { mode: "global", value: "iso" } }))).toBe("30 s / 20 s");
  });
  it("iso par occurrence/série mélangé", () => {
    const p = base({ nb_series: 2, reps: { mode: "par_serie", values: [8, 30] }, reps_mode: { mode: "par_serie", values: ["EC", "iso"] } });
    expect(formatReps(p)).toBe("8 / 30 s");
    expect(hasIso(p)).toBe(true);
    expect(isAllIso(p)).toBe(false);
    expect(isIsoAt(p, 1)).toBe(true);
  });
  it("par série identiques → compacté", () => {
    expect(formatSetsReps(base({ nb_series: 3, reps: { mode: "par_serie", values: [5, 5, 5] } }))).toBe("3 × 5");
  });
  it("cluster", () => {
    expect(formatSetsReps(base({ nb_series: 3, cluster: { nb_clusters: 3, reps: [3, 2, 1], recup_sec: 15 } }))).toBe("3 × (3+2+1 + 15s)");
  });
  it("null → —", () => {
    expect(formatSetsReps(null)).toBe("—");
  });
});

describe("formatPlannedSetsReps", () => {
  it("données aplaties (Retours)", () => {
    expect(formatPlannedSetsReps(4, "30", true)).toBe("4 × 30 s");
    expect(formatPlannedSetsReps(4, "8-10")).toBe("4 × 8-10");
    expect(formatPlannedSetsReps(4, null, true)).toBe("4 × —");
  });
});
