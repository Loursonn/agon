import { describe, it, expect } from "vitest";
import { computeRunningVolume, RUNNING_WEEKS } from "@/lib/runningVolume";

// Jeudi 15 octobre 2026 → semaine du lundi 12
const NOW = new Date(2026, 9, 15, 10);

describe("computeRunningVolume", () => {
  it("somme semaine calendaire, 7 jours glissants et semaine précédente", () => {
    const v = computeRunningVolume([
      { date: "2026-10-12", km: 8 },    // lundi semaine en cours
      { date: "2026-10-15", km: 5.5 },  // aujourd'hui
      { date: "2026-10-18", km: 12 },   // dimanche à venir (semaine en cours)
      { date: "2026-10-09", km: 10 },   // vendredi dernier : semaine passée + glissant
      { date: "2026-10-08", km: 3 },    // jeudi dernier : hors 7 j glissants
    ], NOW);
    expect(v.weekKm).toBe(25.5);
    expect(v.rolling7Km).toBe(23.5); // 9 → 15 oct
    expect(v.lastWeekKm).toBe(13);
  });

  it("renvoie RUNNING_WEEKS semaines, la plus récente en dernier", () => {
    const v = computeRunningVolume([{ date: "2026-08-24", km: 7 }], NOW);
    expect(v.weeks).toHaveLength(RUNNING_WEEKS);
    expect(v.weeks[RUNNING_WEEKS - 1].monday).toBe("2026-10-12");
    expect(v.weeks[0].monday).toBe("2026-08-24");
    expect(v.weeks[0].km).toBe(7);
  });
});
