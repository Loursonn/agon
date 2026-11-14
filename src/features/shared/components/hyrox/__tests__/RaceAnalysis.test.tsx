// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HyroxResult } from "@/features/shared/types/hyrox";

const total = 300 * 8 + 2010 + 450;
const t = Array.from({ length: total + 601 }, (_, i) => i);
const stream = new Proxy({ t, timer: null, hr: t.map((s) => (s < 600 ? 120 : 150 + ((s * 7) % 30))), cadence: t.map(() => 168) } as Record<string, unknown>, {
  get: (o, k: string) => (k in o ? o[k] : null),
});
let watch: { loading: boolean; activityId: string | null; detail: unknown; error: unknown } = { loading: false, activityId: null, detail: null, error: null };

vi.mock("@/features/shared/hooks/hyrox/useRaceWatch", () => ({ useRaceWatch: () => watch }));
vi.mock("@/features/shared/hooks/hyrox/useHyroxReferences", () => ({
  useHyroxReferences: () => ({ data: [{ division: "all", bracket: "all", segment: "ski", p1_s: 200, p10_s: 220, p50_s: 240, p90_s: 300 }] }),
}));
vi.mock("@/features/shared/hooks/hyrox/useHyroxResults", () => ({ useHyroxResults: () => ({ data: [] }) }));
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
    expect(screen.getByText(/Aucune activité de montre/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Gains" }));
    expect(screen.getAllByText("SkiErg").length).toBeGreaterThan(0);
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
});
