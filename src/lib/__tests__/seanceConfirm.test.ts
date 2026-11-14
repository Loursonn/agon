import { describe, expect, it } from "vitest";
import { confirmModel, joinFr } from "../seanceConfirm";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import type { LapKind } from "@/lib/seance";

const lap = (p: Partial<DetailLapWithMetrics>): DetailLapWithMetrics => ({
  startS: 0, endS: 1, name: null, exerciseId: null, plannedBlockRef: null, distanceOverrideM: null, reps: null, loadKg: null,
  origin: "agon_proposal", status: "proposed", needsReview: false,
  metrics: { distanceM: null } as DetailLapWithMetrics["metrics"], ...p,
});
const block = (ref: string, p: Partial<ExpectedBlock>): ExpectedBlock => ({
  ref, kind: "station", name: ref, exerciseId: null, distanceM: null, reps: null, loadKg: null, durationS: null, ...p,
});

const blocks = [
  block("run", { kind: "run", distanceM: 500 }),
  block("sled", { distanceM: 15, loadKg: 102 }),
  block("wb", { reps: 10, loadKg: 6 }),
];
const laps = [
  lap({ plannedBlockRef: "run", metrics: { distanceM: 498 } as never }),
  lap({ plannedBlockRef: "sled" }),
  lap({ plannedBlockRef: "run", metrics: { distanceM: 502 } as never }),
  lap({ plannedBlockRef: "wb", reps: 9 }),
];
const kinds: LapKind[] = ["run", "station", "run", "station"];
const names = ["Course 1", "Sled push 1", "Course 2", "Wall balls 1"];

describe("confirmModel", () => {
  it("courses en une ligne, prévu → fait, charge, à corriger", () => {
    const m = confirmModel(laps, names, kinds, blocks);
    expect(m.runLabel).toBe("2 × course 500 m");
    expect(m.runDetail).toBe("1,00 km · montre");
    expect(m.stations.map((s) => [s.name, s.plannedText, s.done, s.loadKg, s.differs])).toEqual([
      ["Sled push 1", "15 m", 15, 102, false],
      ["Wall balls 1", "10", 9, 6, true],
    ]);
  });

  it("replie les stations conformes quand une autre demande l'attention", () => {
    const m = confirmModel(laps, names, kinds, blocks);
    expect(m.stations.map((s) => s.folded)).toEqual([true, false]);
    expect(m.foldedLabel).toBe("Station Sled push 1 : conforme au prévu ✓");
  });

  it("tout est conforme : rien n'est replié", () => {
    const ok = laps.map((l, i) => (i === 3 ? { ...l, reps: 10 } : l));
    const m = confirmModel(ok, names, kinds, blocks);
    expect(m.stations.every((s) => !s.folded)).toBe(true);
    expect(m.foldedLabel).toBeNull();
  });

  it("une station commentée reste dépliée", () => {
    const c = laps.map((l, i) => (i === 1 ? { ...l, comment: " Poignées glissantes " } : l));
    const m = confirmModel(c, names, kinds, blocks);
    expect(m.stations[0]).toMatchObject({ comment: "Poignées glissantes", folded: false });
  });

  it("joinFr", () => {
    expect(joinFr(["1"])).toBe("1");
    expect(joinFr(["1", "2"])).toBe("1 et 2");
    expect(joinFr(["1", "2", "3"])).toBe("1, 2 et 3");
  });
});
