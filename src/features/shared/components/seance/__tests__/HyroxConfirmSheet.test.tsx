// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HyroxConfirmSheet } from "../HyroxConfirmSheet";
import { SeanceLapsMobile } from "../SeanceLapsMobile";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import type { LapKind } from "@/lib/seance";

const metrics = { durationS: 60, distanceM: null, avgHr: null, maxHr: null, meanZone: null } as unknown as DetailLapWithMetrics["metrics"];
const lap = (p: Partial<DetailLapWithMetrics>): DetailLapWithMetrics => ({
  startS: 0, endS: 60, name: null, exerciseId: null, plannedBlockRef: null, distanceOverrideM: null, reps: null, loadKg: null,
  origin: "agon_proposal", status: "proposed", needsReview: false, metrics, ...p,
});
const blocks: ExpectedBlock[] = [
  { ref: "sled", kind: "station", name: "Sled push", exerciseId: null, distanceM: 15, reps: null, loadKg: 102, durationS: null },
  { ref: "wb", kind: "station", name: "Wall balls", exerciseId: null, distanceM: null, reps: 10, loadKg: 6, durationS: null },
];
const laps = [lap({ plannedBlockRef: "sled", name: "Sled push" }), lap({ plannedBlockRef: "wb", name: "Wall balls" })];
const kinds: LapKind[] = ["station", "station"];
const names = ["Sled push", "Wall balls"];

describe("HyroxConfirmSheet", () => {
  it("corrige les reps, laisse un mot, valide avec les corrections", () => {
    const onValidate = vi.fn();
    render(<HyroxConfirmSheet laps={laps} names={names} kinds={kinds} blocks={blocks} device="montre" saving={false} onClose={() => {}} onValidate={onValidate} />);
    const reps = screen.getByLabelText("Wall balls : fait");
    fireEvent.change(reps, { target: { value: "9" } });
    fireEvent.blur(reps);
    expect(screen.getByText("À corriger")).toBeTruthy();
    fireEvent.click(screen.getAllByText("+ Commentaire")[0]);
    const ta = screen.getByLabelText("Sled push : commentaire");
    fireEvent.change(ta, { target: { value: "  Poignées glissantes " } });
    fireEvent.blur(ta);
    expect(screen.getByText("« Poignées glissantes »")).toBeTruthy();
    fireEvent.click(screen.getByText("Valider la séance"));
    expect(onValidate).toHaveBeenCalledWith({ 0: { comment: "Poignées glissantes" }, 1: { reps: 9 } });
  });
});

describe("SeanceLapsMobile", () => {
  it("montre le commentaire d'une station", () => {
    render(<SeanceLapsMobile laps={[laps[0], { ...laps[1], comment: "J'ai lâché 2 fois" }]} names={names} kinds={kinds} blocks={blocks} hyrox zonesN={3} open={null} onOpen={() => {}} />);
    expect(screen.getByText("« J'ai lâché 2 fois »")).toBeTruthy();
  });
});
