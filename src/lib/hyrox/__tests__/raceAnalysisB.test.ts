import { describe, expect, it } from "vitest";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxReferenceSegment, HyroxResult } from "@/features/shared/types/hyrox";
import type { RefLookup } from "@/lib/hyrox/calc";
import { PLAN_SEGMENTS, parseClock, planForRace, planFromTarget, planSegments, planTargets, planTotal } from "@/lib/hyrox/racePlan";
import { compareAvailable, compareTarget, defaultCompare } from "@/lib/hyrox/raceCompare";
import { RUN_AFTER_STATION_WEIGHT, raceLevers } from "@/lib/hyrox/raceLevers";
import { HYROX_WORK_PROPOSALS } from "@/lib/hyrox/workProposals";
import { evolutionRaces, nextHyroxCompetition, raceProjection, runEfficiencySeries } from "@/lib/hyrox/raceProjection";
import { crossRaceWithWatch } from "@/lib/hyrox/raceWatch";
import type { CalibrationAnalysis } from "@/lib/hyrox/tests/calibration";

/** HYROX Lyon de la recette (prompt §8). */
const lyon = (o: Partial<HyroxResult> = {}): HyroxResult => ({
  id: "lyon", athlete_id: "lea", competition_id: "c-lyon", created_by: null, date: "2026-09-14",
  event_name: "HYROX Lyon", venue: null, format: "solo", division: "women", age_group: null,
  is_official: true, status: "finished", total_s: 4722,
  run_1_s: 271, run_2_s: 284, run_3_s: 290, run_4_s: 293, run_5_s: 295, run_6_s: 297, run_7_s: 303, run_8_s: 302,
  ski_s: 290, sled_push_s: 220, sled_pull_s: 295, bbj_s: 270, row_s: 295, farmers_s: 110, lunges_s: 245, wall_balls_s: 285,
  roxzone_total_s: 377, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: 142, rank_age_group: null, participants_overall: 611, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "2026-09-14T12:00:00Z",
  ...o,
} as HyroxResult);

/** Médianes inventées, fixes : chaque segment a une p50 connue. */
const P50: Record<string, number> = {
  run_1: 280, run_2: 285, run_3: 288, run_4: 290, run_5: 292, run_6: 294, run_7: 296, run_8: 298,
  ski: 290, sled_push: 198, sled_pull: 300, bbj: 272, row: 300, farmers: 115, lunges: 250, wall_balls: 257,
  roxzone_total: 331, total: 4830,
};
const ref = (segment: string, p50: number): HyroxReferenceSegment => ({
  id: segment, division: "women", bracket: "70_80", segment,
  p1_s: p50 * 0.7, p5_s: null, p10_s: p50 * 0.85, p25_s: null, p50_s: p50, p75_s: null, p90_s: p50 * 1.2,
} as unknown as HyroxReferenceSegment);
const refs: RefLookup = (_d, s) => (P50[s] != null ? ref(s, P50[s]) : undefined);

function stream(total: number, hr: (t: number) => number | null, cad: (t: number) => number | null): ActivityStream {
  const t = Array.from({ length: total }, (_, i) => i);
  return new Proxy({ t, timer: null, hr: t.map(hr), cadence: t.map(cad) } as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : null),
  }) as unknown as ActivityStream;
}

