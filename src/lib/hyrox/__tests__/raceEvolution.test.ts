import { describe, expect, it } from "vitest";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxReferenceSegment, HyroxResult } from "@/features/shared/types/hyrox";
import {
  bracketLabel, previousRace, profilePercentiles, raceShortName, recordGap, runPaceEvolution, segmentPositions, timeSplit,
} from "@/lib/hyrox/raceEvolution";
import {
  cadenceDrop, compromisedFromTimes, crossRaceWithWatch, raceGains, runCostAfter, shareAboveHr, stationsAtLevel,
} from "@/lib/hyrox/raceWatch";

const result = (o: Partial<HyroxResult> = {}): HyroxResult => ({
  id: "r1", athlete_id: "lea", competition_id: null, created_by: null, date: "2026-10-04",
  event_name: "HYROX Paris", venue: null, format: "individual", division: "women", age_group: null,
  is_official: true, status: "finished", total_s: 5115,
  run_1_s: 300, run_2_s: 310, run_3_s: 320, run_4_s: 340, run_5_s: 330, run_6_s: 345, run_7_s: 350, run_8_s: 360,
  ski_s: 270, sled_push_s: 180, sled_pull_s: 240, bbj_s: 300, row_s: 280, farmers_s: 120, lunges_s: 260, wall_balls_s: 360,
  roxzone_total_s: 450, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: null, rank_age_group: null, participants_overall: null, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "2026-10-04T12:00:00Z",
  ...o,
} as HyroxResult);

const ref = (segment: string, p50: number): HyroxReferenceSegment => ({
  id: segment, division: "all", bracket: "all", segment,
  p1_s: p50 * 0.7, p5_s: null, p10_s: p50 * 0.85, p25_s: null, p50_s: p50, p75_s: null, p90_s: p50 * 1.2,
} as unknown as HyroxReferenceSegment);

function stream(total: number, hr: (t: number) => number | null, cad: (t: number) => number | null): ActivityStream {
  const t = Array.from({ length: total }, (_, i) => i);
  return new Proxy({ t, timer: null, hr: t.map(hr), cadence: t.map(cad) } as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : null),
  }) as unknown as ActivityStream;
}

describe("raceEvolution", () => {
  it("tranche lisible et nom court", () => {
    expect(bracketLabel("70_80")).toBe("1:10–1:20");
    expect(bracketLabel("sub70")).toBe("moins de 1:10");
    expect(raceShortName({ event_name: "HYROX Lyon" })).toBe("Lyon");
    expect(raceShortName({ event_name: "Simulation" })).toBe("Simulation");
  });

  it("écart au record : meilleure officielle, hors course affichée", () => {
    const lyon = result({ id: "lyon", event_name: "HYROX Lyon", total_s: 4722 });
    const simu = result({ id: "simu", is_official: false, total_s: 4865, date: "2026-11-07" });
    const g = recordGap(simu, [lyon, simu, result({ id: "paris", total_s: 5100 })])!;
    expect(g.gapS).toBe(143);
    expect(g.record.id).toBe("lyon");
    expect(recordGap(lyon, [lyon, simu])).toBeNull();
  });

  it("course précédente : la plus récente avant la date", () => {
    const a = result({ id: "a", date: "2026-03-23" });
    const b = result({ id: "b", date: "2026-09-14" });
    const c = result({ id: "c", date: "2026-11-07" });
    expect(previousRace(c, [a, b, c])!.id).toBe("b");
    expect(previousRace(a, [a, b, c])).toBeNull();
  });

  it("allures par run : courses complètes, ordre chronologique", () => {
    const rows = runPaceEvolution([result({ id: "b", date: "2026-09-14" }), result({ id: "a", date: "2026-03-23" }), result({ id: "x", run_3_s: null })]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0].runs).toHaveLength(8);
    expect(rows[0].avg).toBeCloseTo(331.875, 3);
  });

  it("où passe le temps : secondes et parts", () => {
    const s = timeSplit(result());
    expect(s.run).toBe(2655);
    expect(s.stations).toBe(2010);
    expect(s.roxzone).toBe(450);
    expect(s.pct.roxzone).toBe(8.8);
  });

  it("position par station : top %, évolution en points", () => {
    const refs = [ref("ski", 300), ref("run_total", 2655), ref("roxzone_total", 450)];
    const lookup = (_d: string, s: string) => refs.find((r) => r.segment === s);
    const rows = segmentPositions([result({ ski_s: 300 }), result({ ski_s: 255 })], lookup);
    const ski = rows.find((r) => r.key === "ski")!;
    expect(ski.pcts).toEqual([50, 10]);
    expect(ski.deltaPts).toBe(-40);
    expect(rows.map((r) => r.key).slice(-2)).toEqual(["run_total", "roxzone_total"]);
    expect(rows.find((r) => r.key === "sled_push")!.latestPct).toBeNull();
    const p = profilePercentiles(result(), lookup);
    expect(p.run).toBe(50);
    expect(p.stations).toBe(23);
  });
});

describe("raceWatch : compléments", () => {
  const r = result();
  const a = crossRaceWithWatch(r, null)!;

  it("coût sur le run suivant et course compromise sans montre", () => {
    const cost = runCostAfter(a);
    expect(cost.ski).toBe(10);
    expect(cost.lunges).toBe(60);
    expect(cost.wall_balls).toBeUndefined();
    expect(compromisedFromTimes(r)!.worst.key).toBe("run_8");
  });

  it("stations au niveau : médiane connue, absentes des gains", () => {
    const median = (k: string) => (k === "ski" ? 240 : k === "row" ? 300 : null);
    const gains = raceGains(r, median);
    expect(gains.items.map((g) => g.key)).toEqual(["ski"]);
    expect(stationsAtLevel(r, median, gains)).toEqual(["Rameur"]);
  });

  it("chute de cadence et part au-dessus d'un seuil", () => {
    const total = Math.ceil(a.segments.at(-1)!.endS) + 1;
    const run8 = a.segments.find((s) => s.key === "run_8")!;
    const st = stream(total, (t) => (t < 300 ? 150 : 180), (t) => (t >= run8.startS && t < run8.endS ? 160 : 176));
    const b = crossRaceWithWatch(r, st)!;
    const c = cadenceDrop(b)!;
    expect(c.freshCadence).toBe(176);
    expect(c.worst).toEqual({ key: "run_8", after: "Sandbag lunges", drop: 16 });
    expect(shareAboveHr(b, st, 170, 0, (s) => s.key === "run_1")).toBe(0);
    expect(shareAboveHr(b, st, 170, 0, (s) => s.key === "run_2")).toBe(1);
    expect(shareAboveHr(b, null, 170, 0, () => true)).toBeNull();
    expect(cadenceDrop(crossRaceWithWatch(r, null)!)).toBeNull();
  });
});
