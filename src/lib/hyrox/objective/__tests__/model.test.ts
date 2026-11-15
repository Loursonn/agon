import { describe, expect, it } from "vitest";
import { GRID_DIVISIONS, OBJECTIVE_GRID_V1 } from "../gridData";
import { editTarget, lineAt, objectiveForTotal, objectiveFromRun, raceObjective, raceRunAvg, runRange } from "../model";
import { planTotal } from "../../racePlan";
import { ON_TARGET, race } from "./fixtures";

describe("grille obj@1", () => {
  it("7 divisions, paliers croissants de 30 s/km, 8 stations et 8 coefficients", () => {
    for (const d of GRID_DIVISIONS) {
      const rows = OBJECTIVE_GRID_V1[d];
      expect(rows.length).toBeGreaterThanOrEqual(7);
      rows.forEach((r, i) => {
        expect(r.stations).toHaveLength(8);
        expect(r.shape).toHaveLength(8);
        if (i > 0) expect(r.run - rows[i - 1].run).toBe(30);
      });
    }
  });
  it("le chrono croît avec le run moyen dans chaque division", () => {
    for (const d of GRID_DIVISIONS) {
      const { min, max } = runRange(d)!;
      let prev = 0;
      for (let r = min; r <= max; r += 5) {
        const o = objectiveFromRun(d, r)!;
        expect(o.totalS).toBeGreaterThan(prev);
        prev = o.totalS;
      }
    }
  });
});

describe("objectif depuis le run", () => {
  it("Open hommes à 5:00 /km : l'exemple du document (1:23:05)", () => {
    const o = objectiveFromRun("men", 300)!;
    expect(o.totalS).toBe(4985);
    expect(o.estimate).toBe(false);
    expect(o.modelVersion).toBe("obj@1");
    expect(o.segments.ski).toBe(270);
    expect(o.segments.wall_balls).toBe(405);
    expect(o.segments.roxzone_total).toBe(400);
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => o.segments[`run_${i}` as "run_1"]);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(2400);
    expect(runs).toEqual([270, 282, 303, 300, 309, 303, 303, 330]);
  });
  it("interpole entre deux paliers", () => {
    expect(objectiveFromRun("men", 315)!.segments.ski).toBe(275);
    expect(lineAt(OBJECTIVE_GRID_V1.men, 315)!.estimate).toBe(false);
  });
  it("prolonge la pente sur 30 s/km au plus, puis refuse", () => {
    expect(objectiveFromRun("men", 490)!.estimate).toBe(true);
    expect(objectiveFromRun("men", 180)!.estimate).toBe(true);
    expect(objectiveFromRun("men", 520)).toBeNull();
    expect(objectiveFromRun("men", 170)).toBeNull();
  });
  it("relais : hors champ ; Pro doubles : doubles × écart Pro, estimé", () => {
    expect(objectiveFromRun("relay_men", 300)).toBeNull();
    const pro = objectiveFromRun("doubles_men_pro", 300)!;
    const dbl = objectiveFromRun("doubles_men", 300)!;
    expect(pro.estimate).toBe(true);
    expect(pro.segments.sled_push).toBeGreaterThan(dbl.segments.sled_push);
  });
});

describe("objectif depuis un chrono visé", () => {
  it("retrouve le run moyen, chrono exact", () => {
    const o = objectiveForTotal("men", 4985)!;
    expect(Math.abs(o.runAvgS - 300)).toBeLessThan(0.6);
    expect(o.totalS).toBe(4985);
    expect(planTotal(o.segments)).toBe(4985);
  });
  it("exemple d'Hugo : 1:27:49 en Open hommes → run ≈ 5:18, SkiErg ≈ 4:36", () => {
    const o = objectiveForTotal("men", 5269)!;
    expect(o.runAvgS).toBeGreaterThan(315);
    expect(o.runAvgS).toBeLessThan(321);
    expect(o.segments.ski).toBeGreaterThanOrEqual(275);
    expect(o.segments.ski).toBeLessThanOrEqual(277);
  });
  it("hors des données : null", () => {
    expect(objectiveForTotal("men", 2000)).toBeNull();
    expect(objectiveForTotal("men", 20000)).toBeNull();
  });
});

describe("objectif d'une course", () => {
  it("sans plan : le run du jour", () => {
    const r = race();
    expect(raceRunAvg(r)).toBe(300);
    const o = raceObjective(r, null)!;
    expect(o.source).toBe("run_du_jour");
    expect(o.totalS).toBe(4985);
  });
  it("un run manque : pas de run du jour", () => {
    expect(raceObjective(race({ run_4_s: null }), null)).toBeNull();
  });
  it("avec un plan : ses cibles telles que saisies", () => {
    const targets = { ...Object.fromEntries(Object.entries(ON_TARGET).map(([k, v]) => [k.replace(/_s$/, ""), v])), roxzone_per_transition: 50 } as never;
    const o = raceObjective(race(), { targets, run_avg_s: 300 })!;
    expect(o.source).toBe("plan");
    expect(o.segments.roxzone_total).toBe(400);
  });
  it("doubles : objectif doubles, pas solo", () => {
    const solo = raceObjective(race(), null)!;
    const duo = raceObjective(race({ format: "doubles", division: "doubles_men" }), null)!;
    expect(duo.segments.sled_push).toBeLessThan(solo.segments.sled_push);
  });
});

describe("modifier une cible", () => {
  const base = objectiveFromRun("men", 300)!.segments;
  it("chrono verrouillé : redistribué, le chrono ne bouge pas", () => {
    const e = editTarget(base, "ski", 250, { locked: true });
    expect(e.ski).toBe(250);
    expect(planTotal(e)).toBe(planTotal(base));
    expect(e.wall_balls).toBeGreaterThan(base.wall_balls);
  });
  it("cibles figées : non touchées", () => {
    const e = editTarget(base, "ski", 250, { locked: true, frozen: new Set(["wall_balls"]) });
    expect(e.wall_balls).toBe(base.wall_balls);
    expect(planTotal(e)).toBe(planTotal(base));
  });
  it("déverrouillé : le chrono change", () => {
    expect(planTotal(editTarget(base, "ski", 250, { locked: false }))).toBe(planTotal(base) - 20);
  });
});
