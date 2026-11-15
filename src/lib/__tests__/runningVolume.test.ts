import { describe, it, expect } from "vitest";
import { computeRunningVolume, RUNNING_WEEKS, weekDetail } from "@/lib/runningVolume";
import type { RunOuting } from "@/lib/watchRunMatching";

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
    const v = computeRunningVolume([{ date: "2026-07-27", km: 7 }], NOW);
    expect(v.weeks).toHaveLength(RUNNING_WEEKS);
    expect(v.weeks[RUNNING_WEEKS - 1].monday).toBe("2026-10-12");
    expect(v.weeks[0].monday).toBe("2026-07-27");
    expect(v.weeks[0].km).toBe(7);
  });
});

describe("attribution des km de montre", () => {
  it("nomme « Garmin [modèle] » quand des km Garmin sont comptés", () => {
    const v = computeRunningVolume([
      { date: "2026-10-12", km: 8, source: "watch", provider: "garmin", device: "Forerunner 265" },
      { date: "2026-10-13", km: 6, source: "watch", provider: "garmin", device: "Garmin Forerunner 265" },
      { date: "2026-10-14", km: 5, source: "manual" },
    ], NOW);
    expect(v.watchOrigins).toEqual(["Garmin Forerunner 265"]);
  });

  it("n'invente pas d'appareil quand le modèle est inconnu", () => {
    const v = computeRunningVolume([
      { date: "2026-10-12", km: 8, source: "watch", provider: "garmin", device: null },
    ], NOW);
    expect(v.watchOrigins).toEqual(["Garmin"]);
  });
});

describe("weekDetail", () => {
  const o = (date: string, km: number, extra: Partial<RunOuting> = {}): RunOuting => ({
    date, km, source: "watch", key: `${date}-${km}`, origin: "activity", label: null, activityId: null,
    sport: "running", startedAt: null, durationS: null, elevationGainM: null, paceSPerKm: null, ...extra,
  });

  it("total, écart avec la semaine précédente et sorties dans l'ordre", () => {
    const w = weekDetail([
      o("2026-10-05", 10), o("2026-10-07", 10),           // semaine précédente : 20 km
      o("2026-10-12", 8, { durationS: 2400, elevationGainM: 30 }),
      o("2026-10-18", 15, { durationS: 5400 }),
      o("2026-10-19", 99),                                 // lundi suivant : hors semaine
    ], [
      { id: "v", source: "garmin", localDate: "2026-10-14", startedAt: "2026-10-14T08:00:00Z", sport: "cycling", distanceM: 30_000, durationS: 3600 },
    ], "2026-10-12");
    expect(w.sunday).toBe("2026-10-18");
    expect(w.runs.map((r) => r.km)).toEqual([8, 15]);
    expect(w.km).toBe(23);
    expect(w.prevKm).toBe(20);
    expect(w.deltaKm).toBe(3);
    expect(w.deltaPct).toBe(15);
    expect(w.durationS).toBe(7800);
    expect(w.elevationGainM).toBe(30);
    expect(w.others.map((a) => a.id)).toEqual(["v"]);
  });

  it("rien à comparer : écart absent, jamais 0 ; mesures inconnues : null", () => {
    const w = weekDetail([], [], "2026-10-12");
    expect(w.km).toBe(0);
    expect(w.deltaKm).toBeNull();
    expect(w.deltaPct).toBeNull();
    expect(w.durationS).toBeNull();
    expect(w.elevationGainM).toBeNull();
  });

  it("semaine précédente vide : écart en km, pas de pourcentage", () => {
    const w = weekDetail([o("2026-10-13", 5)], [], "2026-10-12");
    expect(w.deltaKm).toBe(5);
    expect(w.deltaPct).toBeNull();
  });
});
