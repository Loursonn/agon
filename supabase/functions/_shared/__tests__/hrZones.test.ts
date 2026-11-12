import { describe, expect, it } from "vitest";
import {
  fiveZoneBounds,
  meanZone,
  sampleWeights,
  timeInZones,
  validBounds,
  zoneOf,
  zoneSeries,
  zoneShares,
} from "../domain/hrZones";

describe("zoneOf", () => {
  it("applique Zone 1 < SV1 ≤ Zone 2 < SV2 ≤ Zone 3", () => {
    const b = [152, 172];
    expect(zoneOf(151, b)).toBe(1);
    expect(zoneOf(152, b)).toBe(2);
    expect(zoneOf(171, b)).toBe(2);
    expect(zoneOf(172, b)).toBe(3);
    expect(zoneOf(200, b)).toBe(3);
  });

  it("rend null sans FC ou sans bornes (jamais une zone inventée)", () => {
    expect(zoneOf(null, [152, 172])).toBeNull();
    expect(zoneOf(150, null)).toBeNull();
    expect(zoneOf(150, [])).toBeNull();
  });

  it("colore chaque point", () => {
    expect(zoneSeries([140, null, 180], [152, 172])).toEqual([1, null, 3]);
    expect(zoneSeries(null, [152])).toBeNull();
  });
});

describe("bornes", () => {
  it("modèle 5 zones : bornes hautes FCzone incluses → bornes basses +1", () => {
    const b = fiveZoneBounds({ FCzone_Z1_max: 130, FCzone_Z2_max: 145, FCzone_Z3_max: 160, FCzone_Z4_max: 175 });
    expect(b).toEqual([131, 146, 161, 176]);
    expect(zoneOf(130, b)).toBe(1);
    expect(zoneOf(131, b)).toBe(2);
    expect(zoneOf(176, b)).toBe(5);
  });

  it("refuse un modèle incomplet ou incohérent", () => {
    expect(fiveZoneBounds({ FCzone_Z1_max: 130, FCzone_Z2_max: 145, FCzone_Z3_max: 160 })).toBeNull();
    expect(validBounds([172, 152])).toBeNull();
    expect(validBounds([152, 152])).toBeNull();
    expect(validBounds([10])).toBeNull();
    expect(validBounds([])).toBeNull();
    expect(validBounds([151.6, 172])).toEqual([152, 172]);
  });
});

describe("temps par zone", () => {
  // Même exemple que supabase/tests/hr_zone_models.sql (activity_zone_seconds).
  const stream = {
    t: [0, 1, 2, 3, 13, 14, 15],
    timer: [0, 1, 2, 3, 13, 13, 14],
    hr: [140, 151, 152, 175, 172, 180, null],
  };

  it("poids : écart au suivant, plafonné à 10 s, nul en pause, dernier = 0", () => {
    expect(sampleWeights([0, 1, 2, 3, 30], null)).toEqual([1, 1, 1, 10, 0]);
    expect(sampleWeights(stream.t, stream.timer)).toEqual([1, 1, 1, 10, 0, 1, 0]);
  });

  it("égal au calcul SQL : [2, 1, 11] + 0 s sans FC", () => {
    expect(timeInZones(stream, [152, 172])).toEqual({ seconds: [2, 1, 11], noHrS: 0 });
  });

  it("sur un intervalle [from, to[", () => {
    expect(timeInZones(stream, [152, 172], { fromS: 2, toS: 13 })).toEqual({ seconds: [0, 1, 10], noHrS: 0 });
  });

  it("compte le temps sans FC à part", () => {
    expect(timeInZones({ t: [0, 5, 10], timer: null, hr: [140, null, 150] }, [152])).toEqual({
      seconds: [5, 0],
      noHrS: 5,
    });
  });

  it("null sans bornes ou sans FC", () => {
    expect(timeInZones(stream, null)).toBeNull();
    expect(timeInZones({ ...stream, hr: null }, [152])).toBeNull();
    expect(timeInZones({ t: [0, 1], timer: null, hr: [null, null] }, [152])).toBeNull();
  });

  it("parts et zone moyenne", () => {
    expect(zoneShares({ seconds: [1, 1, 2], noHrS: 0 })).toEqual([25, 25, 50]);
    expect(zoneShares(null)).toBeNull();
    expect(meanZone(160, [152, 172])).toBe(2);
  });
});

describe("modèles 5 et 7 zones", () => {
  it("7 zones depuis FC max et FC repos (Karvonen)", async () => {
    const { sevenZoneBounds } = await import("../domain/hrZones");
    // réserve 195 - 55 = 140 : 55 % → 132, 65 % → 146, 75 % → 160, 82 % → 170, 89 % → 180, 95 % → 188
    expect(sevenZoneBounds(195, 55)).toEqual([132, 146, 160, 170, 180, 188]);
    expect(sevenZoneBounds(200)).toEqual([110, 130, 150, 164, 178, 190]);
    expect(sevenZoneBounds(null)).toBeNull();
  });

  it("5 zones proposées comme l'éditeur historique", async () => {
    const { defaultFiveZoneMaxes } = await import("../domain/hrZones");
    expect(defaultFiveZoneMaxes(200)).toEqual([120, 140, 160, 180, 200]);
    expect(defaultFiveZoneMaxes(195, 55)).toEqual([139, 153, 167, 181, 195]);
  });

  it("nombre et noms de zones", async () => {
    const { zoneCount, zoneNames } = await import("../domain/hrZones");
    expect(zoneCount([152, 172])).toBe(3);
    expect(zoneCount(null)).toBeNull();
    expect(zoneNames(7)).toHaveLength(7);
    expect(zoneNames(4)[3]).toBe("Zone 4");
  });

  it("modèle actif à une date", async () => {
    const { activeModelAt } = await import("../domain/hrZones");
    const rows = [
      { id: "a", status: "active", validFrom: "2026-10-01", createdAt: "1" },
      { id: "b", status: "active", validFrom: "2026-11-12", createdAt: "2" },
      { id: "c", status: "proposed", validFrom: "2026-11-01", createdAt: "3" },
      { id: "d", status: "replaced", validFrom: "2026-09-01", createdAt: "0" },
    ];
    expect(activeModelAt(rows, "2026-11-05")?.id).toBe("a");
    expect(activeModelAt(rows, "2026-11-12")?.id).toBe("b");
    expect(activeModelAt(rows, "2026-09-15")).toBeNull();
  });
});
