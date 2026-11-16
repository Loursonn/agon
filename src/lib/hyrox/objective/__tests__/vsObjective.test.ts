import { describe, expect, it } from "vitest";
import { objectiveFromRun } from "../model";
import { raceVsObjective, segmentTolerance, stateOf } from "../vsObjective";
import { race } from "./fixtures";

const obj = objectiveFromRun("men", 300)!.segments;

describe("tolérance", () => {
  it("2 % de la cible, au moins 3 s", () => {
    expect(segmentTolerance(300)).toBe(6);
    expect(segmentTolerance(125)).toBe(3);
  });
  it("états : en avance, dans l'objectif, en retard ; run 1 en avance = départ rapide", () => {
    expect(stateOf(-7, 6)).toBe("ahead");
    expect(stateOf(-6, 6)).toBe("on");
    expect(stateOf(7, 6)).toBe("behind");
    expect(stateOf(-18, 6, "run_1")).toBe("fast_start");
  });
});

describe("course contre l'objectif", () => {
  it("course pile sur l'objectif : tout dans l'objectif, courbe à 0", () => {
    const v = raceVsObjective(race(), obj);
    expect(v.total).toMatchObject({ targetS: 4985, actualS: 4985, deltaS: 0, state: "on" });
    expect(v.segments.every((s) => s.state === "on" && s.deltaS === 0)).toBe(true);
    expect(v.cumulative).toHaveLength(16);
    expect(v.cumulative.every((p) => p.deltaS === 0)).toBe(true);
  });
  it("écarts en secondes et états par segment", () => {
    const v = raceVsObjective(race({ run_1_s: 252, ski_s: 260, roxzone_total_s: 444 }), obj);
    const at = (k: string) => v.segments.find((s) => s.key === k)!;
    expect(at("run_1")).toMatchObject({ deltaS: -18, state: "fast_start" });
    expect(at("ski")).toMatchObject({ deltaS: -10, state: "ahead" });
    expect(at("roxzone_total")).toMatchObject({ deltaS: 44, state: "behind" });
    expect(v.total.deltaS).toBe(16);
    expect(v.total.state).toBe("on"); // ±50 s sur 1:23:05
    // Après le run 1 : −18 s de run, + 5,5 s de Roxzone (44 / 8) = −12,5.
    expect(v.cumulative[0]).toEqual({ key: "run_1", deltaS: -12 });
    expect(v.cumulative[v.cumulative.length - 1].deltaS).toBe(16);
  });
  it("segment absent : « — » (null), pas de courbe", () => {
    const v = raceVsObjective(race({ bbj_s: null, total_s: 4985 }), obj);
    expect(v.segments.find((s) => s.key === "bbj")).toMatchObject({ actualS: null, deltaS: null, state: null });
    expect(v.cumulative).toEqual([]);
  });
});