describe("plan de course", () => {
  it("répartit un chrono cible sur les 17 segments, somme exacte", () => {
    const p = planFromTarget(4770, "women", refs)!;
    expect(Object.keys(p)).toHaveLength(17);
    expect(planTotal(p)).toBe(4770);
    // au prorata des médianes : le sled push reste plus court que le SkiErg
    expect(p.sled_push).toBeLessThan(p.ski);
  });

  it("sans médiane, pas de plan", () => {
    expect(planFromTarget(4770, "women", () => undefined)).toBeNull();
  });

  it("aller-retour stockage ↔ segments (Roxzone = 8 × par transition)", () => {
    const p = planFromTarget(4770, "women", refs)!;
    const t = planTargets(p);
    expect(t.roxzone_per_transition * 8).toBeCloseTo(p.roxzone_total);
    expect(planSegments(t)).toEqual(p);
    expect(PLAN_SEGMENTS).toHaveLength(17);
  });

  it("plan d'une course : rattaché au résultat d'abord, sinon à la compétition", () => {
    const t = planTargets(planFromTarget(4770, "women", refs)!);
    const comp = { id: "p1", result_id: null, competition_id: "c-lyon", target_total_s: 4770, targets: t, updated_at: "2026-09-01" };
    const res = { id: "p2", result_id: "lyon", competition_id: null, target_total_s: 4700, targets: t, updated_at: "2026-08-01" };
    expect(planForRace(lyon(), [comp])?.id).toBe("p1");
    expect(planForRace(lyon(), [comp, res])?.id).toBe("p2");
    expect(planForRace(lyon({ competition_id: null }), [comp])).toBeNull();
  });

  it("lit les chronos saisis", () => {
    expect(parseClock("4:38")).toBe(278);
    expect(parseClock("1:18:42")).toBe(4722);
    expect(parseClock("4:78")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});

describe("comparer à", () => {
  const prev = lyon({ id: "paris", run_1_s: 285, total_s: 5057, roxzone_total_s: 429 });
  const plan = planFromTarget(4770, "women", refs)!;
  const median = (s: string) => P50[s] ?? null;

  it("course précédente, plan, médiane", () => {
    expect(compareTarget("previous", { previous: prev, plan, median })("run_1")).toBe(285);
    expect(compareTarget("previous", { previous: prev, plan, median })("total")).toBe(5057);
    expect(compareTarget("plan", { previous: prev, plan, median })("total")).toBe(4770);
    expect(compareTarget("plan", { previous: prev, plan, median })("wall_balls")).toBe(plan.wall_balls);
    expect(compareTarget("median", { previous: prev, plan, median })("roxzone_total")).toBe(331);
  });

  it("sans donnée : « — » et choix indisponible ; défaut = plan, sinon médiane", () => {
    const src = { previous: null, plan: null, median };
    expect(compareTarget("previous", src)("run_1")).toBeNull();
    expect(compareAvailable("plan", src)).toBe(false);
    expect(defaultCompare(src)).toBe("median");
    expect(defaultCompare({ ...src, plan })).toBe("plan");
  });
});

describe("leviers", () => {
  it("garde les points ≥ 10 s derrière la médiane, triés par score, avec une proposition", () => {
    const l = raceLevers({ race: lyon(), refs, analysis: null });
    const keys = l.map((x) => x.key);
    // wall balls +28 s, roxzone +46 s, sled push +22 s ; ski, rameur… au niveau
    expect(keys).toEqual(expect.arrayContaining(["wall_balls", "roxzone", "sled_push"]));
    expect(keys).not.toContain("ski");
    expect(l.every((x) => x.proposal.length > 0)).toBe(true);
    expect(l.map((x) => x.score)).toEqual([...l.map((x) => x.score)].sort((a, b) => b - a));
    expect(l.find((x) => x.key === "wall_balls")?.proposal).toBe(HYROX_WORK_PROPOSALS.wall_balls);
    expect(l.find((x) => x.key === "roxzone")?.reason).toBe("8 % du chrono");
    expect(l.some((x) => x.watch)).toBe(false);
  });

  it("avec la montre : FC la plus haute, cadence du run suivant, levier « Course après »", () => {
    const race = lyon();
    const base = crossRaceWithWatch(race, null)!;
    const wb = base.segments.find((s) => s.key === "wall_balls")!;
    const sp = base.segments.find((s) => s.key === "sled_push")!;
    const run3 = base.segments.find((s) => s.key === "run_3")!;
    const st = stream(race.total_s + 5,
      (t) => (t >= wb.startS && t < wb.endS ? 184 : 165),
      (t) => (t >= run3.startS && t < run3.endS ? 82 : 88));
    const a = crossRaceWithWatch(race, st)!;
    expect(sp.key).toBe("sled_push");
    const l = raceLevers({ race, refs, analysis: a, roxzoneRecoveryBpm: 10 });
    expect(l.find((x) => x.key === "wall_balls")?.reason).toBe("FC moy. 184 bpm, la plus haute de la course");
    expect(l.find((x) => x.key === "sled_push")?.reason).toMatch(/^Cadence du run suivant −\d+ pas\/min$/);
    expect(l.find((x) => x.key === "roxzone")?.reason).toBe("8 % du chrono · récupération −10 bpm en 60 s");
    const ra = l.find((x) => x.watch)!;
    // coûts Lyon : farmers → run 7 +32, fentes → run 8 +31 ; farmers pas dans la liste
    expect(ra.key).toBe("run_after_farmers");
    expect(ra.label).toBe("Course après farmers");
    expect(ra.weight).toBe(RUN_AFTER_STATION_WEIGHT);
    expect(ra.gainS).toBe(32);
  });
});

describe("évolution", () => {
  const analysis = (date: string, low: number, high: number): CalibrationAnalysis => ({
    id: date, athlete_id: "lea", date, profile: { sex: "F", category: "Open" } as CalibrationAnalysis["profile"],
    outputs: { chrono: { run_s: 2340, pace_s_per_km: 292, t5_s: 1300, station_level: null, level: 3, median_s: (low + high) / 2, low_s: low, high_s: high, p10_s: low, p90_s: high, gain_cs_05_s: 60, gain_stations_1_s: 40 } },
    algo_version: "v0", grid_version: "g1",
  });

  it("projection depuis la dernière analyse, fiabilité sur les courses passées", () => {
    const races = [lyon(), lyon({ id: "paris", date: "2026-03-23", total_s: 5057 })];
    const p = raceProjection([analysis("2026-03-01", 4900, 5200), analysis("2026-09-01", 4600, 4800), analysis("2026-11-09", 4640, 4780)], races)!;
    expect(p.analysisDate).toBe("2026-11-09");
    expect([p.lowS, p.highS]).toEqual([4640, 4780]);
    expect(p.runS).toBe(2340);
    expect(p.stations.lowS + p.roxzone.lowS + p.runS).toBeCloseTo(4640, 0);
    expect(p.reliability).toEqual({ inRange: 2, n: 2 });
  });

  it("sans analyse : pas de projection", () => {
    expect(raceProjection([], [lyon()])).toBeNull();
  });

  it("efficacité des runs : mètres par battement, « — » sans FC", () => {
    const race = lyon();
    expect(runEfficiencySeries(crossRaceWithWatch(race, null)!)).toEqual(Array(8).fill(null));
    const a = crossRaceWithWatch(race, stream(race.total_s + 5, () => 160, () => null))!;
    const e = runEfficiencySeries(a);
    expect(e[0]).toBeCloseTo(1000 / (160 * (271 / 60)), 5);
  });

  it("prochaine compétition HYROX et filtre Toutes / Officielles", () => {
    const comps = [
      { name: "Trail", date: "2026-11-20" },
      { name: "HYROX Paris", date: "2026-12-05" },
      { name: "HYROX Nice", date: "2026-11-01" },
      { name: "HYROX Lille", date: "2026-11-30", cancelled_at: "2026-11-02" },
    ];
    expect(nextHyroxCompetition(comps, "2026-11-14")?.name).toBe("HYROX Paris");
    const sim = lyon({ id: "sim", date: "2026-11-07", is_official: false, format: "sim_full" });
    const dnf = lyon({ id: "dnf", date: "2026-10-01", status: "dnf" });
    const paris = lyon({ id: "paris", date: "2026-03-23" });
    expect(evolutionRaces([sim, lyon(), paris, dnf], false).map((r) => r.id)).toEqual(["paris", "lyon", "sim"]);
    expect(evolutionRaces([sim, lyon(), paris], true).map((r) => r.id)).toEqual(["paris", "lyon"]);
  });
});
