import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import IntervalEditor from "../IntervalEditor";
import type { EnergyInterval } from "@/types/energy";

const paceWork = (unit: "min_per_km" | "kmh"): EnergyInterval => ({
  type: "interval", id: "w", role: "work", duration: { kind: "distance", value: 100 },
  target: { kind: "pace", unit, min_s_per_unit: 255, max_s_per_unit: 265 },
});
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => {
  fireEvent.change(input(label), { target: { value } });
  fireEvent.blur(input(label));
};

function edit(interval: EnergyInterval) {
  const onSave = vi.fn();
  render(<IntervalEditor open onOpenChange={() => {}} interval={interval} onSave={onSave} />);
  return onSave;
}

describe("éditeur détaillé : allures", () => {
  it("l'allure se tape librement (plus de reformatage à chaque frappe)", () => {
    const onSave = edit(paceWork("min_per_km"));
    expect(input("Allure 1").value).toBe("4:15");
    fireEvent.change(input("Allure 1"), { target: { value: "4:" } });
    expect(input("Allure 1").value).toBe("4:");
    type("Allure 1", "4:10");
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSave.mock.calls[0][0].target).toMatchObject({ min_s_per_unit: 250, max_s_per_unit: 265 });
  });

  it("bornes à l'envers remises dans l'ordre à l'enregistrement", () => {
    const onSave = edit(paceWork("min_per_km"));
    type("Allure 1", "4'40");
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSave.mock.calls[0][0].target).toMatchObject({ min_s_per_unit: 265, max_s_per_unit: 280 });
  });

  it("km/h : la vitesse tapée est convertie en secondes par km", () => {
    const onSave = edit(paceWork("kmh"));
    expect(input("Vitesse 1").value).toBe("14,1");
    type("Vitesse 1", "15");
    type("Vitesse 2", "16");
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onSave.mock.calls[0][0].target).toMatchObject({ unit: "kmh", min_s_per_unit: 225, max_s_per_unit: 240 });
  });
});
