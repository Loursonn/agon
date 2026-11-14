import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { weekLoad } from "@shared/domain/trainingLoad";

const weeks = [
  weekLoad({ from: "2026-10-05", sessions: [], previousWeeks: [] }),
  ...[450, 480, 400, 515].map((done, i) =>
    weekLoad({ from: `2026-10-${12 + i * 7}`, sessions: [{ id: `s${i}`, day: `2026-10-${12 + i * 7}`, label: "Footing", focus: "endurance", planned: null, done }], previousWeeks: [] }),
  ),
  weekLoad({
    from: "2026-11-09",
    sessions: [
      { id: "a", day: "2026-11-09", label: "VO2", focus: "endurance", planned: 90, done: 82, minutes: [40, 3, 12], km: 9 },
      { id: "b", day: "2026-11-12", label: "Simulation HYROX", focus: "mixed", planned: 120, done: 125, km: 6 },
    ],
    previousWeeks: [515, 400, 480, 450],
    previousWeekKm: 8,
  }),
];

vi.mock("@/features/shared/hooks/useLoadWeeks", () => ({
  useLoadWeeks: () => ({ data: { weeks, missingRirSessions: 1 }, isLoading: false, isError: false }),
}));

import { WeekLoadPanel } from "../WeekLoadPanel";

describe("WeekLoadPanel", () => {
  it("affiche charge, prévu, km, zones, ratio et le signal RIR manquant", () => {
    render(<WeekLoadPanel athleteId="ath" weekStart="2026-11-09" />);
    expect(screen.getByText("Charge de la semaine en cours")).toBeTruthy();
    expect(screen.getAllByText("207").length).toBeGreaterThan(0);
    expect(screen.getByText(/prévu 210/)).toBeTruthy();
    expect(screen.getByText("15,0")).toBeTruthy();
    expect(screen.getByText(/Z1 73 %/)).toBeTruthy();
    expect(screen.getByText("207 / 461")).toBeTruthy();
    expect(screen.getByText("0,45")).toBeTruthy();
    expect(screen.getByText(/1 séance de muscu sans RIR/)).toBeTruthy();
    expect(screen.getByText(/Simulation HYROX \(125 pts, 60 %\)/)).toBeTruthy();
  });
});
