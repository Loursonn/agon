// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EnergyRunScreen } from "../EnergyRunScreen";
import type { EnergyStep } from "@/types/energy";

// Planche EnergieTel (écrans 03-04) : 2 × (5 × 400 m, récup 1 min 30 s trot).
const steps = [
  { id: "s", role: "work", type: "group", repeat: 2, children: [
    { id: "g", role: "work", type: "group", repeat: 5, children: [
      { id: "r", role: "work", type: "interval", target: { kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 95 }, duration: { kind: "distance", value: 400 } },
      { id: "rc", role: "recovery", type: "interval", duration: { kind: "time", value: 90 }, notes: "trot" },
    ] },
  ] },
] as unknown as EnergyStep[];

describe("minuteur « Pendant »", () => {
  it("effort : nom de la séance, série / répétition, bouton « 400 m fait », suite en récup", () => {
    render(<EnergyRunScreen title="Fractionné VMA" steps={steps} refs={{ VMA: 16 }} onExit={() => {}} />);
    expect(screen.getByText("Fractionné VMA")).toBeTruthy();
    expect(screen.getByText(/Répétition/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /400 m fait/ })).toBeTruthy();
    expect(screen.getByText("Ensuite")).toBeTruthy();
    expect(screen.getByText("puis 2 / 5")).toBeTruthy();
  });

  it("récup : pastille « Récup · trot », prochaine répétition en grand, « Terminer »", () => {
    render(<EnergyRunScreen title="Fractionné VMA" steps={steps} refs={{ VMA: 16 }} onExit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /400 m fait/ }));
    expect(screen.getByText("Récup · trot")).toBeTruthy();
    expect(screen.getByText("Prochaine · 2 / 5")).toBeTruthy();
    expect(screen.getByText("sur 1 min 30 s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Terminer" })).toBeTruthy();
  });
});
