import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Contexte athlète minimal : le shell ne lit que ces champs.
const ctx = {
  athleteId: "a1", athleteProfile: { is_hyrox_athlete: false },
  viewOnly: false, saveStatus: null,
  showWellness: false, setShowWellness: vi.fn(), showAppFeedback: false, setShowAppFeedback: vi.fn(),
  showBilan: false, setShowBilan: vi.fn(), showNewBlock: false, setShowNewBlock: vi.fn(),
  weekJustCompleted: null, tw: 4, milestoneNotif: null,
  timerActive: false, timerFinished: false, timerLeft: 0, timerDur: 90, timerStop: vi.fn(),
  showBlockHistory: false, setShowBlockHistory: vi.fn(), blockHistory: [], setBlockHistory: vi.fn(),
  exos: {}, sessions: [], prs: {}, combinedData: [], totalDone: 0,
  saveWellness: vi.fn(), goals: {}, wellness: null, weightLog: {}, archiveAndNewBlock: vi.fn(),
  freeSessions: [],
};
vi.mock("@/features/shared/context/AthleteContext", () => ({ useAthleteContext: () => ctx }));
vi.mock("@/features/shared/hooks/useMedicalEntries", () => ({ useActiveInjuries: () => ({ injuries: [] }) }));
vi.mock("@/features/shared/hooks/useUnfinishedWorkouts", () => ({ useUnfinishedWorkouts: () => ({ data: [] }) }));
vi.mock("@/features/staff/hooks/useAthleteStaff", () => ({ useAthleteStaff: () => ({ data: [] }) }));
vi.mock("@/features/shared/components/fiches/FicheViewerHost", () => ({ FicheViewerHost: () => null }));
vi.mock("@/features/athlete/components/ProfileDrawer", () => ({ default: () => <div>Tiroir profil</div> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, profile: null }) }));
vi.mock("@/features/shared/hooks/useCoCoach", () => ({ useAthleteCoaches: () => ({ data: null }) }));
vi.mock("@/features/athlete/components/AppFbForm", () => ({ default: () => null }));
vi.mock("@/components/athlete/WellnessFlow", () => ({ WellnessFlow: () => null }));
vi.mock("@/components/coach/CoachComponents", () => ({ NewBlockModal: () => null }));
vi.mock("@/components/athlete/StatsCharts", () => ({ CombinedStatsChart: () => null }));
vi.mock("@/features/coach/components/BlockHistoryViewer", () => ({ default: () => null }));
vi.mock("@/features/shared/components/OfflineBanner", () => ({ default: () => <div data-testid="offline-banner" /> }));

import AthleteLayout from "../AthleteLayout";

function renderLayout(onSwitchMode?: () => void) {
  return render(
    <MemoryRouter initialEntries={["/athlete"]}>
      <Routes>
        <Route path="/athlete" element={<AthleteLayout onSwitchMode={onSwitchMode} />}>
          <Route index element={<div>Page du jour</div>} />
          <Route path="program" element={<div>Page programme</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AthleteLayout responsive", () => {
  // jsdom n'applique pas les media queries : on vérifie que les deux navigations
  // existent avec les bonnes classes (barre du bas < 1024 px, latérale ≥ 1024 px).
  it("rend la barre du bas (mobile) et la navigation latérale (PC)", () => {
    renderLayout();
    const side = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(side.className).toContain("hidden");
    expect(side.className).toContain("lg:flex");
    const bottomTab = screen.getAllByText("Programme").find((el) => !side.contains(el))!;
    expect(bottomTab.closest(".lg\\:hidden")).not.toBeNull();
    expect(screen.getByText("Page du jour")).toBeInTheDocument();
  });

  it("les deux navigations mènent à la même page", () => {
    renderLayout();
    const side = screen.getByRole("navigation", { name: "Navigation principale" });
    const sideBtn = Array.from(side.querySelectorAll("button")).find((b) => b.textContent === "Programme")!;
    fireEvent.click(sideBtn);
    expect(screen.getByText("Page programme")).toBeInTheDocument();
    expect(sideBtn).toHaveAttribute("aria-current", "page");
  });

  it("garde Mode Coach et le tiroir profil", () => {
    const onSwitch = vi.fn();
    renderLayout(onSwitch);
    fireEvent.click(screen.getByText("Mode Coach"));
    expect(onSwitch).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Mon profil"));
    expect(screen.getByText("Tiroir profil")).toBeInTheDocument();
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });
});
