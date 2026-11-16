// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const t = Array.from({ length: 600 }, (_, i) => i);
const stream = { t, timer: null, hr: t.map((s) => (s < 300 ? 140 : 170)) };
const warmup = { id: "w", durationS: 1200, startedAt: "2026-11-15T08:30:00Z", source: "garmin", deviceName: "Forerunner 965", sport: "running", title: "Échauffement" };
const race = { id: "r", durationS: 4500, startedAt: "2026-11-15T09:00:00Z", source: "garmin", deviceName: "Forerunner 965", sport: "hyrox", title: "HYROX Paris" };

let session: { activities: unknown[]; link: unknown; loading: boolean; error: unknown };
const mutate = vi.fn();
const navigate = vi.fn();

vi.mock("@/features/shared/hooks/useCompetitionSession", () => ({
  useCompetitionSession: () => session,
  useLinkCompetitionWatch: () => ({ mutate, isPending: false }),
}));
vi.mock("@/features/shared/hooks/useActivityDetail", () => ({
  useActivityDetail: (_a: string, id?: string) => ({ isLoading: false, data: id ? { display: stream, stream, attribution: "Garmin Forerunner 965" } : undefined }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const { CompetitionWatchPanel } = await import("../CompetitionWatchPanel");
const comp = { id: "c1", date: "2026-11-15", type: "competition" };
const path = (id: string) => `/athlete/program/activity/${id}`;

describe("CompetitionWatchPanel", () => {
  beforeEach(() => { mutate.mockReset(); navigate.mockReset(); });

  it("proposée d'office : la plus longue, mini-courbe FC, attribution Garmin, confirmation", () => {
    session = { activities: [warmup, race], link: null, loading: false, error: null };
    render(<CompetitionWatchPanel athleteId="lea" competition={comp} seancePath={path} />);
    expect(screen.getByText("Proposée")).toBeTruthy();
    expect(screen.getByText("HYROX Paris")).toBeTruthy();
    expect(screen.getAllByText("Garmin Forerunner 965").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Courbe de fréquence cardiaque" })).toBeTruthy();
    expect(screen.getByText("155")).toBeTruthy(); // FC moyenne
    fireEvent.click(screen.getByText("C'est bien la course"));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ competitionId: "c1", activityId: "r", current: null }), expect.anything());
    fireEvent.click(screen.getByText("Voir la séance"));
    expect(navigate).toHaveBeenCalledWith("/athlete/program/activity/r");
  });

  it("liée : choisir une autre sortie remplace le lien", () => {
    session = { activities: [warmup, race], link: { id: "l1", activityId: "r", status: "confirmed" }, loading: false, error: null };
    render(<CompetitionWatchPanel athleteId="lea" competition={comp} seancePath={path} />);
    expect(screen.getByText("Liée")).toBeTruthy();
    expect(screen.queryByText("C'est bien la course")).toBeNull();
    fireEvent.click(screen.getByText("Choisir une autre sortie"));
    fireEvent.click(screen.getByText("Échauffement"));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ activityId: "w", current: { id: "l1", activityId: "r", status: "confirmed" } }),
      expect.anything(),
    );
  });

  it("lecture seule (coach en vue athlète) : pas de choix ; compétition future ou stage : rien", () => {
    session = { activities: [race], link: null, loading: false, error: null };
    const { unmount } = render(<CompetitionWatchPanel athleteId="lea" competition={comp} seancePath={path} canEdit={false} />);
    expect(screen.queryByText("Choisir une autre sortie")).toBeNull();
    unmount();
    const { container } = render(<CompetitionWatchPanel athleteId="lea" competition={{ ...comp, date: "2999-01-01" }} seancePath={path} />);
    expect(container.innerHTML).toBe("");
    const stage = render(<CompetitionWatchPanel athleteId="lea" competition={{ ...comp, type: "stage" }} seancePath={path} />);
    expect(stage.container.innerHTML).toBe("");
  });
});
