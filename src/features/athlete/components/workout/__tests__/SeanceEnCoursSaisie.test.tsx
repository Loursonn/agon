// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RirAfterSetSheet } from "../RirAfterSetSheet";
import { NumPad } from "@/features/athlete/components/workout-detail/NumPad";
import { InlineRestStrip } from "@/features/athlete/components/workout-detail/InlineRestStrip";
import { SetRow } from "@/features/athlete/components/workout-detail/SetRow";

describe("fenêtre RIR après une série (planche SeanceEnCours, écran 03)", () => {
  it("propose 0 à 4+ au demi-point, marque le RIR visé et enregistre d'une tape", () => {
    const onPick = vi.fn();
    render(<RirAfterSetSheet setNumber={2} target="2" summary="70 kg × 6" restLeft={88} onPick={onPick} onSkip={() => {}} />);
    expect(screen.getByText("RIR · série 2")).toBeTruthy();
    expect(screen.getByText("Récup 1:28")).toBeTruthy();
    expect(screen.getByText("70 kg × 6 · visé RIR 2")).toBeTruthy();
    const keys = ["0", "0,5", "1", "1,5", "2", "2,5", "3", "3,5", "4+"];
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter(Boolean);
    expect(names).toEqual(keys.map((k) => (k === "2" ? "RIR 2, visé" : `RIR ${k}`)));
    expect(screen.getByRole("button", { name: "RIR 2, visé" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RIR 1,5" }));
    expect(onPick).toHaveBeenCalledWith("1.5");
  });
});

describe("pavé maison de la charge (écran 02)", () => {
  it("affiche la série, les raccourcis Prescrit / Préc. et « OK · reps »", () => {
    const onChange = vi.fn();
    render(
      <NumPad
        target={{ exId: "e", setIdx: 1, field: "kg", chargeUnit: "kg", noAuto: true, thenReps: "6" }}
        value="70"
        onChange={onChange}
        onConfirm={() => {}}
        onClose={() => {}}
        presets={[
          { label: "Prescrit", value: "70", tone: "ac" },
          { label: "Préc.", value: "67,5", tone: "neutral" },
          { label: "+2,5", value: "72,5", tone: "green" },
          { label: "+5", value: "75", tone: "green" },
        ]}
        confirmLabel="OK · reps"
      />,
    );
    expect(screen.getByText("Charge · S2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "OK · reps" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Préc\./ }));
    expect(onChange).toHaveBeenCalledWith("67,5");
  });
});

describe("carte de récup entre deux séries (écran 04)", () => {
  it("montre la suite, le compte à rebours et ±15 s", () => {
    const onAdjust = vi.fn();
    const onStop = vi.fn();
    render(
      <InlineRestStrip myKey="k" seconds={90} label="repos" activeKey="k" left={84} total={90}
        onStart={() => {}} onStop={onStop} onAdjust={onAdjust} canEdit next="série 3 · 70 kg × 6" />,
    );
    expect(screen.getByRole("timer", { name: "Récup : 1:24" })).toBeTruthy();
    expect(screen.getByText("série 3 · 70 kg × 6")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+15 s" }));
    expect(onAdjust).toHaveBeenCalledWith(15);
    fireEvent.click(screen.getByRole("button", { name: "Passer" }));
    expect(onStop).toHaveBeenCalled();
  });
});

describe("ligne de série", () => {
  it("écrit les décimales à la française", () => {
    render(
      <SetRow setIdx={0} state={{ kg: "57.5", reps: "8", rir: "1.5", done: true, skipped: false } as never}
        prevStr="57,5×8" chargeUnit="kg" onToggle={() => {}} onOpenPad={() => {}} isCompleted={false} />,
    );
    expect(screen.getByText("57,5")).toBeTruthy();
    expect(screen.getByText("1,5")).toBeTruthy();
    expect(screen.getByText("57,5 × 8")).toBeTruthy();
  });
});
