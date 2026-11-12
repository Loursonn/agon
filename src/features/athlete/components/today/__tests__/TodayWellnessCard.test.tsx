// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TodayWellnessCard } from "../TodayWellnessCard";
import type { WellnessData } from "@/features/shared/types/athlete";

const readiness = { score: 72, color: "#66F03C", label: "Prête" } as never;

describe("TodayWellnessCard", () => {
  it("dépliant : 5 notes puis envie, douleur, malade et zones", () => {
    const wellness = { fatigue: 4, sommeil: 3, stress: 4, energie: 4, doms: 2, envie: 5, pain: 4, sick: true, domsLevels: { quadriceps: 2 } } as unknown as WellnessData;
    render(<TodayWellnessCard readiness={readiness} advice={null} wellness={wellness} />);
    expect(screen.queryByText("Envie 5/5")).toBeNull();
    fireEvent.click(screen.getByText("Voir le détail"));
    expect(screen.getByText("Envie 5/5")).toBeTruthy();
    expect(screen.getByText("Douleur 4/10")).toBeTruthy();
    expect(screen.getByText("Malade")).toBeTruthy();
    expect(screen.getByText("Quadriceps")).toBeTruthy();
  });

  it("sans les nouveaux champs : pas de ligne en plus", () => {
    const wellness = { fatigue: 4, sommeil: 3, stress: 4, energie: 4, doms: 2 } as unknown as WellnessData;
    render(<TodayWellnessCard readiness={readiness} advice={null} wellness={wellness} />);
    fireEvent.click(screen.getByText("Voir le détail"));
    expect(screen.queryByText(/Envie|Douleur|Malade/)).toBeNull();
  });
});
