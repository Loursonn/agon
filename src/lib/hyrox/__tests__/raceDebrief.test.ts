import { describe, expect, it } from "vitest";
import type { HyroxReferenceSegment, HyroxResult } from "@/features/shared/types/hyrox";
import type { RefLookup } from "@/lib/hyrox/calc";
import { chronoByFormat, fmtPace, previousComparable, raceCruise, raceDebrief, raceStrip, stationProfile } from "@/lib/hyrox/raceDebrief";

const ref = (division: string, segment: string, p: number[], bracket = "all"): HyroxReferenceSegment => ({
  id: `${division}-${bracket}-${segment}`, division, bracket, segment,
  p1_s: p[0], p5_s: p[1], p10_s: p[2], p25_s: p[3], p50_s: p[4], p75_s: p[5], p90_s: p[6],
  source: "test", is_estimate: false, sample_size: 1000,
});

// Femmes open (valeurs de test) : chaque segment centré sur une médiane connue.
const around = (m: number) => [m - 60, m - 45, m - 35, m - 18, m, m + 22, m + 45];
const MED: Record<string, number> = {
  ski: 300, sled_push: 230, sled_pull: 300, bbj: 290, row: 300, farmers: 115, lunges: 250, wall_balls: 260,
  roxzone_total: 330, total: 5000,
  run_1: 280, run_2: 290, run_3: 300, run_4: 296, run_5: 296, run_6: 296, run_7: 300, run_8: 310,
};
const REFS = [
  ...Object.entries(MED).filter(([s]) => s !== "total").map(([s, m]) => ref("women", s, around(m))),
  ref("women", "total", [4400, 4550, 4650, 4800, 5000, 5300, 5600]),
];
const refs: RefLookup = (d, s, b) => REFS.find((r) => r.division === d && r.segment === s && r.bracket === b);
const posOf = (s: string) => refs("women", s, "all");
const median = (s: string) => MED[s] ?? null;

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

describe("frise de la course", () => {
  it("16 segments dans l'ordre, run 1 sans position", () => {
    const s = raceStrip(race(), posOf);
    expect(s).toHaveLength(16);
    expect(s[0]).toMatchObject({ key: "run_1", pct: null, standing: null });
    expect(s[1]).toMatchObject({ key: "ski", short: "Ski", standing: "fort" });
    expect(s.find((x) => x.key === "wall_balls")!.standing).toBe("faible");
  });
});

describe("débrief", () => {
  const d = raceDebrief({ race: race(), races: [race(), paris, nice], posOf, median, refs, isRecord: true });

  it("compare à la course précédente du même format (pas au duo)", () => {
    expect(previousComparable(race(), [race(), paris, nice])!.id).toBe("paris");
    expect(d.previous!.id).toBe("paris");
  });

  it("ce qui a marché : stations fortes, puis le plus gros progrès (runs irréguliers : non cités)", () => {
    expect(d.good.map((g) => g.key)).toEqual(["ski", "sled_push", "up_row"]);
    expect(d.good[2]).toMatchObject({ value: "−14 s", why: "5:10 → 4:56 depuis Paris." });
    expect(d.good[0].value).toMatch(/^top \d+ %$/);
    expect(d.good[0].why).toMatch(/mieux que \d+ % de la catégorie/);
  });

  it("ce qui a coûté : classé par secondes perdues, run comparé à l'habituel", () => {
    expect(d.bad.map((b) => b.key)).toEqual(["roxzone", "wall_balls", "run_7"]);
    expect(d.bad[0]).toMatchObject({ value: "+47 s", title: "Roxzone" });
    // Run 7 : 318 vs croisière 292 → +26 ; habituel 300 − 296 = +4 → surcoût 22.
    expect(d.bad[2].value).toBe("+22 s");
    expect(d.bad[2].why).toContain("d'habitude +4");
  });

  it("depuis la dernière course : écarts signés", () => {
    const chrono = d.since.find((r) => r.key === "chrono")!;
    expect(chrono).toMatchObject({ from: "1:20:56", to: "1:18:42", delta: "−2:14", better: true });
    expect(d.since.find((r) => r.key === "position")!.better).toBe(true);
  });

  it("phrase de synthèse calculée", () => {
    expect(d.headline).toBe("Ta meilleure course. Points forts : SkiErg et Sled push. Le plus de temps perdu : roxzone.");
  });

  it("sans course précédente ni références : pas d'invention", () => {
    const solo = raceDebrief({ race: race(), races: [race()], posOf: () => null, median: null, refs: null, isRecord: false });
    expect(solo).toMatchObject({ good: [], bad: [], since: [], previous: null, headline: "" });
  });
});

describe("saison", () => {
  it("chronos séparés par format, dans l'ordre", () => {
    const c = chronoByFormat([race(), nice, paris]);
    expect(c.solo.map((p) => p.id)).toEqual(["paris", "lyon"]);
    expect(c.duo.map((p) => p.name)).toEqual(["Nice"]);
  });

  it("profil : stations de la plus forte à la plus faible", () => {
    const p = stationProfile(race(), refs);
    expect(p[0].key).toBe("ski");
    expect(p[p.length - 1]).toMatchObject({ key: "wall_balls", standing: "faible" });
  });

  it("croisière et allure", () => {
    expect(raceCruise(race())).toBe(292);
    expect(fmtPace(292)).toBe("4′52");
  });
});
