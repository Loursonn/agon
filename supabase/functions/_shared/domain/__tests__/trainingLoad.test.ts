import { describe, expect, it } from "vitest";
import {
  exerciseFactor,
  plannedYoxxMinutes,
  pointsFromMinutes,
  ratioZone,
  runYoxxMinutes,
  strengthLoad,
  weekLoad,
  yoxxMinutesFromZoneSeconds,
  yoxxZoneOf,
  type PlanContext,
  type SessionLoad,
  type StrengthSetForLoad,
} from "../trainingLoad";

const sets = (n: number, rir: number, exFactor: number): StrengthSetForLoad[] =>
  Array.from({ length: n }, () => ({ rir, exFactor }));

describe("zones FC du coach → zones YOXX (décision 13/11)", () => {
  it("3 zones telles quelles, 5 et 7 zones par numéro", () => {
    expect([1, 2, 3].map((z) => yoxxZoneOf(z, 3))).toEqual([1, 2, 3]);
    expect([1, 2, 3, 4, 5].map((z) => yoxxZoneOf(z, 5))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2, 3, 4, 5, 6, 7].map((z) => yoxxZoneOf(z, 7))).toEqual([1, 1, 1, 2, 2, 3, 3]);
    expect(yoxxZoneOf(2, 4)).toBeNull();
  });

  it("secondes par zone → minutes YOXX, vide = null", () => {
    expect(yoxxMinutesFromZoneSeconds([600, 1200, 300, 300, 60])).toEqual([30, 10, 1]);
    expect(yoxxMinutesFromZoneSeconds([0, 0, 0])).toBeNull();
    expect(yoxxMinutesFromZoneSeconds(null)).toBeNull();
    expect(yoxxMinutesFromZoneSeconds([60, 60, 60, 60])).toBeNull();
  });
});

describe("musculation", () => {
  it("f(exercice) déduit de la fiche", () => {
    expect(exerciseFactor({ name: "Back squat", isCompound: true, target: "Quads" })).toBe(1.5);
    expect(exerciseFactor({ name: "Soulevé de terre roumain" })).toBe(1.5);
    expect(exerciseFactor({ name: "Fentes marchées haltères" })).toBe(1.5);
    expect(exerciseFactor({ name: "Développé couché", isCompound: true, target: "Pecs" })).toBe(1);
    expect(exerciseFactor({ name: "Tirage horizontal" })).toBe(1);
    expect(exerciseFactor({ name: "Curl biceps", isCompound: false })).toBe(0.5);
    expect(exerciseFactor({ name: "Mollets debout", isCompound: true })).toBe(0.5);
    expect(exerciseFactor({ name: "Gainage planche" })).toBe(0.5);
  });

  it("mardi du prompt : SDP 15 → 90 points", () => {
    const r = strengthLoad([
      ...sets(4, 2, 1.5), ...sets(3, 2, 1.5), ...sets(3, 1, 1.5), ...sets(3, 1, 0.5), ...sets(3, 2, 0.5),
    ]);
    expect(r?.sdp).toBeCloseTo(15, 6);
    expect(r?.points).toBeCloseTo(90, 6);
  });

  it("RIR : saisi, sinon prévu, sinon 0,75 signalé ; échauffement et RIR > 5 à 0", () => {
    const r = strengthLoad([
      { rir: null, plannedRir: 4, exFactor: 1 },
      { exFactor: 1 },
      { rir: 6, exFactor: 1 },
      { rir: 0, exFactor: 1, warmup: true },
    ]);
    expect(r?.sdp).toBeCloseTo(0.4 + 0.75, 6);
    expect(r?.missingRir).toBe(1);
    expect(strengthLoad([])).toBeNull();
  });
});

describe("course : tours à l'allure ou à la FC", () => {
  // 20 min à 10 km/h FC 140, 4 min à 15 km/h FC 175, 4 min à 13 km/h FC 165.
  const t: number[] = [], hr: number[] = [], dist: number[] = [];
  let d = 0;
  const seg = (s: number, kmh: number, bpm: number) => {
    for (let i = 0; i < s; i++) {
      t.push(t.length);
      hr.push(bpm);
      dist.push(d);
      d += kmh / 3.6;
    }
  };
  seg(1200, 10, 140); seg(240, 15, 175); seg(240, 13, 165);
  t.push(t.length); hr.push(165); dist.push(d);
  const stream = { t, timer: null, hr, dist };
  const laps = [{ startS: 0, endS: 1200 }, { startS: 1200, endS: 1440 }, { startS: 1440, endS: 1681 }];

  it("tour plus rapide que le seuil 1 : classé à l'allure (Z3 au-delà de la VC)", () => {
    const m = runYoxxMinutes(stream, laps, [150, 170], { s1Kmh: 12, csKmh: 14 });
    expect(m?.[0]).toBeCloseTo(20, 1);
    expect(m?.[1]).toBeCloseTo(241 / 60, 1);
    expect(m?.[2]).toBeCloseTo(4, 1);
  });

  it("sans VC : tout à la FC", () => {
    const m = runYoxxMinutes(stream, laps, [150, 170], { s1Kmh: null, csKmh: null });
    expect(m?.[2]).toBeCloseTo(4, 1);
    expect(m?.[1]).toBeCloseTo(4, 1);
  });

  it("ni bornes ni VC : null", () => {
    expect(runYoxxMinutes(stream, laps, null, { s1Kmh: null, csKmh: null })).toBeNull();
  });
});

