import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
const setShowWellness = vi.fn();
const ctx = { athleteId: "a1", wellness: null as unknown, loaded: true, setShowWellness };
const q = <T,>(data: T) => ({ data, isPending: false, fetchStatus: "idle" });
const state = {
  unfinished: [] as { id: string; sessionName: string }[],
  hidden: [] as string[],
};

vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navigate }));
vi.mock("@/hooks/useIsDesktop", () => ({ useIsDesktop: () => true }));
vi.mock("@/features/shared/context/AthleteContext", () => ({ useAthleteContext: () => ctx }));
vi.mock("@/features/shared/hooks/useUnfinishedWorkouts", () => ({ useUnfinishedWorkouts: () => q(state.unfinished) }));
vi.mock("@/features/shared/hooks/useWeeklyCoachRetour", () => ({ useAthleteRetours: () => q([]) }));
vi.mock("@/features/shared/hooks/fiches/useDocs", () => ({ useAthleteDocs: () => q({ assigned: [], personal: [], uploads: [] }) }));
vi.mock("@/hooks/useCompetitions", () => ({ useCompetitions: () => q([]) }));
vi.mock("@/features/shared/hooks/useWeeklyReview", () => ({ useWeeklyReview: () => q(null) }));
vi.mock("@/features/shared/hooks/useHomeSections", async (orig) => {
  const real = await orig<typeof import("@/features/shared/hooks/useHomeSections")>();
  return {
    ...real,
    useHomeHiddenSections: () => ({ hidden: state.hidden, isEnabled: (k: "weekly_review") => real.isOptedIn(state.hidden, k), isLoading: false }),
  };
});

import { AthleteTodoSheet } from "../AthleteTodoSheet";

const show = (blocked = false) => render(<MemoryRouter><AthleteTodoSheet uid="u1" blocked={blocked} /></MemoryRouter>);

describe("fenêtre « À faire »", () => {
  beforeEach(() => {
    localStorage.clear();
    navigate.mockReset();
    setShowWellness.mockReset();
    ctx.wellness = null;
    state.unfinished = [];
    state.hidden = [];
  });

  it("wellness pas rempli : la fenêtre s'ouvre, le bouton ouvre le wellness", () => {
    show();
    expect(screen.getByText("À faire aujourd'hui")).toBeTruthy();
    fireEvent.click(screen.getByText("Remplis ton wellness du jour"));
    expect(setShowWellness).toHaveBeenCalledWith(true);
    expect(screen.queryByText("À faire aujourd'hui")).toBeNull();
  });

  it("une seule fois par jour", () => {
    const first = show();
    fireEvent.click(screen.getByText("Plus tard"));
    first.unmount();
    show();
    expect(screen.queryByText("À faire aujourd'hui")).toBeNull();
  });

  it("rien à faire : pas de fenêtre", () => {
    ctx.wellness = { sleep: 4 };
    show();
    expect(screen.queryByText("À faire aujourd'hui")).toBeNull();
  });

  it("attend qu'aucune autre fenêtre ne soit ouverte", () => {
    show(true);
    expect(screen.queryByText("À faire aujourd'hui")).toBeNull();
  });

  it("séance pas terminée : mène à la clôture", () => {
    ctx.wellness = { sleep: 4 };
    state.unfinished = [{ id: "w9", sessionName: "Force A" }];
    show();
    fireEvent.click(screen.getByText("Termine ta séance"));
    expect(navigate).toHaveBeenCalledWith("/athlete/program/workout/w9?finish=1");
  });
});
