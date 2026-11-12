import { describe, expect, it } from "vitest";
import { emptyStream, type WatchLap } from "../activityFiles/stream";
import {
  flattenPlannedSession,
  lapsForActivity,
  parsePrescription,
  proposeLaps,
  segmentStream,
  type PlanStep,
} from "../domain/hyroxLaps";

/** Séance fictive : 4 × (500 m course + 15 m sled push + 10 wall balls). */
const wod: PlanStep[] = [{
  type: "group",
  id: "g",
  role: "work",
  repeat: 4,
  children: [
    { type: "interval", id: "run", role: "work", duration: { kind: "distance", value: 500 } },
    {
      type: "exercise", id: "sled", role: "work", exercise_id: "ex-sled", exercise_name: "Sled Push",
      duration: { kind: "distance", value: 15 }, weight_kg: 102,
    },
    { type: "exercise", id: "wb", role: "work", exercise_id: "ex-wb", exercise_name: "Wall balls", reps_max: 10 },
  ],
}];
const blocks = flattenPlannedSession({ format: "wod", intervals: wod });

/** Série fictive qui suit la séance : course 3,5 m/s, sled 0,3 m/s, wall balls immobile. */
function hyroxStream() {
  const s = emptyStream();
  const speed: number[] = [];
  const truth: Array<[string, number, number]> = [];
  for (let r = 0; r < 4; r++) {
    for (const [name, secs, v] of [["run", 143, 3.5], ["sled", 50, 0.3], ["wb", 40, 0]] as const) {
      truth.push([name, speed.length, speed.length + secs]);
      for (let i = 0; i < secs; i++) speed.push(v);
    }
  }
  s.t = speed.map((_, i) => i);
  s.speed = speed;
  return { stream: s, truth };
}

const lap = (startS: number, endS: number): WatchLap => ({ startS, endS, trigger: "manual", intensity: null, watch: null });

describe("aplatissement de la séance prévue", () => {
  it("4 × (course + sled + wall balls) = 12 blocs dans l'ordre", () => {
    expect(blocks).toHaveLength(12);
    expect(blocks.slice(0, 3).map((b) => [b.kind, b.name, b.distanceM, b.reps])).toEqual([
      ["run", "Course 500 m", 500, null],
      ["station", "Sled Push 15 m", 15, null],
      ["station", "Wall balls", null, 10],
    ]);
    expect(blocks[3].ref).toBe("g#2/run");
  });

  it("blocs Classique : prescriptions libres lues", () => {
    const b = flattenPlannedSession({
      format: "classique",
      classique_structure: {
        blocks: [{
          id: "b1", title: "Bloc", items: [
            { id: "i1", name: "Course", prescription: "1 km" },
            { id: "i2", name: "SkiErg", prescription: "500 m" },
            { id: "i3", name: "Burpee broad jump", prescription: "2 x 40 m" },
            { id: "i4", name: "Wall balls", prescription: "100 reps" },
          ],
        }],
      },
    });
    expect(b.map((x) => [x.kind, x.distanceM, x.reps])).toEqual([
      ["run", 1000, null], ["station", 500, null], ["station", 40, null], ["station", 40, null], ["station", null, 100],
    ]);
  });

  it("prescriptions", () => {
    expect(parsePrescription("4 x 250 m")).toMatchObject({ repeat: 4, distanceM: 250 });
    expect(parsePrescription("5 séries · 8 reps")).toMatchObject({ repeat: 5, reps: 8 });
    expect(parsePrescription("2'30")).toMatchObject({ durationS: 150 });
    expect(parsePrescription("90 s")).toMatchObject({ durationS: 90 });
    expect(parsePrescription("15 m")).toMatchObject({ repeat: 1, distanceM: 15 });
    expect(parsePrescription("2 min")).toMatchObject({ durationS: 120, distanceM: null });
  });
});

describe("tours HYROX (tests du brief)", () => {
  const { stream, truth } = hyroxStream();

  it("(a) 12 tours de la montre → 12 tours nommés, à valider", () => {
    const watch = truth.map(([, a, b]) => lap(a, b));
    const r = lapsForActivity(watch, blocks);
    expect(r.named).toBe(true);
    expect(r.laps).toHaveLength(12);
    expect(r.laps.map((l) => l.name).slice(0, 3)).toEqual(["Course 500 m", "Sled Push 15 m", "Wall balls"]);
    expect(r.laps[1]).toMatchObject({ exerciseId: "ex-sled", distanceOverrideM: 15, loadKg: 102, status: "proposed", origin: "watch" });
    expect(r.laps[2].reps).toBe(10);
    expect(r.laps[0].distanceOverrideM).toBeNull(); // une course garde la distance mesurée
  });

  it("(b) 5 tours de la montre → tours de l'athlète gardés ; la proposition donne 12 tours, certains à vérifier", () => {
    const watch = [lap(0, 300), lap(300, 500), lap(500, 600), lap(600, 800), lap(800, 932)];
    const r = lapsForActivity(watch, blocks);
    expect(r.named).toBe(false);
    expect(r.proposalAvailable).toBe(true);
    expect(r.laps.map((l) => [l.startS, l.endS, l.name])).toEqual(watch.map((w) => [w.startS, w.endS, null]));

    const p = proposeLaps(stream, blocks);
    expect(p).toHaveLength(12);
    expect(p.every((l) => l.origin === "agon_proposal" && l.status === "proposed")).toBe(true);
    // Courses retrouvées à quelques secondes près, sûres ; stations enchaînées à vérifier.
    for (let r2 = 0; r2 < 4; r2++) {
      const run = p[r2 * 3];
      const [, a, b] = truth[r2 * 3];
      expect(Math.abs(run.startS - a)).toBeLessThanOrEqual(6);
      expect(Math.abs(run.endS - b)).toBeLessThanOrEqual(6);
      expect(run.needsReview).toBe(false);
      expect(p[r2 * 3 + 1].needsReview).toBe(true);
    }
    expect(p.some((l) => l.needsReview)).toBe(true);
    // Contigus, dans la séance.
    for (let i = 1; i < p.length; i++) expect(p[i].startS).toBe(p[i - 1].endS);
  });

  it("(c) aucune séance prévue → tours de la montre seuls", () => {
    const watch = [lap(0, 400), lap(400, 932)];
    const r = lapsForActivity(watch, null);
    expect(r).toMatchObject({ named: false, proposalAvailable: false });
    expect(r.laps.map((l) => [l.startS, l.endS, l.name, l.origin])).toEqual([[0, 400, null, "watch"], [400, 932, null, "watch"]]);
  });

  it("segments : alternance course / stations", () => {
    expect(segmentStream(stream).map((s) => s.run)).toEqual([true, false, true, false, true, false, true, false]);
  });
});
