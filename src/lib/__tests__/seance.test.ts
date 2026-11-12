import { describe, expect, it } from "vitest";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import {
  DASH, areaPath, cutLapAt, displayLapNames, fmtClock, fmtDayLong, fmtKm, fmtMinSec, fmtPace, fmtPaceOrSpeed, fmtSpeedFromPace, fmtUpDown,
  lapIndexAt, lapKind, linePath, mergeWithNext, moveBoundary, nearestIndex, niceTicks, paceSeries, parseClock,
  plannedLabel, robustDomain, setLapBounds, stationRhythm, summarizeBlocks, xAxisValues, zoneColor, zoneRuns,
  ZONE_COLORS_3,
} from "@/lib/seance";

describe("formats", () => {
  it("durées, allures, distances ; absent → « — », jamais 0", () => {
    expect(fmtClock(2890)).toBe("48:10");
    expect(fmtClock(3725)).toBe("1:02:05");
    expect(fmtClock(null)).toBe(DASH);
    expect(fmtPace(390)).toBe("6'30");
    expect(fmtPace(0)).toBe(DASH);
    expect(fmtPace(null)).toBe(DASH);
    expect(fmtKm(7400)).toBe("7,4");
    expect(fmtKm(2310, 2)).toBe("2,31");
    expect(fmtKm(undefined)).toBe(DASH);
    expect(fmtMinSec(1533)).toBe("25 min 33 s");
    expect(fmtUpDown(18, 17)).toBe("18 / 17");
    expect(fmtUpDown(null, null)).toBe(DASH);
    expect(fmtDayLong("2026-11-10")).toBe("mardi 10 novembre");
  });

  it("lit un temps tapé", () => {
    expect(parseClock("20:30")).toBe(1230);
    expect(parseClock("1:02:05")).toBe(3725);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("2'30")).toBeNull();
  });
});

describe("zones", () => {
  it("3 couleurs fixes, gris sans zone", () => {
    expect(zoneColor(1)).toBe(ZONE_COLORS_3[0]);
    expect(zoneColor(3)).toBe(ZONE_COLORS_3[2]);
    expect(ZONE_COLORS_3).toEqual(["#66F03C", "#FF9500", "#FF3B1F"]);
    expect(zoneColor(null)).toBe("#8E8780");
  });

  it("5 et 7 zones : du froid au chaud", () => {
    expect([1, 2, 3, 4, 5].map((z) => zoneColor(z, 5))).toEqual(["#33B5FF", "#66F03C", "#FFC933", "#FF9500", "#FF3B1F"]);
    expect([1, 2, 3, 4, 5, 6, 7].map((z) => zoneColor(z, 7))).toEqual(
      ["#33B5FF", "#2EE6C5", "#66F03C", "#FFC933", "#FF9500", "#FF3B1F", "#F060C0"],
    );
  });

  it("regroupe les points consécutifs de même zone", () => {
    expect(zoneRuns([1, 1, 2, 2, 2, null, 3])).toEqual([
      { from: 0, to: 1, zone: 1 },
      { from: 2, to: 4, zone: 2 },
      { from: 5, to: 5, zone: null },
      { from: 6, to: 6, zone: 3 },
    ]);
    expect(zoneRuns(null)).toEqual([]);
  });
});

