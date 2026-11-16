import { describe, expect, it } from "vitest";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import type { PlanSegments } from "@/lib/hyrox/racePlan";
import { raceVsObjective } from "@/lib/hyrox/objective/vsObjective";
import { chronoByFormat, fmtPace, previousComparable, raceCruise, raceDebrief, raceStrip, segmentLabel } from "@/lib/hyrox/raceDebrief";

// Objectif de test (Femmes open) : 17 cibles connues, chrono 1:19:03.
const OBJ: PlanSegments = {
  run_1: 280, run_2: 290, run_3: 300, run_4: 296, run_5: 296, run_6: 296, run_7: 300, run_8: 310,
  ski: 300, sled_push: 230, sled_pull: 300, bbj: 290, row: 300, farmers: 115, lunges: 250, wall_balls: 260,
  roxzone_total: 330,
};

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
const paris = race({ id: "paris", date: "2026-05-17", event_name: "HYROX Paris", total_s: 4856, sled_push_s: 236, ski_s: 270, row_s: 310, roxzone_total_s: 393 });
const nice = race({ id: "nice", date: "2026-07-01", event_name: "HYROX Nice", format: "doubles", division: "doubles_mixed", total_s: 4180 });

const vs = raceVsObjective(race(), OBJ);

describe("frise de la course", () => {
  it("16 segments dans l'ordre, colorés par l'écart à l'objectif", () => {
    const s = raceStrip(race(), vs);
    expect(s).toHaveLength(16);
    expect(s[0]).toMatchObject({ key: "run_1", deltaS: -9, state: "fast_start" });
    expect(s[1]).toMatchObject({ key: "ski", short: "Ski", deltaS: -38, state: "ahead" });
    expect(s.find((x) => x.key === "wall_balls")!.state).toBe("behind");
    expect(s.find((x) => x.key === "lunges")!.state).toBe("on");
  });

  it("sans objectif : segments sans état", () => {
    expect(raceStrip(race(), null).every((x) => x.state == null && x.deltaS == null)).toBe(true);
  });
});

describe("débrief contre l'objectif", () => {
  const d = raceDebrief({ race: race(), races: [race(), paris, nice], objective: OBJ, vs, isRecord: true });

  it("compare à la course précédente du même format (pas au duo)", () => {
    expect(previousComparable(race(), [race(), paris, nice])!.id).toBe("paris");
    expect(d.previous!.id).toBe("paris");
  });

  it("ce qui a marché : segments en avance, puis le plus gros progrès (runs irréguliers : non cités)", () => {
    expect(d.good.map((g) => g.key)).toEqual(["ski", "sled_push", "up_row"]);
    expect(d.good[0]).toMatchObject({ value: "−38 s", title: "SkiErg", why: "4:22 pour un objectif de 5:00." });
    expect(d.good[2]).toMatchObject({ value: "−14 s", why: "5:10 → 4:56 depuis Paris." });
  });

  it("le run 1 en avance n'est jamais un point fort", () => {
    expect(d.good.some((g) => g.key === "run_1")).toBe(false);
    const all = raceDebrief({ race: race(), races: [race()], objective: OBJ, vs, isRecord: false });
    expect(all.bad.some((b) => b.key === "run_1")).toBe(false); // 4ᵉ, hors des 3 cités
  });

  it("ce qui a coûté : segments en retard, classés par secondes perdues", () => {
    expect(d.bad.map((b) => b.key)).toEqual(["roxzone_total", "wall_balls", "run_7"]);
    expect(d.bad[0]).toMatchObject({ value: "+47 s", title: "Roxzone", why: "6:17 pour un objectif de 5:30." });
    expect(d.bad[2]).toMatchObject({ value: "+18 s", title: "Run 7" });
  });

  it("départ rapide cité quand il pèse", () => {
    const fast = race({ run_1_s: 250, run_7_s: 300, wall_balls_s: 262, roxzone_total_s: 335 });
    const f = raceDebrief({ race: fast, races: [fast], objective: OBJ, vs: raceVsObjective(fast, OBJ), isRecord: false });
    expect(f.bad[0]).toMatchObject({ key: "run_1", value: "−30 s", title: "Run 1 · départ rapide" });
  });

  it("depuis la dernière course : écarts signés, aucune position", () => {
    const chrono = d.since.find((r) => r.key === "chrono")!;
    expect(chrono).toMatchObject({ from: "1:20:56", to: "1:18:42", delta: "−2:14", better: true });
    expect(d.since.map((r) => r.key)).toEqual(["chrono", "stations", "runs", "roxzone"]);
  });

  it("phrase de synthèse : l'objectif d'abord", () => {
    expect(d.headline).toBe("Dans l'objectif (1:19:03). Ta meilleure course. Le plus de temps perdu : roxzone.");
    const slow = race({ total_s: 4900 });
    const h = raceDebrief({ race: slow, races: [slow], objective: OBJ, vs: raceVsObjective(slow, OBJ), isRecord: false }).headline;
    expect(h.startsWith("2:37 au-dessus de l'objectif (1:19:03).")).toBe(true);
  });

  it("sans course précédente ni objectif : pas d'invention", () => {
    const solo = raceDebrief({ race: race(), races: [race()], objective: null, vs: null, isRecord: false });
    expect(solo).toMatchObject({ good: [], bad: [], since: [], previous: null, headline: "" });
  });

  it("libellés de segment", () => {
    expect(["run_3", "wall_balls", "roxzone_total"].map(segmentLabel)).toEqual(["Run 3", "Wall balls", "Roxzone"]);
  });
});

describe("saison", () => {
  it("chronos séparés par format, dans l'ordre", () => {
    const c = chronoByFormat([race(), nice, paris]);
    expect(c.solo.map((p) => p.id)).toEqual(["paris", "lyon"]);
    expect(c.duo.map((p) => p.name)).toEqual(["Nice"]);
  });

  it("croisière et allure", () => {
    expect(raceCruise(race())).toBe(292);
    expect(fmtPace(292)).toBe("4′52");
  });
});
