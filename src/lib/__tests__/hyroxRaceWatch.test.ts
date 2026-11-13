import { describe, expect, it } from "vitest";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { crossRaceWithWatch, raceTimeline } from "@/lib/hyrox/raceWatch";

const result = (o: Partial<HyroxResult> = {}): HyroxResult => ({
  id: "r1", athlete_id: "lea", competition_id: null, created_by: null, date: "2026-10-04",
  event_name: "HYROX Paris", venue: null, format: "individual", division: "open", age_group: null,
  is_official: true, status: "finished", total_s: 0,
  run_1_s: 300, run_2_s: 310, run_3_s: 320, run_4_s: 340, run_5_s: 330, run_6_s: 345, run_7_s: 350, run_8_s: 360,
  ski_s: 270, sled_push_s: 180, sled_pull_s: 240, bbj_s: 300, row_s: 280, farmers_s: 120, lunges_s: 260, wall_balls_s: 360,
  roxzone_total_s: 450, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: null, rank_age_group: null, participants_overall: null, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "2026-10-04T12:00:00Z",
  ...o,
} as HyroxResult);

/** Série à la seconde : FC et cadence données par une fonction du temps. */
function stream(total: number, hr: (t: number) => number | null, cad: (t: number) => number | null = () => 170): ActivityStream {
  const t = Array.from({ length: total }, (_, i) => i);
  const empty = () => null;
  return new Proxy({ t, timer: null, hr: t.map(hr), cadence: t.map(cad) } as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : empty()),
  }) as unknown as ActivityStream;
}

describe("raceTimeline", () => {
  it("ordre officiel, roxzone entre runs et stations (15 transitions), répartie si non détaillée", () => {
    const tl = raceTimeline(result())!;
    expect(tl.segments.slice(0, 5).map((s) => s.key)).toEqual(["run_1", "rox_in_1", "ski", "rox_out_1", "run_2"]);
    expect(tl.segments.at(-1)!.key).toBe("wall_balls");
    expect(tl.segments.filter((s) => s.kind === "roxzone")).toHaveLength(15);
    expect(tl.roxzoneEstimated).toBe(true);
    const sum = 2655 + 2010 + 450;
    expect(tl.segments.at(-1)!.endS).toBeCloseTo(sum, 6);
  });

  it("temps de passage roxzone détaillés : utilisés tels quels", () => {
    const splits = Array.from({ length: 15 }, (_, i) => 20 + i);
    const tl = raceTimeline(result({ roxzone_splits: splits }))!;
    expect(tl.roxzoneEstimated).toBe(false);
    expect(tl.segments.find((s) => s.key === "rox_in_1")!.endS - tl.segments.find((s) => s.key === "rox_in_1")!.startS).toBe(20);
  });

  it("un temps manquant : pas de découpage (tout serait décalé)", () => {
    expect(raceTimeline(result({ sled_pull_s: null }))).toBeNull();
  });
});

describe("crossRaceWithWatch", () => {
  it("allure fraîche = run 1, chute d'allure nommée avec la station d'avant", () => {
    const a = crossRaceWithWatch(result(), null)!;
    expect(a.freshPaceSPerKm).toBe(300);
    expect(a.runDrift.find((d) => d.key === "run_4")!.pct).toBeCloseTo(0.1333, 3);
    const drops = a.flags.filter((f) => f.kind === "allure_chute").map((f) => f.segment);
    expect(drops).toEqual(["run_4", "run_5", "run_6", "run_7", "run_8"]);
    expect(a.flags.find((f) => f.segment === "run_4")!.text).toBe("Run 4 : 13 % plus lent que le run 1 (après Sled pull)");
    // Sans montre : pas de FC, pas d'alerte « montre incomplète ».
    expect(a.segments[0].avgHr).toBeNull();
    expect(a.flags.some((f) => f.kind === "montre_incomplete")).toBe(false);
  });

  it("FC et cadence par segment, avec décalage du départ", () => {
    const tl = raceTimeline(result())!;
    const wb = tl.segments.find((s) => s.key === "wall_balls")!;
    const run8 = tl.segments.find((s) => s.key === "run_8")!;
    const offset = 600; // 10 min d'échauffement enregistrées avant le départ
    const s = stream(offset + 5200, (t) => {
      const r = t - offset;
      if (r >= wb.startS && r < wb.endS) return 186;
      return 160;
    }, (t) => {
      const r = t - offset;
      return r >= run8.startS && r < run8.endS ? 158 : 172;
    });
    const a = crossRaceWithWatch(result(), s, offset)!;
    const seg = (k: string) => a.segments.find((x) => x.key === k)!;
    expect(seg("wall_balls")).toMatchObject({ avgHr: 186, maxHr: 186, avgCadence: null });
    expect(seg("run_1")).toMatchObject({ avgHr: 160, avgCadence: 172, coverage: 1 });
    expect(a.raceMaxHr).toBe(186);
    expect(a.flags.find((f) => f.kind === "fc_station_haute")!.segment).toBe("wall_balls");
    expect(a.flags.find((f) => f.kind === "cadence_chute")!.text).toBe("Run 8 : cadence 158 pas/min, 14 de moins qu'au run 1");
  });

  it("montre arrêtée avant la fin : signalé, segments sans mesure à null", () => {
    const s = stream(3000, () => 165);
    const a = crossRaceWithWatch(result(), s)!;
    expect(a.segments.find((x) => x.key === "wall_balls")!.avgHr).toBeNull();
    const f = a.flags.find((x) => x.kind === "montre_incomplete")!;
    expect(f.text).toMatch(/^Montre incomplète sur \d+ segment\(s\)/);
  });
});
