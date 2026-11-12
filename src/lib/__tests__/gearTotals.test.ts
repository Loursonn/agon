import { describe, expect, it } from "vitest";
import { gearTotals } from "@/lib/gearTotals";

describe("gearTotals", () => {
  it("cumule les km par paire, casse et espaces confondus, plus récente d'abord", () => {
    const totals = gearTotals([
      { gear: "Pegasus 40", distanceM: 10000, localDate: "2026-09-01" },
      { gear: "pegasus  40 ", distanceM: 12000, localDate: "2026-10-01" },
      { gear: "Vélo route", distanceM: 60000, localDate: "2026-08-01" },
      { gear: null, distanceM: 5000, localDate: "2026-10-02" },
      { gear: "Pegasus 40", distanceM: null, localDate: "2026-10-03" },
    ]);
    expect(totals).toEqual([
      { name: "Pegasus 40", distanceM: 22000, outings: 3, firstDate: "2026-09-01", lastDate: "2026-10-03" },
      { name: "Vélo route", distanceM: 60000, outings: 1, firstDate: "2026-08-01", lastDate: "2026-08-01" },
    ]);
  });

  it("aucun matériel : liste vide", () => {
    expect(gearTotals([{ gear: "", distanceM: 1, localDate: "2026-01-01" }])).toEqual([]);
  });
});