describe("prévu", () => {
  const ctx: PlanContext = { mixed: false, bounds: [150, 170], fcmax: 190, speedRefs: { VMA: 18 }, s1Kmh: 12, csKmh: 14 };

  it("6 × (400 m à 100 % VMA + 1' récup) avec échauffement 15' Z1", () => {
    const m = plannedYoxxMinutes(
      [
        { type: "interval", role: "warmup", duration: { kind: "time", value: 900 }, target: { kind: "hr_zone", zone: 1 } },
        {
          type: "group", role: "work", repeat: 6, children: [
            { type: "interval", role: "work", duration: { kind: "distance", value: 400 }, target: { kind: "pace_test_pct", test_metric: "VMA", min: 100, max: 100 } },
            { type: "interval", role: "recovery", duration: { kind: "time", value: 60 }, target: { kind: "none" } },
          ],
        },
      ],
      ctx,
    );
    // 400 m à 18 km/h = 80 s ; ×6 = 8 min en Z3. Z1 = 15 + 6.
    expect(m?.[0]).toBeCloseTo(21, 6);
    expect(m?.[2]).toBeCloseTo(8, 6);
    expect(pointsFromMinutes(m!)).toBeCloseTo(21 + 24, 6);
  });

  it("séance mixte : stations en Z3, effort sans cible en Z2", () => {
    const m = plannedYoxxMinutes(
      [{ type: "group", repeat: 4, children: [
        { type: "exercise", role: "work", duration: { kind: "time", value: 120 } },
        { type: "interval", role: "work", duration: { kind: "time", value: 300 } },
      ] }],
      { ...ctx, mixed: true },
    );
    expect(m).toEqual([0, 20, 8]);
  });

  it("aucune durée chiffrable : null", () => {
    expect(plannedYoxxMinutes([{ type: "interval", role: "work", duration: { kind: "lap_button" } }], ctx)).toBeNull();
    expect(plannedYoxxMinutes([], ctx)).toBeNull();
  });
});

describe("semaine (exemple chiffré du prompt d'Hugo, 07/11)", () => {
  const S = (id: string, day: string, focus: SessionLoad["focus"], done: number, extra: Partial<SessionLoad> = {}): SessionLoad => ({
    id, day, label: id, focus, planned: null, done, ...extra,
  });
  const sessions: SessionLoad[] = [
    S("lun", "2026-11-02", "endurance", 82, { minutes: [40, 3, 12], km: 9 }),
    S("mar", "2026-11-03", "strength", 90),
    S("mer-endu", "2026-11-04", "endurance", 50, { minutes: [50, 0, 0], km: 9 }),
    S("mer-salle", "2026-11-04", "strength", 72),
    S("jeu", "2026-11-05", "mixed", 125, { minutes: [20, 15, 25], km: 6, compromisedKm: 4 }),
    S("sam", "2026-11-07", "endurance", 80, { minutes: [70, 5, 0], km: 13 }),
    S("dim", "2026-11-08", "endurance", 45, { minutes: [45, 0, 0] }),
  ];
  sessions[0].planned = 530;
  const w = weekLoad({
    from: "2026-11-02", sessions, previousWeeks: [515, 400, 480, 450], previousWeekKm: 35, longestRun30dKm: 12,
  });

  it("charge, écart, chronique, variation", () => {
    expect(w.done).toBe(544);
    expect(w.gapPct).toBeCloseTo(2.6, 1);
    expect(w.chronic).toBeCloseTo(461.25, 6);
    expect(w.variationPct).toBeCloseTo(5.6, 1);
    expect(w.ratio).toBeCloseTo(544 / 461.25, 6);
    expect(ratioZone(w.ratio)).toBe("in");
  });

  it("monotonie (n − 1), contrainte, séance la plus coûteuse", () => {
    expect(w.monotony).toBeCloseTo(1.78, 2);
    expect(w.strain).toBeCloseTo(967, -1);
    expect(w.top).toMatchObject({ id: "jeu", points: 125, sharePct: 23 });
  });

  it("km, part de Zone 1, plafond", () => {
    expect(w.km).toEqual({ total: 37, compromised: 4, other: 33 });
    expect(w.kmVariationPct).toBeCloseTo(5.7, 1);
    expect(w.z1SharePct).toBeCloseTo(91.1, 1);
    expect(w.ceilingKm).toBeCloseTo(13.2, 6);
  });

  it("contre-exemple 2 : même charge étalée → monotonie > 2", () => {
    const flat = [80, 78, 80, 76, 78, 76, 76].map((p, i) => S(`d${i}`, `2026-11-0${2 + i}`, "endurance", p));
    expect(weekLoad({ from: "2026-11-02", sessions: flat, previousWeeks: [] }).monotony).toBeGreaterThan(2);
  });

  it("sans historique : chronique, ratio et variation absents (« — »)", () => {
    const r = weekLoad({ from: "2026-11-02", sessions: [], previousWeeks: [500] });
    expect(r.chronic).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.planned).toBeNull();
    expect(r.monotony).toBeNull();
    expect(ratioZone(null)).toBeNull();
  });
});
