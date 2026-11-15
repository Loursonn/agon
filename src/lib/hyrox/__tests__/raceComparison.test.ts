import { describe, expect, it } from "vitest";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { compareCandidates, compareRaces } from "@/lib/hyrox/raceComparison";

const race = (o: Partial<HyroxResult> = {}): HyroxResult => ({
  id: "lyon", athlete_id: "a", competition_id: null, created_by: null, date: "2026-09-14", event_name: "HYROX Lyon", venue: null,
  format: "solo", division: "women", age_group: null, is_official: true, status: "finished", total_s: 4722,
  run_1_s: 271, run_2_s: 288, run_3_s: 295, run_4_s: 290, run_5_s: 291, run_6_s: 293, run_7_s: 318, run_8_s: 310,
  ski_s: 262, sled_push_s: 214, sled_pull_s: 295, bbj_s: 285, row_s: 296, farmers_s: 112, lunges_s: 252, wall_balls_s: 290,
  roxzone_total_s: 377, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: null, rank_age_group: null, participants_overall: null, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "", updated_at: "",
  ...o,
});
const paris = race({ id: "paris", date: "2026-05-17", event_name: "HYROX Paris", total_s: 4856, run_1_s: 250, sled_push_s: 236, wall_balls_s: 280, run_7_s: 300 });

describe("comparer deux courses", () => {
  it("la plus ancienne est « avant », quel que soit l'ordre donné", () => {
    const c = compareRaces(race(), paris);
    expect(c.before.id).toBe("paris");
    expect(c.rows.find((r) => r.key === "total")).toMatchObject({ deltaS: -134, better: true, judged: true });
    expect(c).not.toHaveProperty("positionAfter");
  });

  it("run 1 affiché, jamais jugé ; progrès et reculs classés", () => {
    const c = compareRaces(paris, race());
    expect(c.rows.find((r) => r.key === "run_1")).toMatchObject({ deltaS: 21, better: null, judged: false });
    expect(c.improved[0]).toMatchObject({ key: "sled_push", deltaS: -22 });
    expect(c.regressed.map((r) => r.key)).toEqual(["run_7", "wall_balls"]);
    expect(c.warnings).toEqual([]);
  });

  it("solo contre duo : stations non jugées, avertissement clair", () => {
    const duo = race({ id: "nice", date: "2026-07-01", format: "doubles", division: "doubles_mixed", total_s: 4100, ski_s: 150 });
    const c = compareRaces(paris, duo);
    expect(c.sameFormat).toBe(false);
    expect(c.warnings[0]).toMatch(/^Solo contre duo : les stations ne se comparent pas/);
    expect(c.rows.filter((r) => r.group === "stations").every((r) => !r.judged && r.better == null)).toBe(true);
    expect(c.rows.find((r) => r.key === "total")!.judged).toBe(false);
    expect(c.rows.find((r) => r.key === "run_2")!.judged).toBe(true);
  });

  it("open contre pro : seules les stations sans charge différente sont jugées", () => {
    const pro = race({ id: "pro", date: "2026-10-01", division: "women_pro", sled_push_s: 260, ski_s: 250 });
    const c = compareRaces(paris, pro);
    expect(c.sameFormat).toBe(true);
    expect(c.warnings[0]).toMatch(/^Femmes open contre femmes pro/);
    expect(c.rows.find((r) => r.key === "sled_push")).toMatchObject({ judged: false, note: "Charge différente (102 kg contre 152 kg)." });
    expect(c.rows.find((r) => r.key === "ski")).toMatchObject({ judged: true, better: true });
  });

  it("courses proposées : les autres terminées, la plus récente d'abord", () => {
    const dnf = race({ id: "dnf", date: "2026-10-10", status: "dnf" });
    expect(compareCandidates(race(), [race(), paris, dnf, race({ id: "nice", date: "2026-07-01" })]).map((r) => r.id)).toEqual(["nice", "paris"]);
  });

  it("no reps wall balls : moins = mieux, un d'écart compte, absente si jamais saisie", () => {
    expect(compareRaces(paris, race()).rows.some((r) => r.key === "wall_balls_no_reps")).toBe(false);
    const c = compareRaces(race({ ...paris, wall_balls_no_rep_target: 5, wall_balls_no_rep_depth: 3 }), race({ wall_balls_no_rep_target: 4, wall_balls_no_rep_depth: 2 }));
    expect(c.rows.find((r) => r.key === "wall_balls_no_reps")).toMatchObject({ before: 8, after: 6, deltaS: -2, better: true, judged: true, unit: "count" });
    expect(c.improved.some((r) => r.key === "wall_balls_no_reps")).toBe(true);
    const one = compareRaces(paris, race({ wall_balls_no_rep_target: 4, wall_balls_no_rep_depth: 2 }));
    expect(one.rows.find((r) => r.key === "wall_balls_no_reps")).toMatchObject({ before: null, after: 6, deltaS: null, better: null });
    const pro = compareRaces(paris, race({ division: "women_pro", wall_balls_no_rep_target: 1, wall_balls_no_rep_depth: 0 }));
    expect(pro.rows.find((r) => r.key === "wall_balls_no_reps")?.judged).toBe(false);
  });
});
