import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { BatteryTest } from "@/features/shared/hooks/hyrox/useHyroxTests";

const mutation = { mutate: vi.fn(), isPending: false };
vi.mock("@/features/shared/hooks/hyrox/useHyroxTests", () => ({ useScheduleTestWeek: () => mutation }));
// Lundi 2 novembre 2026 : la semaine proposée par défaut commence ce jour-là.
vi.mock("../format", async importOriginal => ({ ...(await importOriginal<typeof import("../format")>()), todayIso: () => "2026-11-02" }));

import ScheduleTestWeekDrawer from "../ScheduleTestWeekDrawer";

const t = (id: string, name: string, battery_session: BatteryTest["battery_session"], battery_order = 1): BatteryTest => ({
  id, name, battery_session, battery_order, fill_mode: "coach", media_url: null, description: null, protocol: null, test_variables: [],
});
const TESTS = [t("a", "Broad jump", "S1"), t("b", "Rameur 2000 m", "S2"), t("c", "Dead hang", "S4"), t("d", "Sled push · semaine 1", "W1")];

beforeEach(() => mutation.mutate.mockReset());

describe("Programmer la semaine de tests", () => {
  it("pose chaque test à sa date, sans la Semaine 1 ni ce qui est déjà là", () => {
    render(
      <ScheduleTestWeekDrawer
        open
        athleteId="x"
        tests={TESTS}
        calendar={[{ id: "r1", title: "Rameur 2000 m", date: "2026-11-03", completed: false }]}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Sled push · semaine 1")).not.toBeInTheDocument();
    expect(screen.getByText(/déjà dans le calendrier ce jour-là/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Programmer 2 tests" }));
    expect(mutation.mutate).toHaveBeenCalledWith(
      [{ name: "Broad jump", date: "2026-11-02" }, { name: "Dead hang", date: "2026-11-06" }],
      expect.anything(),
    );
  });

  it("le jour d'une séance se change avant de valider", () => {
    render(<ScheduleTestWeekDrawer open athleteId="x" tests={TESTS} calendar={[]} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Date de la Séance 4/), { target: { value: "2026-11-07" } });
    fireEvent.click(screen.getByRole("button", { name: "Programmer 3 tests" }));
    expect(mutation.mutate.mock.calls[0][0]).toContainEqual({ name: "Dead hang", date: "2026-11-07" });
  });

  it("changer le lundi recale toute la semaine", () => {
    render(<ScheduleTestWeekDrawer open athleteId="x" tests={TESTS} calendar={[]} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Semaine du lundi"), { target: { value: "2026-11-11" } }); // un mercredi
    fireEvent.click(screen.getByRole("button", { name: "Programmer 3 tests" }));
    expect(mutation.mutate.mock.calls[0][0]).toEqual([
      { name: "Broad jump", date: "2026-11-09" },
      { name: "Rameur 2000 m", date: "2026-11-10" },
      { name: "Dead hang", date: "2026-11-13" },
    ]);
  });
});
