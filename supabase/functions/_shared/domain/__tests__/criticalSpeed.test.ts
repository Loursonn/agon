import { describe, expect, it } from "vitest";
import {
  bestDistanceOver,
  bestRunEfforts,
  chooseCriticalSpeed,
  criticalSpeedFromRuns,
  fitCriticalSpeed,
  s1SpeedKmh,
  type RunStream,
} from "../criticalSpeed";

/** Sortie à vitesse constante par morceaux : [durée s, vitesse m/s][]. */
function run(parts: Array<[number, number]>): RunStream {
  const t: number[] = [0];
  const dist: number[] = [0];
  for (const [dur, v] of parts) {
    for (let i = 0; i < dur; i++) {
      t.push(t[t.length - 1] + 1);
      dist.push(dist[dist.length - 1] + v);
    }
  }
  return { t, dist };
}

describe("fitCriticalSpeed", () => {
  it("retrouve VC et D′ d'efforts exacts (d = VC·t + D′)", () => {
    // VC 4 m/s (14,4 km/h), D′ 200 m.
    const fit = fitCriticalSpeed([180, 360, 720].map((t) => ({ t, d: 4 * t + 200 })));
    expect(fit?.csKmh).toBeCloseTo(14.4, 6);
    expect(fit?.dprimeM).toBeCloseTo(200, 6);
    expect(fit?.r2).toBeCloseTo(1, 6);
    expect(fit?.n).toBe(3);
  });

  it("moins de deux durées différentes : null", () => {
    expect(fitCriticalSpeed([{ t: 300, d: 1500 }])).toBeNull();
    expect(fitCriticalSpeed([{ t: 300, d: 1500 }, { t: 300, d: 1400 }])).toBeNull();
    expect(fitCriticalSpeed([])).toBeNull();
  });

  it("pente nulle ou négative : null", () => {
    expect(fitCriticalSpeed([{ t: 180, d: 1000 }, { t: 720, d: 900 }])).toBeNull();
  });
});

describe("meilleurs efforts dans les sorties", () => {
  it("trouve le passage le plus rapide de la durée demandée", () => {
    // 10 min à 3 m/s, 3 min à 5 m/s, 10 min à 3 m/s.
    const s = run([[600, 3], [180, 5], [600, 3]]);
    expect(bestDistanceOver(s, 180)).toBeCloseTo(900, 6);
    // 6 min : les 3 min rapides + 3 min à 3 m/s.
    expect(bestDistanceOver(s, 360)).toBeCloseTo(900 + 540, 6);
  });

  it("sortie trop courte ou sans distance : null", () => {
    expect(bestDistanceOver(run([[100, 4]]), 180)).toBeNull();
    expect(bestDistanceOver({ t: [0, 1, 2], dist: [null, null, null] }, 1)).toBeNull();
  });

  it("une pause de plus de 10 s casse la fenêtre", () => {
    const a = run([[100, 5]]);
    const b = run([[100, 5]]);
    const joined: RunStream = {
      t: [...a.t, ...b.t.map((x) => x + 200)],
      dist: [...a.dist, ...b.dist.map((x) => (x as number) + 500)],
    };
    expect(bestDistanceOver(joined, 150)).toBeNull();
  });

  it("ignore un saut GPS (vitesse impossible)", () => {
    const s = run([[400, 4]]);
    const dist = [...s.dist] as number[];
    for (let i = 100; i < dist.length; i++) dist[i] += 5000;
    expect(bestDistanceOver({ t: s.t, dist }, 180)).toBeCloseTo(720, 6);
  });

  it("VC depuis plusieurs sorties : meilleur effort de chaque durée", () => {
    // Coureur « idéal » : VC 4 m/s, D′ 180 m → v(t) = 4 + 180 / t.
    const v = (t: number) => 4 + 180 / t;
    const streams = [run([[600, 2.8], [180, v(180)], [300, 2.8]]), run([[300, 2.8], [360, v(360)], [300, 2.8]]), run([[720, v(720)]])];
    expect(bestRunEfforts(streams).map((p) => Math.round(p.d))).toEqual([900, 1620, 3060]);
    const fit = criticalSpeedFromRuns(streams);
    expect(fit?.csKmh).toBeCloseTo(14.4, 1);
    expect(fit?.dprimeM).toBeCloseTo(180, 0);
  });

  it("une seule durée trouvée : pas de VC", () => {
    expect(criticalSpeedFromRuns([run([[200, 4]])])).toBeNull();
  });
});

describe("chooseCriticalSpeed (décision d'Hugo, 13/11)", () => {
  it("la plus récente entre test et saisie ; la saisie gagne le même jour", () => {
    const r = chooseCriticalSpeed([
      { source: "test", day: "2026-10-01", csKmh: 14 },
      { source: "reference", day: "2026-11-01", csKmh: 14.5 },
      { source: "test", day: "2026-11-01", csKmh: 15 },
    ]);
    expect(r.current).toMatchObject({ source: "reference", csKmh: 14.5 });
  });

  it("la VC des courses n'est qu'une proposition, si elle diffère assez", () => {
    const base = { source: "test" as const, day: "2026-11-01", csKmh: 14 };
    expect(chooseCriticalSpeed([base, { source: "runs", day: "2026-11-13", csKmh: 14.6 }]).proposal?.csKmh).toBe(14.6);
    expect(chooseCriticalSpeed([base, { source: "runs", day: "2026-11-13", csKmh: 14.1 }]).proposal).toBeNull();
    // Sans test ni saisie : proposée, jamais retenue.
    const only = chooseCriticalSpeed([{ source: "runs", day: "2026-11-13", csKmh: 14.6 }]);
    expect(only.current).toBeNull();
    expect(only.proposal?.csKmh).toBe(14.6);
  });

  it("rien : tout null (affiché « — »)", () => {
    expect(chooseCriticalSpeed([])).toEqual({ current: null, proposal: null });
    expect(s1SpeedKmh(null)).toBeNull();
  });

  it("seuil 1 : celui du test, sinon VC × 0,84", () => {
    expect(s1SpeedKmh({ source: "test", day: "2026-11-01", csKmh: 15, s1Kmh: 12.6 })).toBe(12.6);
    expect(s1SpeedKmh({ source: "reference", day: "2026-11-01", csKmh: 15 })).toBeCloseTo(12.6, 6);
  });
});
