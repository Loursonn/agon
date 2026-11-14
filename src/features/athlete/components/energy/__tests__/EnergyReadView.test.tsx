// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EnergyReadView } from "../EnergyReadView";
import type { EnergyGroup, EnergyInterval, EnergySessionRow, EnergyStep, EnergyTarget } from "@/types/energy";

const iv = (id: string, role: EnergyInterval["role"], duration: EnergyInterval["duration"], target: EnergyTarget = { kind: "none" }, notes?: string): EnergyInterval =>
  ({ type: "interval", id, role, duration, target, ...(notes ? { notes } : {}) });
const group = (id: string, repeat: number, children: EnergyStep[], rest?: EnergyInterval): EnergyGroup =>
  ({ type: "group", id, role: "work", repeat, children, ...(rest ? { rest_between: rest } : {}) });

// Planche EnergieTelCas, cas 04 (groupe dans un groupe) et 05 (vélo en watts).
const intervals: EnergyStep[] = [
  group("series", 2, [
    group("reps", 4,
      [iv("200", "work", { kind: "distance", value: 200 }, { kind: "pace", min_s_per_unit: 210, max_s_per_unit: 210, unit: "min_per_km" })],
      iv("r", "recovery", { kind: "time", value: 45 }, { kind: "none" }, "marche")),
  ], iv("rs", "recovery", { kind: "time", value: 180 })),
  iv("velo", "work", { kind: "time", value: 480 }, { kind: "power", min: 230, max: 230 }),
  iv("fc", "work", { kind: "time", value: 600 }, { kind: "hr_zone", zone: 2 }),
];

const session = { id: "s1", name: "Cas particuliers", session_kind: "energie", intervals } as unknown as EnergySessionRow;
const noop = vi.fn();

function renderView(hrZones?: number | null) {
  return render(
    <EnergyReadView session={session} refs={{ FTP: 250 }} hrZones={hrZones} onClose={noop} onStart={noop} onNote={noop} onDetail={noop} />,
  );
}

describe("EnergyReadView, lecture", () => {
  it("groupe dans un groupe : séries en tête, répétitions en retrait avec leur cible", () => {
    renderView();
    expect(screen.getByText("2 séries")).toBeTruthy();
    expect(screen.getByText("3 min entre les séries")).toBeTruthy();
    expect(screen.getByText("4 × 200 m")).toBeTruthy();
    expect(screen.getByText("récup 45 s marche")).toBeTruthy();
    expect(screen.getByText("3:30")).toBeTruthy();
  });

  it("échelle Z1–Z5 sous le bloc en watts, Z1–Z3 sous la FC si le coach a 3 zones", () => {
    renderView(3);
    const scales = screen.getAllByRole("img", { name: /Échelle de/ });
    expect(scales.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Échelle de 5 zones, zone 4 visée",
      "Échelle de 3 zones, zone 2 visée",
    ]);
    expect(within(scales[0]).getByText("Z5")).toBeTruthy();
    expect(within(scales[1]).queryByText("Z4")).toBeNull();
  });

  it("pas d'échelle pour un bloc à l'allure", () => {
    render(
      <EnergyReadView
        session={{ ...session, intervals: [intervals[0]] } as EnergySessionRow}
        refs={null} onClose={noop} onStart={noop} onNote={noop} onDetail={noop}
      />,
    );
    expect(screen.queryByRole("img", { name: /Échelle de/ })).toBeNull();
  });
});
