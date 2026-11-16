import { describe, expect, it } from "vitest";
import { hrCurve } from "../hrCurve";

describe("mini-courbe FC", () => {
  it("sans série ou sans FC : rien", () => {
    expect(hrCurve(null)).toBeNull();
    expect(hrCurve({ t: [0, 1, 2], hr: null })).toBeNull();
    expect(hrCurve({ t: [0, 1, 2], hr: [null, 0, null] })).toBeNull();
  });

  it("réduit la série et garde moyenne, max, min sur toutes les secondes", () => {
    const t = Array.from({ length: 3600 }, (_, i) => i);
    const hr = t.map((s) => (s < 1800 ? 140 : 170));
    const c = hrCurve({ t, hr }, 120)!;
    expect(c.points).toHaveLength(120);
    expect(c.avgHr).toBe(155);
    expect(c.maxHr).toBe(170);
    expect(c.minHr).toBe(140);
    expect(c.durationS).toBe(3599);
    expect(c.points[0].hr).toBe(140);
    expect(c.points[119].hr).toBe(170);
  });

  it("un trou de capteur reste un trou, jamais 0", () => {
    const t = Array.from({ length: 100 }, (_, i) => i);
    const hr = t.map((s) => (s >= 40 && s < 60 ? null : 150));
    const c = hrCurve({ t, hr }, 10)!;
    expect(c.points[4].hr).toBeNull();
    expect(c.points[5].hr).toBeNull();
    expect(c.points.filter((p) => p.hr === 0)).toHaveLength(0);
  });

  it("série plus courte que le nombre de points : un point par échantillon", () => {
    const c = hrCurve({ t: [0, 10, 20], hr: [120, 130, 140] }, 240)!;
    expect(c.points).toHaveLength(3);
    expect(c.avgHr).toBe(130);
  });
});
