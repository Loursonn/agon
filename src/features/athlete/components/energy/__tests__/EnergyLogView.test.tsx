// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { EnergyLogView } from "../EnergyLogView";
import type { BlockLogs, EnergyInterval, EnergySessionRow, EnergyStep, EnergyTarget } from "@/types/energy";
import type { RunDistanceValue } from "@/features/shared/components/runDistance";

const iv = (id: string, s: number, target: EnergyTarget): EnergyInterval =>
  ({ type: "interval", id, role: "work", duration: { kind: "time", value: s }, target });

const z1z2 = {
  id: "s1", name: "Z1/Z2", session_kind: "footing", total_duration_s: 3600, total_distance_m: null,
  intervals: [iv("a", 1200, { kind: "hr_zone", zone: 1 }), iv("b", 2400, { kind: "hr_zone", zone: 2 })] as EnergyStep[],
} as unknown as EnergySessionRow;

const footing = {
  ...z1z2, id: "s2", name: "Footing 45 min", total_duration_s: 2700,
  intervals: [iv("f", 2700, { kind: "hr_zone", zone: 2 })] as EnergyStep[],
} as unknown as EnergySessionRow;

function Harness({ session, onValidate, initialBlocks }: { session: EnergySessionRow; onValidate: (b: BlockLogs, d: string) => void; initialBlocks: BlockLogs }) {
  const [blocks, setBlocks] = useState<BlockLogs>(initialBlocks);
  const [duration, setDuration] = useState("60");
  const [runDist, setRunDist] = useState<RunDistanceValue>({ activity: "course", km: "" });
  const [note, setNote] = useState("");
  return (
    <EnergyLogView
      session={session} refs={null} blocks={blocks} onBlocks={setBlocks}
      duration={duration} onDuration={setDuration} durationHint="Prévu 60 min"
      runDist={runDist} onRunDist={setRunDist} note={note} onNote={setNote}
      pending={false} onBack={vi.fn()} onClose={vi.fn()} onValidate={() => onValidate(blocks, duration)}
    />
  );
}

const allDone: BlockLogs = { a: { done: true, note: "" }, b: { done: true, note: "" } };

describe("EnergyLogView", () => {
  it("nomme les blocs par leur contenu, plus de « Bloc 1 »", () => {
    render(<Harness session={z1z2} initialBlocks={allDone} onValidate={vi.fn()} />);
    expect(screen.getByText("20 min à Z1")).toBeTruthy();
    expect(screen.getByText("40 min à Z2")).toBeTruthy();
    expect(screen.queryByText(/Bloc 1/)).toBeNull();
    expect(screen.getAllByRole("checkbox").every((c) => c.getAttribute("aria-checked") === "true")).toBe(true);
  });

  it("valider n'est jamais grisé faute de case : un bloc décoché part comme non fait", () => {
    const onValidate = vi.fn();
    render(<Harness session={z1z2} initialBlocks={allDone} onValidate={onValidate} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /40 min à Z2/ }));
    expect(screen.getByText("Pas fait")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Valider la séance" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onValidate).toHaveBeenCalledWith({ a: { done: true, note: "" }, b: { done: false, note: "" } }, "60");
  });

  it("la note d'un bloc est repliée derrière « + note »", () => {
    const onValidate = vi.fn();
    render(<Harness session={z1z2} initialBlocks={allDone} onValidate={onValidate} />);
    expect(screen.queryByLabelText("Note sur 20 min à Z1")).toBeNull();
    fireEvent.click(screen.getAllByText("+ note")[0]);
    fireEvent.change(screen.getByLabelText("Note sur 20 min à Z1"), { target: { value: "facile" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider la séance" }));
    expect(onValidate.mock.calls[0][0].a).toEqual({ done: true, note: "facile" });
  });

  it("durée réelle : ± 5 min", () => {
    const onValidate = vi.fn();
    render(<Harness session={z1z2} initialBlocks={allDone} onValidate={onValidate} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter 5 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: "Valider la séance" }));
    expect(onValidate.mock.calls[0][1]).toBe("65");
  });

  it("séance à un bloc : rien à cocher", () => {
    render(<Harness session={footing} initialBlocks={{}} onValidate={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/Prévu · 45 min/)).toBeTruthy();
  });
});
