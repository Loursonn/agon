import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { GRID_SET_V1, analyzeTests, storedOutputs, validatedFromPlan, type HyroxTestAnalysisRow, type HyroxTestInputs } from "@/lib/hyrox/tests";

// Pas de réseau : hooks de données remplacés par des valeurs fixes.
const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/features/shared/hooks/hyrox/useHyroxTests", () => ({
  useGridSet: () => ({ data: GRID_SET_V1 }),
  useHyroxAxesDraft: () => ({ data: null }),
  useCreateHyroxAnalysis: () => mutation,
  useSaveAxesDraft: () => mutation,
  useValidateAxes: () => mutation,
}));
vi.mock("@/features/shared/hooks/hyrox/useHyroxResults", () => ({ useHyroxResults: () => ({ data: [] }) }));

import AnalysisSheet from "../AnalysisSheet";

beforeAll(() => {
  // recharts (ResponsiveContainer) a besoin de ResizeObserver, absent de jsdom.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const PROFILE = { sex: "H" as const, category: "Open" as const, age: 32, weight_kg: 78, height_cm: 180 };
const INPUTS: HyroxTestInputs = {
  run_1200m: { duration_s: 270, hr_avg: 176 }, run_12min: { distance_m: 2750, hr_avg: 170 }, run_6min: { distance_m: 1530, hr_avg: 174 },
  row_2000m_s: 468, ski_2000m_s: 510, strict_press: { kg: 52.5, reps: 5 }, thruster: { kg: 70, reps: 4 },
  wall_balls_5min: { total: 86 }, sled_push: { times_s: [7.5, 10, 14] }, sled_pull: { times_s: [8, 11, 16] },
  bbj_80m: { time_s: 250 }, broad_jump_cm: 228, triple_broad_jump_cm: 620, single_leg_hop_cm: { left: 165, right: 178 },
  dead_hang_s: 75, calf_raise_reps: { left: 22, right: 27 }, knee_to_wall_cm: { left: 9.5, right: 11 },
  single_leg_bridge_reps: { left: 21, right: 24 }, single_leg_sit_to_stand_reps: { left: 8, right: 11 },
};
const out = analyzeTests(INPUTS, PROFILE, { target_s: 80 * 60, context: { competition: "A", weeks_to_a: 16 } });
const axes = validatedFromPlan(out.axes_plan);
axes.principal1 = { label: "Course", detail: "Seuils : du travail en zone 2." };
const ROW: HyroxTestAnalysisRow = {
  id: "a1", athlete_id: "x", kind: "bilan", date: "2026-11-08", source_result_ids: [], inputs: INPUTS, profile: PROFILE,
  outputs: storedOutputs(out) as unknown as Record<string, unknown>, algo_version: out.algo_version, grid_version: "v1", target_s: 4800,
  axes_validated: axes, validated_at: "2026-11-09T10:00:00Z", validated_by: "c", recalculated_from: null, created_by: "c",
  created_at: "2026-11-09T09:00:00Z", updated_at: "2026-11-09T10:00:00Z",
};

describe("Fiche résultat Tests HYROX", () => {
  it("athlète : 3 zones, axes validés, rien du côté coach", () => {
    const { container } = render(<AnalysisSheet analysis={ROW} audience="athlete" athleteId="x" onBack={() => {}} />);
    const text = container.textContent ?? "";
    expect(screen.getByText("Zone 1 · Endurance")).toBeInTheDocument();
    expect(screen.getByText("Zone 2 · Seuils")).toBeInTheDocument();
    expect(screen.getByText("Zone 3 · Haute intensité")).toBeInTheDocument();
    expect(screen.getByText("Mes axes de travail")).toBeInTheDocument();
    expect(text).not.toMatch(/Côté coach|Facteur d'endurance|D′|Pistes par station|calcul hyrox-tests|\bZ[1-6]\b|moteur|le HYROX/);
    expect(text).toMatch(/Système cardio-respiratoire/);
  });

  it("coach : versions, côté coach, grilles, proposition d'axes", () => {
    const { container } = render(<AnalysisSheet analysis={ROW} audience="coach" athleteId="x" onBack={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/calcul hyrox-tests@1\.0\.0 · grilles v1/);
    expect(text).toMatch(/Côté coach/);
    expect(text).toMatch(/Facteur d'endurance/);
    expect(text).toMatch(/Axes de travail · proposition/);
    expect(text).toMatch(/Principal 1 · Course/);
    expect(text).toMatch(/Visible par l'athlète/);
  });

  it("athlète sans validation : pas de bloc d'axes", () => {
    const { container } = render(<AnalysisSheet analysis={{ ...ROW, axes_validated: null, validated_at: null, validated_by: null }} audience="athlete" athleteId="x" onBack={() => {}} />);
    expect(container.textContent).not.toMatch(/Mes axes de travail/);
  });
});
