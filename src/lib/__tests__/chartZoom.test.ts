import { describe, expect, it } from "vitest";
import { centerWindow, panWindow, wheelFactor, windowFromSelection, zoomAround, zoomLevel } from "@/lib/chartZoom";

const full = { startS: 0, endS: 3600 };

describe("zoom du graphique", () => {
  it("zoom autour d'un instant : il reste sous le curseur", () => {
    const z = zoomAround(null, full, 4, 1800)!;
    expect(z).toEqual({ startS: 1350, endS: 2250 });
    const z2 = zoomAround(null, full, 2, 900)!;
    // 900 était au quart de l'écran, il y reste.
    expect((900 - z2.startS) / (z2.endS - z2.startS)).toBeCloseTo(0.25);
  });

  it("borné : 20 s au plus près, toute la séance au plus loin (null)", () => {
    expect(zoomAround({ startS: 100, endS: 130 }, full, 10, 115)).toEqual({ startS: 105, endS: 125 });
    expect(zoomAround({ startS: 0, endS: 2000 }, full, 0.5, 1000)).toBeNull();
    // Ne sort pas de la séance.
    expect(zoomAround({ startS: 3000, endS: 3600 }, full, 0.5, 3600)).toEqual({ startS: 2400, endS: 3600 });
    expect(zoomAround({ startS: 3300, endS: 3600 }, full, 0.5, 3400)!.endS).toBe(3600);
  });

  it("déplacer, recentrer", () => {
    expect(panWindow({ startS: 100, endS: 200 }, full, 50)).toEqual({ startS: 150, endS: 250 });
    expect(panWindow({ startS: 100, endS: 200 }, full, -500)).toEqual({ startS: 0, endS: 100 });
    expect(panWindow(null, full, 50)).toBeNull();
    expect(centerWindow({ startS: 0, endS: 600 }, full, 3500)).toEqual({ startS: 3000, endS: 3600 });
  });

  it("plage sélectionnée à la souris", () => {
    expect(windowFromSelection(900, 300, full)).toEqual({ startS: 300, endS: 900 });
    expect(windowFromSelection(100, 110, full)).toEqual({ startS: 95, endS: 115 });
    expect(windowFromSelection(100, 101, full)).toBeNull();
    expect(windowFromSelection(-50, 5000, full)).toBeNull();
  });

  it("molette : vers le haut rapproche ; grossissement affiché", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-10000)).toBeCloseTo(wheelFactor(-300));
    expect(zoomLevel(null, full)).toBe(1);
    expect(zoomLevel({ startS: 0, endS: 900 }, full)).toBe(4);
  });
});
