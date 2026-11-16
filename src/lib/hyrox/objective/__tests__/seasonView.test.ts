import { describe, expect, it } from "vitest";
import { seasonLevers, seasonRaces, seasonsWithRaces, segmentGaps } from "../seasonView";
import { race } from "./fixtures";

const women = { division: "women" as const };
// Léa Démo : Paris (seed démo) et une course plus ancienne de la même saison.
const paris = race({
  ...women, id: "paris", date: "2026-09-16",
  run_1_s: 268, run_2_s: 292, run_3_s: 300, run_4_s: 298, run_5_s: 305, run_6_s: 310, run_7_s: 312, run_8_s: 305,
  ski_s: 262, sled_push_s: 215, sled_pull_s: 262, bbj_s: 300, row_s: 270, farmers_s: 138, lunges_s: 250, wall_balls_s: 355,
  roxzone_total_s: 216, wall_balls_no_rep_target: 4, wall_balls_no_rep_depth: 2,
});
const tenerife = race({
  ...women, id: "tenerife", event_name: "HYROX Tenerife", date: "2026-09-04",
  run_1_s: 262, run_2_s: 300, run_3_s: 312, run_4_s: 306, run_5_s: 312, run_6_s: 318, run_7_s: 320, run_8_s: 322,
  ski_s: 270, sled_push_s: 232, sled_pull_s: 275, bbj_s: 312, row_s: 275, farmers_s: 140, lunges_s: 262, wall_balls_s: 372,
  roxzone_total_s: 262,
});
const lyon = race({ ...women, id: "lyon", event_name: "HYROX Lyon", date: "2026-07-12" });

describe("Ma saison", () => {
  it("saisons avec des courses, plus la saison en cours", () => {
    expect(seasonsWithRaces([paris, lyon], "2026-11-16").map((s) => s.key)).toEqual(["2026-27", "2025-26"]);
    expect(seasonsWithRaces([lyon], "2026-11-16").map((s) => s.key)).toEqual(["2026-27", "2025-26"]);
    expect(seasonsWithRaces([{ ...paris, status: "dns" } as never], "2026-11-16").map((s) => s.key)).toEqual(["2026-27"]);
  });

  it("courses terminées de la saison, la plus récente d'abord, contre leur objectif", () => {
    const items = seasonRaces([lyon, tenerife, paris], [], "2026-27");
    expect(items.map((x) => x.race.id)).toEqual(["paris", "tenerife"]);
    expect(items[0].view?.vs.total).toMatchObject({ actualS: 4658, targetS: 4883, deltaS: -225 });
    expect(items[0].strategy?.possibleS).toBe(4576);
  });

  it("leviers cumulés : moyenne par course, récurrent dès 2 courses sur 3", () => {
    const levers = seasonLevers(seasonRaces([tenerife, paris], [], "2026-27"));
    expect(levers.map((l) => [l.key, l.avgS, l.count, l.recurrent])).toEqual([
      ["sled_push", 60, 2, true],
      ["wall_balls", 13, 1, false],
      ["farmers", 10, 2, true],
      ["no_reps", 10, 1, false],
    ]);
    expect(levers[0]).toMatchObject({ group: "capacite", of: 2 });
    expect(levers[0].proposal).toMatch(/sled lourd/);
    expect(levers.find((l) => l.key === "no_reps")?.proposal).toMatch(/^Technique/);
  });

  it("aucune course analysée : aucun levier", () => {
    expect(seasonLevers([])).toEqual([]);
  });
});

describe("écarts à l'objectif sur plusieurs courses", () => {
  it("une ligne par station, runs et Roxzone, plus le chrono ; progrès en secondes", () => {
    const rows = segmentGaps([tenerife, paris], []);
    expect(rows.map((r) => r.key)).toEqual(["total", "ski", "sled_push", "sled_pull", "bbj", "row", "farmers", "lunges", "wall_balls", "runs", "roxzone_total"]);
    const push = rows.find((r) => r.key === "sled_push")!;
    expect(push.deltas).toEqual([70, 55]);
    expect(push.states).toEqual(["behind", "behind"]);
    expect(push.changeS).toBe(-15);
    expect(rows[0].deltas).toEqual([-147, -225]);
  });

  it("course sans objectif : « — »", () => {
    const relay = race({ ...women, id: "relay", format: "relay" as never, division: "relay_women" as never });
    const rows = segmentGaps([relay, paris], []);
    expect(rows[0].deltas[0]).toBeNull();
    expect(rows[0].changeS).toBeNull();
  });
});
