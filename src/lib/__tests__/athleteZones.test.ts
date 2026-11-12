import { describe, expect, it } from "vitest";
import { restingHrAverage, zoneBarScale, zoneRows } from "../athleteZones";

describe("athleteZones", () => {
  it("FC de repos : moyenne des 7 dernières nuits renseignées", () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, "0")}`, restingHr: i === 9 ? null : 40 + i, attribution: "Garmin" }));
    expect(restingHrAverage(days)).toEqual({ bpm: 45, nights: 7, source: "Garmin" }); // 42..48
    expect(restingHrAverage([])).toBeNull();
  });

  it("zones 3 : libellés et plages de la planche", () => {
    expect(zoneRows([152, 172], 194)).toEqual([
      { zone: 1, label: "Facile · sous SV1", range: "moins de 152" },
      { zone: 2, label: "Moyen · SV1 → SV2", range: "152 – 171" },
      { zone: 3, label: "Dur · SV2 et plus", range: "172 – 194" },
    ]);
    expect(zoneRows([152, 172], null)[2].range).toBe("172 et plus");
    expect(zoneRows([134, 152, 166, 178], 194).map((z) => z.label)).toEqual(["Récupération", "Endurance", "Tempo", "Seuil", "Maximal"]);
  });

  it("barre : 100 bpm → FC max", () => {
    const s = zoneBarScale([152, 172], 194);
    expect(s.at(152)).toBeCloseTo(55.32, 1);
    expect(s.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });
});
