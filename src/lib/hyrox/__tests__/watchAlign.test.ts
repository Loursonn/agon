import { describe, expect, it } from "vitest";
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { raceTimeline } from "@/lib/hyrox/raceWatch";
import { autoRaceOffset, fmtOffset, segmentHrDynamics } from "@/lib/hyrox/watchAlign";

const race = (o: Partial<HyroxResult> = {}): HyroxResult => ({
  id: "r", athlete_id: "a", competition_id: null, created_by: null, date: "2026-09-14", event_name: "HYROX Lyon", venue: null,
  format: "solo", division: "women", age_group: null, is_official: true, status: "finished", total_s: 4722,
  run_1_s: 271, run_2_s: 288, run_3_s: 295, run_4_s: 290, run_5_s: 291, run_6_s: 293, run_7_s: 318, run_8_s: 310,
  ski_s: 262, sled_push_s: 214, sled_pull_s: 295, bbj_s: 285, row_s: 296, farmers_s: 112, lunges_s: 252, wall_balls_s: 290,
  roxzone_total_s: 1330, roxzone_splits: null, penalties_s: 0, penalties_note: null,
  rank_overall: null, rank_age_group: null, participants_overall: null, participants_age_group: null,
  activity_url: null, athlete_comment: null, coach_comment: null, source: "manual", created_at: "", updated_at: "",
  ...o,
});

/** Série fictive : la course commence à `start` s de l'enregistrement, qui dure `len` s. */
function stream(r: HyroxResult, start: number, len: number, withCadence = true): ActivityStream {
  const segs = raceTimeline(r)!.segments;
  const t: number[] = [];
  const hr: number[] = [];
  const cad: Array<number | null> = [];
  for (let s = 0; s < len; s++) {
    const rel = s - start;
    const seg = segs.find((x) => rel >= x.startS && rel < x.endS);
    t.push(s);
    if (!seg) { hr.push(rel < 0 ? 105 : 120); cad.push(rel < 0 ? 0 : 20); continue; }
    const inSeg = rel - seg.startS;
    hr.push(seg.kind === "run" ? 168 : seg.kind === "station" ? 150 + Math.min(20, inSeg / 10) : 172 - Math.min(15, inSeg));
    cad.push(seg.kind === "run" ? 172 : seg.kind === "station" ? 55 : 110);
  }
  const none = null;
  return { t, timer: none, hr, cadence: withCadence ? cad : none, speed: none, dist: none, alt: none, power: none, lat: none, lon: none, vosc: none, stance: none, vratio: none, step_len: none, temp: none } as unknown as ActivityStream;
}

describe("recalage de la montre", () => {
  it("cadence : retrouve le départ après un échauffement enregistré", () => {
    const r = race();
    const a = autoRaceOffset(stream(r, 640, 640 + r.total_s + 200), r)!;
    expect(a.method).toBe("cadence");
    expect(Math.abs(a.offsetS - 640)).toBeLessThanOrEqual(3);
  });

  it("montre lancée 40 s après le départ : décalage négatif", () => {
    const r = race();
    const a = autoRaceOffset(stream(r, -40, r.total_s - 40), r)!;
    expect(a.method).toBe("cadence");
    expect(Math.abs(a.offsetS + 40)).toBeLessThanOrEqual(3);
  });

  it("sans cadence : montée de FC au départ", () => {
    const r = race();
    const a = autoRaceOffset(stream(r, 500, 500 + r.total_s + 60, false), r)!;
    expect(a.method).toBe("fc");
    expect(Math.abs(a.offsetS - 500)).toBeLessThanOrEqual(5);
  });

  it("sans série ni temps complets : rien", () => {
    expect(autoRaceOffset(null, race())).toBeNull();
    expect(autoRaceOffset(stream(race(), 0, 5000), race({ ski_s: null }))).toBeNull();
  });

  it("FC par segment : remontée en station, récupération en Roxzone", () => {
    const r = race();
    const d = segmentHrDynamics(stream(r, 300, 300 + r.total_s), r, 300);
    const ski = d.find((x) => x.key === "ski")!;
    const rox = d.find((x) => x.key === "rox_out_1")!;
    expect(ski.deltaHr!).toBeGreaterThan(10);
    expect(rox.deltaHr!).toBeLessThan(0);
  });

  it("affichage du décalage", () => {
    expect(fmtOffset(645)).toBe("10:45");
    expect(fmtOffset(-40)).toBe("−0:40");
    expect(fmtOffset(3725)).toBe("1:02:05");
  });
});
