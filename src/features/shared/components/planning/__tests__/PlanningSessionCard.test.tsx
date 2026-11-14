import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DoneActivity, PlannedItem } from "@/lib/plannedVsDone";
import { freeCard, plannedCard } from "@/lib/planningCard";
import { PlanningSessionCard } from "../PlanningSessionCard";

const NOW = Date.parse("2026-11-10T19:30:00Z");
const act = (p: Partial<DoneActivity> = {}): DoneActivity => ({
  id: "a1", date: "2026-11-10", startedAt: "2026-11-10T17:34:00Z", source: "garmin", sport: "running",
  distanceM: 7400, durationS: 2890, deviceName: "Forerunner 265", zoneShares: [20, 60, 20],
  avgPaceSPerKm: 390, avgHr: 152, hasStream: true, ...p,
});
const planned = (p: Partial<PlannedItem> = {}): PlannedItem => ({
  kind: "energy", id: "e1", date: "2026-11-10", label: "Fractionné 2 × 1 000 m", status: "planned",
  activity: null, linkId: null, linkStatus: null, done: false, rpe: null, ...p,
});

describe("PlanningSessionCard", () => {
  it("à confirmer : attribution Garmin, deux boutons, le clic sur un bouton n'ouvre pas la séance", () => {
    const onOpen = vi.fn(); const onConfirm = vi.fn(); const onReject = vi.fn();
    const card = plannedCard(planned({ activity: act(), linkId: "l1", linkStatus: "auto" }), NOW);
    render(<PlanningSessionCard card={card} onOpen={onOpen} onConfirm={onConfirm} onReject={onReject} />);
    expect(screen.getByText("À confirmer")).toBeTruthy();
    expect(screen.getByText("Garmin Forerunner 265")).toBeTruthy();
    fireEvent.click(screen.getByText("C’est bien cette séance"));
    fireEvent.click(screen.getByText("Ce n’est pas cette séance"));
    expect(onConfirm).toHaveBeenCalledWith("l1");
    expect(onReject).toHaveBeenCalledWith("l1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("réalisée : pastille, barre des zones, clic → onglet Séance", () => {
    const onOpen = vi.fn();
    const card = plannedCard(planned({ activity: act(), linkId: "l1", linkStatus: "confirmed" }), NOW);
    render(<PlanningSessionCard card={card} onOpen={onOpen} />);
    expect(screen.getByText("Réalisée")).toBeTruthy();
    expect(screen.getByLabelText("Temps par zone")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir la séance/ }));
    expect(onOpen).toHaveBeenCalledWith("a1");
  });

  it("synchro en cours : pas de bouton, pas d'ouverture", () => {
    const card = plannedCard(planned({ activity: act({ hasStream: false }), linkId: "l1", linkStatus: "auto" }), NOW);
    render(<PlanningSessionCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByText("Synchro en cours…")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("colonne étroite : la source se réduit à la marque", () => {
    const card = plannedCard(planned({ activity: act(), linkId: "l1", linkStatus: "confirmed" }), NOW);
    render(<PlanningSessionCard card={card} narrow />);
    expect(screen.getByText("Garmin")).toBeTruthy();
    expect(screen.queryByText("Garmin Forerunner 265")).toBeNull();
  });

  it("séance libre : associer à une séance prévue du jour", () => {
    const onAssociate = vi.fn();
    render(
      <PlanningSessionCard
        card={freeCard(act({ id: "a2" }), NOW)}
        associable={[{ kind: "energy", id: "e1", label: "Fractionné 2 × 1 000 m" }]}
        onAssociate={onAssociate}
      />,
    );
    fireEvent.click(screen.getByText("Associer à une séance prévue"));
    fireEvent.click(screen.getByText("Fractionné 2 × 1 000 m"));
    expect(onAssociate).toHaveBeenCalledWith("a2", { kind: "energy", id: "e1", label: "Fractionné 2 × 1 000 m" });
  });
});