describe("graphique", () => {
  it("allure : coupée à l'arrêt et dans les stations", () => {
    const p = paceSeries([4, 0.2, null, 4, 4], [0, 1, 2, 3, 4], [{ startS: 4, endS: 10 }]);
    expect(p).toEqual([250, null, null, 250, null]);
  });

  it("chemin coupé sur les valeurs absentes", () => {
    const d = linePath([0, 1, 2, 3], [1, null, 3, 4], (x) => x * 10, (y) => y);
    expect(d).toBe("M0.0,1.0M20.0,3.0L30.0,4.0");
  });

  it("aire fermée sur la ligne de base", () => {
    expect(areaPath([0, 1], [5, 6], (x) => x, (y) => y, 100)).toBe("M0.0,100L0.0,5.0L1.0,6.0L1.0,100Z");
  });

  it("point le plus proche, domaine robuste, graduations", () => {
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 16)).toBe(2);
    const dom = robustDomain([...Array.from({ length: 99 }, (_, i) => 100 + i), 500], { pad: 0 })!;
    expect(dom[1]).toBeLessThan(500);
    expect(robustDomain([null, null])).toBeNull();
    expect(niceTicks(0, 2890, 5)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  it("axe distance : monotone, trous comblés ; sans distance → temps", () => {
    expect(xAxisValues({ t: [0, 1, 2], dist: [0, null, 5] }, "distance")).toEqual([0, 0, 5]);
    expect(xAxisValues({ t: [0, 1, 2], dist: null }, "distance")).toEqual([0, 1, 2]);
  });
});

const block = (over: Partial<ExpectedBlock>): ExpectedBlock => ({
  ref: "r", kind: "station", name: "Wall balls", exerciseId: null, distanceM: null, reps: null, loadKg: null, durationS: null, ...over,
});

describe("tours", () => {
  it("numérote les noms répétés", () => {
    expect(displayLapNames([{ name: "Course" }, { name: "Sled push" }, { name: "Course" }, { name: null }, { name: "1 000 m n°1" }]))
      .toEqual(["Course 1", "Sled push", "Course 2", "Tour 4", "1 000 m n°1"]);
  });

  it("nature d'un tour : bloc prévu, sinon nom", () => {
    const blocks = [block({ ref: "a", kind: "run", name: "Course" }), block({ ref: "b" })];
    expect(lapKind({ name: "x", plannedBlockRef: "a" }, blocks)).toBe("run");
    expect(lapKind({ name: "x", plannedBlockRef: "b" }, blocks)).toBe("station");
    expect(lapKind({ name: "Transition", plannedBlockRef: "b" }, blocks)).toBe("transition");
    expect(lapKind({ name: "Récup", plannedBlockRef: null }, null)).toBe("rest");
    expect(lapKind({ name: null, plannedBlockRef: null }, null)).toBe("run");
  });

  it("prévu et rythme des stations", () => {
    expect(plannedLabel(block({ reps: 10 }))).toBe("10 reps");
    expect(plannedLabel(block({ kind: "run", distanceM: 500 }))).toBe("500 m");
    expect(plannedLabel(null)).toBe(DASH);
    expect(stationRhythm(38, 15, null)).toBe("23,7 m/min");
    expect(stationRhythm(32, null, 10)).toBe("3,2 s/rep");
    expect(stationRhythm(30, null, null)).toBeNull();
  });

  it("résume une séance répétée", () => {
    const one = [
      block({ kind: "run", name: "Course", distanceM: 500 }),
      block({ name: "Sled push 15 m", distanceM: 15 }),
      block({ name: "Wall balls", reps: 10 }),
    ];
    expect(summarizeBlocks([...one, ...one, ...one, ...one])).toBe("4 × (500 m course + 15 m sled push + 10 wall balls)");
    expect(summarizeBlocks(null)).toBeNull();
  });

  const laps = [
    { startS: 0, endS: 100, name: "A" },
    { startS: 100, endS: 200, name: "B" },
  ];

  it("couper, fusionner, déplacer", () => {
    const cut = cutLapAt(laps, 150, (h, part) => ({ ...h, name: part ? null : h.name }));
    expect(cut.map((l) => [l.startS, l.endS, l.name])).toEqual([[0, 100, "A"], [100, 150, "B"], [150, 200, null]]);
    expect(cutLapAt(laps, 101, (h) => h)).toHaveLength(2);
    expect(mergeWithNext(laps, 0)).toEqual([{ startS: 0, endS: 200, name: "A" }]);
    expect(mergeWithNext(laps, 1)).toHaveLength(2);
    expect(moveBoundary(laps, 0, 250).map((l) => [l.startS, l.endS])).toEqual([[0, 199], [199, 200]]);
    expect(setLapBounds(cut, 1, 90, 160).map((l) => [l.startS, l.endS])).toEqual([[0, 90], [90, 160], [160, 200]]);
    expect(lapIndexAt(laps, 100)).toBe(1);
    expect(lapIndexAt(laps, 500)).toBe(1);
  });
});

describe("fmtSpeedFromPace / fmtPaceOrSpeed", () => {
  it("convertit une allure en km/h, « — » si absente", () => {
    expect(fmtSpeedFromPace(120)).toBe("30,0");
    expect(fmtSpeedFromPace(null)).toBe("—");
    expect(fmtSpeedFromPace(0)).toBe("—");
    expect(fmtPaceOrSpeed(276, false)).toBe("4'36");
    expect(fmtPaceOrSpeed(144, true)).toBe("25,0");
  });
});
