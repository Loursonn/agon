// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { race } from "@/lib/hyrox/objective/__tests__/fixtures";
import { objectiveFromRun } from "@/lib/hyrox/objective/model";

const mutate = vi.fn();
let goals: unknown[] = [];
vi.mock("@/features/shared/hooks/hyrox/useHyroxRacePlans", () => ({ useSaveHyroxRacePlan: () => ({ mutate, isPending: false }) }));
vi.mock("@/features/shared/hooks/hyrox/useHyroxSeasonGoals", () => ({ useHyroxSeasonGoals: () => ({ data: goals, isSuccess: true }) }));
vi.mock("@/features/shared/hooks/hyrox/useHyroxTests", () => ({ useHyroxAnalyses: () => ({ data: [], isSuccess: true }) }));

const { default: ObjectiveEditor } = await import("../ObjectiveEditor");

const lastRace = race({ date: "2026-09-16" });
const comp = { id: "c1", name: "HYROX Tenerife", date: "2099-09-04" };

describe("ObjectiveEditor", () => {
  it("nouvel objectif : construit sur le run de la dernière course, ±5 s, enregistre run moyen et modèle", () => {
    goals = [];
    render(<ObjectiveEditor athleteId="a" plan={null} competitions={[comp]} races={[lastRace]} onDone={() => {}} />);
    expect((screen.getByLabelText("Run moyen") as HTMLInputElement).value).toBe("5:00");
    expect(screen.getByText(/Proposé : 5:00 \/km \(Dernière course : HYROX Paris \(16\/09\)\)/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Run moyen −5 s"));
    expect((screen.getByLabelText("Run moyen") as HTMLInputElement).value).toBe("4:55");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'objectif" }));
    const sent = mutate.mock.calls[0][0];
    expect(sent).toMatchObject({ run_avg_s: 295, model_version: "obj@1", locked_total: true, division: "men", competition_id: "c1" });
    expect(sent.target_total_s).toBe(objectiveFromRun("men", 295)!.totalS);
  });

  it("objectif de saison : prioritaire sur la dernière course ; chrono verrouillé quand une cible change", () => {
    goals = [{ id: "g", athlete_id: "a", season: "2099-00", division: "men", run_avg_s: 290, note: null }];
    render(<ObjectiveEditor athleteId="a" plan={null} competitions={[comp]} races={[lastRace]} onDone={() => {}} />);
    expect(screen.getByText(/Objectif de saison 99\/00/)).toBeTruthy();
    const total = objectiveFromRun("men", 290)!.totalS;
    const ski = screen.getByLabelText("Cible SkiErg") as HTMLInputElement;
    fireEvent.change(ski, { target: { value: "3:50" } });
    fireEvent.blur(ski);
    expect(ski.value).toBe("3:50");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'objectif" }));
    expect(mutate.mock.calls.at(-1)![0].target_total_s).toBe(total);
  });
});
