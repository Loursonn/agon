import { describe, expect, it } from "vitest";
import { emptyStream, type ActivityStream, type WatchLap } from "../activityFiles/stream";
import {
  activityMetrics,
  elevationGainLoss,
  lapMetrics,
  plausibleSpeeds,
  smoothSeries,
  smoothedAltitude,
} from "../domain/lapMetrics";

/** Série fictive : n secondes, valeurs données par fonction de t. */
function stream(n: number, f: Partial<Record<keyof ActivityStream, (t: number) => number | null>>): ActivityStream {
  const s = emptyStream();
  s.t = Array.from({ length: n }, (_, i) => i);
  for (const [k, fn] of Object.entries(f)) {
    (s as unknown as Record<string, Array<number | null>>)[k] = s.t.map((t) => fn!(t));
  }
  return s;
}

describe("dénivelé (calibration, données fictives)", () => {
  it("baromètre qui oscille de 0,2 m sur du plat : 0 m (la somme brute en donnait des dizaines)", () => {
    const alt = Array.from({ length: 1800 }, (_, i) => 50 + (i % 2 === 0 ? 0 : 0.2) + (i % 7 === 0 ? 0.2 : 0));
    const raw = alt.slice(1).reduce((a, v, i) => a + Math.max(0, v - alt[i]), 0);
    expect(raw).toBeGreaterThan(100);
    const r = elevationGainLoss(smoothSeries(alt, 2));
    expect(r).toEqual({ ascentM: 0, descentM: 0 });
  });

  it("montée de 5 m bruitée puis redescente de 4 m : sous-estime d'au plus un seuil par changement de pente", () => {
    const alt: number[] = [];
    for (let i = 0; i < 300; i++) alt.push(50 + (5 * i) / 300 + (i % 2 ? 0.2 : 0));
    for (let i = 0; i < 300; i++) alt.push(55 - (4 * i) / 300 + (i % 2 ? 0.2 : 0));
    const r = elevationGainLoss(smoothSeries(alt, 2))!;
    expect(r.ascentM).toBeGreaterThanOrEqual(4);
    expect(r.ascentM).toBeLessThanOrEqual(5);
    expect(r.descentM).toBeGreaterThanOrEqual(2);
    expect(r.descentM).toBeLessThanOrEqual(4);
  });

  it("null sans altitude", () => {
    expect(elevationGainLoss([null, null])).toBeNull();
  });
});

describe("allure max (garde-fou saut GPS)", () => {
  it("ignore un pic isolé et une vitesse impossible à pied", () => {
    expect(plausibleSpeeds([3, 3.1, 9.5, 3.2, 13, 3], "running")).toEqual([3, 3.1, null, 3.2, null, 3]);
  });
  it("garde une accélération réelle (sprint tenu)", () => {
    expect(plausibleSpeeds([3, 5, 6.354, 6.3, 6], "running")).toEqual([3, 5, 6.354, 6.3, 6]);
  });
  it("vélo : 15 m/s reste plausible", () => {
    expect(plausibleSpeeds([14, 15, 14.5], "cycling")).toEqual([14, 15, 14.5]);
  });
});

describe("lapMetrics", () => {
  // 600 s de course à 3,333 m/s (5'00/km), FC 140 puis 160, 1 sprint à 6,354.
  const s = stream(600, {
    speed: (t) => (t === 400 ? 6.354 : t === 401 ? 6.2 : 10 / 3),
    dist: (t) => Math.round((t * 10) / 3),
    hr: (t) => (t < 300 ? 140 : 160),
    cadence: (t) => (t < 5 ? 0 : 170),
    alt: () => 50,
  });
  const ctx = { sport: "running", bounds: [152, 172] };

  it("calcule temps, distance, allures, FC, cadence, zones", () => {
    const m = lapMetrics(s, { startS: 0, endS: 300 }, ctx);
    expect(m.durationS).toBe(300);
    expect(m.distanceM).toBe(1000); // jusqu'au point de fin du tour (300 s)
    expect(m.avgPaceSPerKm).toBe(300);
    expect(m.avgHr).toBe(140);
    expect(m.meanZone).toBe(1);
    expect(m.avgCadence).toBe(170); // les 0 (arrêt) ne comptent pas
    expect(m.timeInZones).toEqual({ seconds: [300, 0, 0], noHrS: 0 });
    expect(m.ascentM).toBe(0);
    expect(m.source).toBe("computed");
  });

  it("allure max = vitesse seconde par seconde la plus haute", () => {
    const m = lapMetrics(s, { startS: 300, endS: 600 }, ctx);
    expect(m.maxSpeed).toBe(6.354);
    expect(m.maxPaceSPerKm).toBe(157);
    expect(m.meanZone).toBe(2);
  });

  it("distance corrigée à la main prioritaire", () => {
    const m = lapMetrics(s, { startS: 0, endS: 300, distanceOverrideM: 1000 }, ctx);
    expect(m.distanceM).toBe(1000);
    expect(m.avgPaceSPerKm).toBe(300);
  });

  it("tour de la montre : valeurs de la montre, zones d'Agon", () => {
    const watchLaps: WatchLap[] = [{
      startS: 0, endS: 300, trigger: "manual", intensity: null,
      watch: {
        timerS: 300, elapsedS: 300, distanceM: 1000, avgSpeed: 3.333, maxSpeed: 3.5, avgHr: 141, maxHr: 150,
        avgCadence: 172, maxCadence: 180, avgPower: null, maxPower: null, ascentM: 2, descentM: 1, minAltM: 49, maxAltM: 51,
      },
    }];
    const m = lapMetrics(s, { startS: 0, endS: 300 }, { ...ctx, watchLaps });
    expect(m.source).toBe("watch");
    expect(m.distanceM).toBe(1000);
    expect(m.avgHr).toBe(141);
    expect(m.ascentM).toBe(2);
    expect(m.avgPower).toBeNull();
    expect(m.timeInZones).toEqual({ seconds: [300, 0, 0], noHrS: 0 });
  });

  it("station HYROX : pas d'allure ni de distance GPS", () => {
    const m = lapMetrics(s, { startS: 0, endS: 120, isStation: true }, ctx);
    expect(m.avgPaceSPerKm).toBeNull();
    expect(m.maxSpeed).toBeNull();
    expect(m.distanceM).toBeNull();
    expect(m.avgHr).toBe(140);
  });

  it("pause : temps chronométré < temps écoulé", () => {
    const p = stream(100, { hr: () => 150 });
    p.timer = p.t.map((t) => (t < 40 ? t : t < 60 ? 40 : t - 20));
    const m = lapMetrics(p, { startS: 0, endS: 100 }, ctx);
    expect(m.elapsedS).toBe(100);
    expect(m.durationS).toBe(79);
  });

  it("mesures absentes → null, jamais 0", () => {
    const m = lapMetrics(stream(10, {}), { startS: 0, endS: 10 }, ctx);
    expect([m.distanceM, m.avgHr, m.maxSpeed, m.ascentM, m.avgCadence, m.meanZone, m.timeInZones]).toEqual(
      [null, null, null, null, null, null, null],
    );
  });

  it("séance entière", () => {
    const m = activityMetrics(s, { ...ctx, smoothedAlt: smoothedAltitude(s) })!;
    expect(m.durationS).toBe(599);
    expect(m.maxSpeed).toBe(6.354);
    expect(m.timeInZones!.seconds).toEqual([300, 299, 0]);
  });
});
