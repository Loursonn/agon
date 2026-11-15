import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EnergyBlockCards } from "../EnergyBlockCards";
import type { EnergyGroup, EnergyInterval } from "@/types/energy";

// Carte « intervalles » : 3 × 100 m à 4'15-4'25 /km, récup 2 min (capture d'Hugo du 2026-11-15).
const start = {
  type: "group", id: "__root__", role: "open", repeat: 1,
  children: [{
    type: "group", id: "g1", role: "open", repeat: 3,
    children: [{
      type: "interval", id: "w", role: "work", duration: { kind: "distance", value: 100 },
      target: { kind: "pace", unit: "min_per_km", min_s_per_unit: 255, max_s_per_unit: 265 },
    }],
    rest_between: { type: "interval", id: "r", role: "recovery", duration: { kind: "time", value: 120 }, target: { kind: "hr_zone", zone: 1 } },
  }],
} as unknown as EnergyGroup;

let current: EnergyGroup = start;
function Host() {
  const [root, setRoot] = useState(start);
  current = root;
  return <EnergyBlockCards root={root} onChange={setRoot} />;
}
const group = () => current.children[0] as EnergyGroup;
const target = () => (group().children[0] as EnergyInterval).target;
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => {
  fireEvent.change(input(label), { target: { value } });
  fireEvent.blur(input(label));
};

function open() {
  render(<Host />);
  fireEvent.click(screen.getByLabelText("Déplier"));
}

describe("cartes de blocs : saisie des allures", () => {
  it("l'allure basse se modifie, quelle que soit l'écriture", () => {
    open();
    type("Allure basse", "4.10");
    expect(target()).toMatchObject({ min_s_per_unit: 250, max_s_per_unit: 265 });
    expect(input("Allure basse").value).toBe("4'10");
    type("Allure basse", "4'05''");
    expect(target()).toMatchObject({ min_s_per_unit: 245, max_s_per_unit: 265 });
  });

  it("bornes tapées à l'envers : remises dans l'ordre", () => {
    open();
    type("Allure basse", "4'40");
    expect(target()).toMatchObject({ min_s_per_unit: 265, max_s_per_unit: 280 });
    expect(input("Allure basse").value).toBe("4'25");
    expect(input("Allure haute").value).toBe("4'40");
  });

  it("saisie illisible : le champ passe en rouge et garde le texte, rien n'est enregistré", () => {
    open();
    type("Allure haute", "4h25");
    expect(input("Allure haute").getAttribute("aria-invalid")).toBe("true");
    expect(input("Allure haute").value).toBe("4h25");
    expect(target()).toMatchObject({ min_s_per_unit: 255, max_s_per_unit: 265 });
    fireEvent.keyDown(input("Allure haute"), { key: "Escape" });
    expect(input("Allure haute").value).toBe("4'25");
  });

  it("répétitions : champ vidé puis retapé, jamais 0 ni 1 par erreur", () => {
    open();
    fireEvent.change(input("Répétitions"), { target: { value: "" } });
    expect(group().repeat).toBe(3);
    type("Répétitions", "8");
    expect(group().repeat).toBe(8);
    type("Répétitions", "0");
    expect(group().repeat).toBe(8);
  });
});
