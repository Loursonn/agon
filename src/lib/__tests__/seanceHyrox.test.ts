import { describe, expect, it } from "vitest";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import type { LapKind } from "@/lib/seance";
import { blockOf, doneValue, groupTotals, rhythmOf } from "@/lib/seanceHyrox";

const block = (ref: string, kind: ExpectedBlock["kind"], name: string, p: Partial<ExpectedBlock> = {}): ExpectedBlock => ({
  ref, kind, name, exerciseId: null, distanceM: null, reps: null, loadKg: null, durationS: null, ...p,
});

const lap = (ref: string | null, durationS: number, m: Partial<DetailLapWithMetrics["metrics"]> = {}, p: Partial<DetailLapWithMetrics> = {}) =>
  ({
    startS: 0, endS: durationS, name: null, plannedBlockRef: ref, reps: null, distanceOverrideM: null, loadKg: null,
    ...p,
    metrics: { durationS, distanceM: null, avgPaceSPerKm: null, avgHr: null, maxHr: null, ...m },
  }) as unknown as DetailLapWithMetrics;

const blocks = [
  block("run-1", "run", "Course", { distanceM: 1000 }),
  block("sled-1", "station", "Sled push", { distanceM: 25, loadKg: 102 }),
  block("wb-1", "station", "Wall balls", { reps: 20, loadKg: 6 }),
  block("run-2", "run", "Course", { distanceM: 1000 }),
  block("wb-2", "station", "Wall balls", { reps: 20, loadKg: 6 }),
];

describe("seanceHyrox", () => {
  it("blockOf retrouve le bloc prévu d'un tour, sinon null", () => {
    expect(blockOf({ plannedBlockRef: "wb-1" }, blocks)?.name).toBe("Wall balls");
    expect(blockOf({ plannedBlockRef: null }, blocks)).toBeNull();
    expect(blockOf({ plannedBlockRef: "x" }, null)).toBeNull();
  });

  it("doneValue : distance GPS en course, reps ou distance saisies en station, « — » si absent", () => {
    expect(doneValue(lap("run-1", 270, { distanceM: 1004 }), "run", blocks[0]).text).toBe("1,00 km");
    expect(doneValue(lap("run-1", 270), "run", blocks[0]).text).toBe("—");
    const wb = doneValue(lap("wb-1", 55, {}, { reps: 18 }), "station", blocks[2]);
    expect(wb).toMatchObject({ text: "18 reps", field: "reps", value: 18 });
    expect(doneValue(lap("wb-1", 55), "station", blocks[2]).value).toBe(20);
    expect(doneValue(lap("sled-1", 70), "station", blocks[1])).toMatchObject({ text: "25 m", field: "distanceOverrideM" });
    expect(doneValue(lap(null, 70), "station", null).text).toBe("—");
  });

  it("rhythmOf : allure en course, s/rep ou m/min en station", () => {
    expect(rhythmOf(lap("run-1", 276, { avgPaceSPerKm: 276 }), "run", blocks[0])).toBe("4'36 /km");
    expect(rhythmOf(lap("wb-1", 60), "station", blocks[2])).toBe("3,0 s/rep");
    expect(rhythmOf(lap("sled-1", 75), "station", blocks[1])).toBe("20,0 m/min");
    expect(rhythmOf(lap(null, 0), "station", null)).toBe("—");
  });

  it("groupTotals : une ligne par type, puis le total ; FC moyenne pondérée par la durée", () => {
    const laps = [
      lap("run-1", 300, { distanceM: 1000, avgHr: 160, maxHr: 170 }),
      lap("sled-1", 80, { avgHr: 175, maxHr: 180 }),
      lap("wb-1", 60, { avgHr: 170, maxHr: 176 }, { reps: 18 }),
      lap("run-2", 300, { distanceM: 1020, avgHr: 164, maxHr: 172 }),
      lap("wb-2", 60, { avgHr: null, maxHr: null }),
    ];
    const kinds: LapKind[] = ["run", "station", "station", "run", "station"];
    const names = ["Course 1", "Sled push", "Wall balls 1", "Course 2", "Wall balls 2"];
    const rows = groupTotals(laps, names, kinds, blocks);
    expect(rows.map((r) => r.label)).toEqual(["Course · 2 tours", "Sled push · 1", "Wall balls · 2", "Total"]);
    const run = rows[0];
    expect(run.planned).toBe("2 km");
    expect(run.done).toBe("2,02 km");
    expect(run.avgHr).toBe(162);
    expect(run.maxHr).toBe(172);
    const wb = rows[2];
    expect(wb.planned).toBe("40 reps");
    expect(wb.done).toBe("38 reps");
    expect(wb.avgHr).toBe(170); // le tour sans FC ne compte pas (jamais 0)
    expect(wb.load).toBe("6 kg");
    const total = rows[3];
    expect(total.durationS).toBe(800);
    expect(total.maxHr).toBe(180);
  });

  it("groupTotals ignore les repos et regroupe les transitions", () => {
    const laps = [lap(null, 30), lap(null, 45, { avgHr: 150 })];
    const rows = groupTotals(laps, ["Repos", "Roxzone"], ["rest", "transition"], null);
    expect(rows.map((r) => r.label)).toEqual(["Transitions · 1", "Total"]);
    expect(rows[1].durationS).toBe(75);
  });
});
