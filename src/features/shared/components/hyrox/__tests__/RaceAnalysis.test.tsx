// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HyroxResult } from "@/features/shared/types/hyrox";

const total = 300 * 8 + 2010 + 450;
const t = Array.from({ length: total + 601 }, (_, i) => i);
const stream = new Proxy({ t, timer: null, hr: t.map((s) => (s < 600 ? 120 : 150 + ((s * 7) % 30))), cadence: t.map(() => 168) } as Record<string, unknown>, {
  get: (o, k: string) => (k in o ? o[k] : null),
});
let plans: unknown[] = [];
let watch: { loading: boolean; activityId: string | null; detail: unknown; error: unknown } = { loading: false, activityId: null, detail: null, error: null };

vi.mock("@/features/shared/hooks/hyrox/useRaceWatch", () => ({
  useRaceWatch: () => ({ linked: false, candidates: [], ...watch }),
  useLinkRaceWatch: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Dernier bilan de tests validé : la règle « seuils » est déclenchée.
vi.mock("@/features/shared/hooks/hyrox/useHyroxTests", () => ({
  useHyroxAnalyses: () => ({ data: [{ id: "t1", date: "2026-09-01", validated_at: "2026-09-02", outputs: { rules: [{ id: "run_seuils", axis: "Seuils de course", means: "" }] } }] }),
}));
vi.mock("@/features/shared/hooks/hyrox/useHyroxRacePlans", () => ({ useHyroxRacePlans: () => ({ data: plans }) }));
vi.mock("@/features/shared/hooks/hyrox/useHyroxResults", () => ({ useHyroxResults: () => ({ data: [] }), useUpdateHyroxResult: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/features/shared/hooks/useCoCoach", () => ({ useAthleteCoaches: () => ({ data: { referent: { id: "c", full_name: "Agon Démo" }, coCoach: null } }) }));

const { default: RaceAnalysis } = await import("../RaceAnalysis");

const race = {
  id: "r1", athlete_id: "lea", competition_id: null, created_by: null, date: "2026-10-04",
  event_name: "HYROX Paris", venue: null, format: "individual", division: "open", age_group: null,
  is_official: true, status: "finished", total_s: total,
  run_1_s: 290, run_2_s: 295, run_3_s: 300, run_4_s: 300, run_5_s: 300, run_6_s: 305, run_7_s: 300, run_8_s: 310,
  ski_s: 270, sled_push_s: 180, sled_pull_s: 240, bbj_s: 300, row_s: 280, farmers_s: 120, lunges_s: 260, wall_balls_s: 360,
  roxzone_total_s: 450, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: 120, rank_age_group: null, participants_overall: 800, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "2026-10-04T12:00:00Z",
} as unknown as HyroxResult;

describe("RaceAnalysis", () => {
  it("sans montre : temps analysés, onglets accessibles", () => {
    watch = { loading: false, activityId: null, detail: null, error: null };
    render(<RaceAnalysis race={race} onBack={() => {}} />);
    expect(screen.getByText("HYROX Paris")).toBeTruthy();
    // Sans plan : objectif construit sur le run du jour ; aucune position dans la catégorie, seul le rang officiel.
    expect(screen.getByText(/^Vs objectif/)).toBeTruthy();
    expect(screen.getAllByText(/run du jour/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Position")).toBeNull();
    expect(screen.getAllByText(/Top \d+ %/)).toHaveLength(1); // rang officiel 120 / 800, rien d'autre
    expect(screen.getByText("Rang")).toBeTruthy();
    expect(screen.getAllByText(/Aucune activité de montre/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Stratégie" }));
    expect(screen.getByText("Et avec une meilleure stratégie ?")).toBeTruthy();
    expect(screen.getAllByText("Roxzone").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Déjà dans ses axes/)).toBeNull(); // l'axe du bilan : coach seulement
    fireEvent.click(screen.getByRole("tab", { name: "Runs" }));
    expect(screen.getByText(/Allure par km/)).toBeTruthy();
  });

  it("avec montre : attribution affichée et constats de la montre", () => {
    watch = { loading: false, activityId: "a1", error: null, detail: { stream, display: null, bounds: { kind: "three", bounds: [140, 165] }, attribution: "Garmin Forerunner 265" } };
    render(<RaceAnalysis race={race} onBack={() => {}} />);
    expect(screen.getAllByText(/Garmin Forerunner 265/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ce que dit la montre")).toBeTruthy();
    expect(screen.getByText(/Départ placé à 10:00/)).toBeTruthy();
  });

  it("coach : objectif = plan de course, « Comparer à », leviers et colonne Objectif", () => {
    watch = { loading: false, activityId: null, detail: null, error: null };
    const seg = (k: string) => (race as unknown as Record<string, number>)[`${k}_s`];
    const targets = Object.fromEntries(["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8", "ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls"].map((k) => [k, seg(k) - 5]));
    plans = [{ id: "p1", result_id: "r1", competition_id: null, target_total_s: total - 80, targets: { ...targets, roxzone_per_transition: 50 }, updated_at: "2026-10-01" }];
    render(<RaceAnalysis race={race} onBack={() => {}} audience="coach" />);
    expect(screen.getByText(/^Vs objectif/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Objectif · plan de course" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("radio", { name: /Course précédente/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Leviers · quoi travailler/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Ajouter au programme" }).length).toBeGreaterThan(0);
    // Runs tous 5 s au-dessus du plan : allure de course, reliée à l'axe « seuils » du bilan validé.
    expect(screen.getAllByText("Allure de course").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Seuils de course").length).toBeGreaterThan(0);
    expect(screen.getByText("Objectif")).toBeTruthy();
    expect(screen.queryByText("Médiane")).toBeNull();
    plans = [];
  });
});
