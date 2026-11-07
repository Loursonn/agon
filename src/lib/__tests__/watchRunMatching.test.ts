import { describe, it, expect } from "vitest";
import {
  buildRunLedger,
  dedupeActivities,
  isPlannedRun,
  isRunningSport,
  kmByMonth,
  matchCost,
  summarizeKm,
  type PlannedSessionInput,
  type WatchActivityInput,
} from "@/lib/watchRunMatching";
import { computeRunningVolume } from "@/lib/runningVolume";
import { watchRunMeasure, watchRunText } from "@/lib/watchRunLabel";

const act = (o: Partial<WatchActivityInput> & { id: string }): WatchActivityInput => ({
  source: "coros",
  localDate: "2026-11-03",
  startedAt: "2026-11-03T07:00:00Z",
  sport: "running",
  distanceM: 10_000,
  durationS: 3000,
  ...o,
});

const planned = (o: Partial<PlannedSessionInput> & { id: string }): PlannedSessionInput => ({
  date: "2026-11-03",
  status: "planned",
  activityType: null,
  sessionKind: "footing",
  label: "Footing",
  plannedDistanceM: 10_000,
  plannedDurationS: 3000,
  manualKm: null,
  manualDurationMin: null,
  ...o,
});

describe("isRunningSport", () => {
  it("reconnaît la course, le trail, le tapis, quelle que soit l'écriture", () => {
    for (const s of ["running", "trail_running", "treadmill_running", "track_running", "TRAIL_RUNNING", "Indoor Running", "virtual_run"]) {
      expect(isRunningSport(s), s).toBe(true);
    }
  });
  it("écarte la marche, la rando, le vélo, le fauteuil et le sport inconnu", () => {
    for (const s of ["walking", "hiking", "cycling", "wheelchair_push_run", "training", "sport_62", null, ""]) {
      expect(isRunningSport(s), String(s)).toBe(false);
    }
  });
});

describe("isPlannedRun", () => {
  it("non validée : décidé par le type de séance", () => {
    expect(isPlannedRun(planned({ id: "a", sessionKind: "vo2" }))).toBe(true);
    expect(isPlannedRun(planned({ id: "a", sessionKind: "specifique" }))).toBe(false);
    expect(isPlannedRun(planned({ id: "a", sessionKind: "autre" }))).toBe(false);
  });
  it("validée : l'activité déclarée l'emporte", () => {
    expect(isPlannedRun(planned({ id: "a", sessionKind: "specifique", activityType: "course" }))).toBe(true);
    expect(isPlannedRun(planned({ id: "a", sessionKind: "footing", activityType: "velo" }))).toBe(false);
  });
  it("une séance passée (skipped) n'est jamais rattachée", () => {
    expect(isPlannedRun(planned({ id: "a", status: "skipped" }))).toBe(false);
  });
});

describe("matchCost", () => {
  it("0 si identiques, 1 si rien de comparable", () => {
    expect(matchCost(act({ id: "x" }), { distanceM: 10_000, durationS: 3000 })).toBe(0);
    expect(matchCost(act({ id: "x", distanceM: null, durationS: null }), { distanceM: 10_000, durationS: 3000 })).toBe(1);
  });
});

describe("dedupeActivities", () => {
  it("garde la copie de la montre quand un fichier de la même sortie a été importé", () => {
    const { kept, duplicateIds } = dedupeActivities([
      act({ id: "file", source: "file_import", startedAt: "2026-11-03T07:00:40Z" }),
      act({ id: "watch", source: "coros" }),
    ]);
    expect(kept.map((a) => a.id)).toEqual(["watch"]);
    expect(duplicateIds).toEqual(["file"]);
  });
  it("deux sorties à plus de deux minutes d'écart restent deux sorties", () => {
    const { kept } = dedupeActivities([
      act({ id: "a" }),
      act({ id: "b", startedAt: "2026-11-03T07:03:00Z" }),
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe("buildRunLedger — rattachement", () => {
  it("rattache la sortie de montre à la séance prévue du même jour", () => {
    const l = buildRunLedger({ activities: [act({ id: "w1", distanceM: 10_200 })], planned: [planned({ id: "p1" })] });
    expect(l.matches).toHaveLength(1);
    expect(l.matches[0]).toMatchObject({ plannedId: "p1", activityId: "w1", watchKm: 10.2, countedKm: 10.2, countedSource: "watch" });
    expect(l.entries).toEqual([{ date: "2026-11-03", km: 10.2, source: "watch" }]);
  });

  it("ne rattache pas un autre jour, ni un autre sport", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1", localDate: "2026-11-04" }), act({ id: "bike", sport: "cycling" })],
      planned: [planned({ id: "p1" })],
    });
    expect(l.matches).toHaveLength(0);
    // La sortie du lendemain compte quand même ; le vélo, non.
    expect(l.entries).toEqual([{ date: "2026-11-04", km: 10, source: "watch" }]);
  });

  it("deux sorties, deux séances le même jour : chacune à la plus proche, une seule fois", () => {
    const l = buildRunLedger({
      activities: [
        act({ id: "matin", startedAt: "2026-11-03T06:00:00Z", distanceM: 5_100, durationS: 1800 }),
        act({ id: "soir", startedAt: "2026-11-03T18:00:00Z", distanceM: 14_800, durationS: 4500 }),
      ],
      planned: [
        planned({ id: "long", plannedDistanceM: 15_000, plannedDurationS: 4500 }),
        planned({ id: "court", plannedDistanceM: 5_000, plannedDurationS: 1800 }),
      ],
    });
    const byPlanned = Object.fromEntries(l.matches.map((m) => [m.plannedId, m.activityId]));
    expect(byPlanned).toEqual({ long: "soir", court: "matin" });
  });

  it("une sortie, deux séances : une seule séance est marquée, la plus proche", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1", distanceM: 8_000, durationS: 2400 })],
      planned: [
        planned({ id: "vma", sessionKind: "vo2", plannedDistanceM: 4_000, plannedDurationS: 1500 }),
        planned({ id: "foot", plannedDistanceM: 8_000, plannedDurationS: 2400 }),
      ],
    });
    expect(l.matches.map((m) => m.plannedId)).toEqual(["foot"]);
  });

  it("deux sorties, une séance : l'autre sortie compte seule", () => {
    const l = buildRunLedger({
      activities: [
        act({ id: "echauff", startedAt: "2026-11-03T06:00:00Z", distanceM: 2_000, durationS: 700 }),
        act({ id: "seance", startedAt: "2026-11-03T06:20:00Z", distanceM: 9_800, durationS: 2900 }),
      ],
      planned: [planned({ id: "p1" })],
    });
    expect(l.matches.map((m) => m.activityId)).toEqual(["seance"]);
    expect(summarizeKm(l.entries, "2026-11-03", "2026-11-03")).toEqual({ km: 11.8, watchKm: 11.8 });
  });

  it("ne rattache pas à une séance spécifique non déclarée « course »", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1" })],
      planned: [planned({ id: "metcon", sessionKind: "specifique" })],
    });
    expect(l.matches).toHaveLength(0);
    expect(l.entries).toHaveLength(1);
  });
});

describe("buildRunLedger — dédoublonnage avec la saisie", () => {
  it("séance validée avec ses km ET sortie montre : comptée une fois, mesure de la montre", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1", distanceM: 10_240 })],
      planned: [planned({ id: "p1", status: "completed", activityType: "course", manualKm: 10 })],
    });
    expect(l.entries).toEqual([{ date: "2026-11-03", km: 10.24, source: "watch" }]);
  });

  it("montre sans distance (tapis sans capteur) : la saisie compte", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1", sport: "treadmill_running", distanceM: null })],
      planned: [planned({ id: "p1", status: "completed", activityType: "course", manualKm: 8 })],
    });
    expect(l.matches[0]).toMatchObject({ watchKm: null, countedKm: 8, countedSource: "manual" });
    expect(l.entries).toEqual([{ date: "2026-11-03", km: 8, source: "manual" }]);
  });

  it("séance validée en vélo : ses km ne comptent pas, la sortie de montre du jour compte seule", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1" })],
      planned: [planned({ id: "p1", status: "completed", activityType: "velo", manualKm: 30 })],
    });
    expect(l.matches).toHaveLength(0);
    expect(l.entries).toEqual([{ date: "2026-11-03", km: 10, source: "watch" }]);
  });

  it("saisie sans montre : inchangé", () => {
    const l = buildRunLedger({
      activities: [],
      planned: [planned({ id: "p1", status: "completed", activityType: "course", manualKm: 12 })],
    });
    expect(l.entries).toEqual([{ date: "2026-11-03", km: 12, source: "manual" }]);
  });

  it("activité libre « course » saisie ET sortie montre : comptée une fois", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1", distanceM: 6_300 })],
      planned: [],
      free: [{ id: "f1", date: "2026-11-03", sport: "course", km: 6, durationMin: 35 }],
    });
    expect(l.entries).toEqual([{ date: "2026-11-03", km: 6.3, source: "watch" }]);
  });

  it("la séance prévue passe avant l'activité libre", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1" })],
      planned: [planned({ id: "p1" })],
      free: [{ id: "f1", date: "2026-11-03", sport: "course", km: 5, durationMin: null }],
    });
    expect(l.matches.map((m) => m.plannedId)).toEqual(["p1"]);
    // L'activité libre n'a plus de sortie en face : elle compte (sortie distincte).
    expect(summarizeKm(l.entries, "2026-11-03", "2026-11-03")).toEqual({ km: 15, watchKm: 10 });
  });

  it("les km courus en séance de muscu s'ajoutent toujours", () => {
    const l = buildRunLedger({
      activities: [act({ id: "w1" })],
      planned: [],
      strength: [{ date: "2026-11-03", km: 2 }],
    });
    expect(summarizeKm(l.entries, "2026-11-03", "2026-11-03").km).toBe(12);
  });

  it("le même run en FIT importé et en synchro COROS ne compte qu'une fois", () => {
    const l = buildRunLedger({
      activities: [
        act({ id: "coros" }),
        act({ id: "fit", source: "file_import", startedAt: "2026-11-03T07:01:00Z" }),
      ],
      planned: [],
    });
    expect(l.duplicateActivityIds).toEqual(["fit"]);
    expect(l.entries).toHaveLength(1);
  });
});

describe("totaux par semaine et par mois", () => {
  const l = buildRunLedger({
    activities: [
      act({ id: "w1", localDate: "2026-10-30", startedAt: "2026-10-30T07:00:00Z", distanceM: 8_000 }),
      act({ id: "w2", localDate: "2026-11-03", startedAt: "2026-11-03T07:00:00Z", distanceM: 10_000 }),
    ],
    planned: [
      planned({ id: "p2", date: "2026-11-03", status: "completed", activityType: "course", manualKm: 9 }),
      planned({ id: "p3", date: "2026-11-05", status: "completed", activityType: "course", manualKm: 6 }),
    ],
  });

  it("par mois, avec la part montre", () => {
    expect(kmByMonth(l.entries)).toEqual({
      "2026-10": { km: 8, watchKm: 8 },
      "2026-11": { km: 16, watchKm: 10 },
    });
  });

  it("par semaine dans le volume", () => {
    const v = computeRunningVolume(l.entries, new Date(2026, 10, 6, 10)); // vendredi 6 nov.
    expect(v.weekKm).toBe(16);
    expect(v.lastWeekKm).toBe(8);
    expect(v.watchKm).toBe(18);
    expect(v.weeks[v.weeks.length - 1]).toMatchObject({ monday: "2026-11-02", km: 16, watchKm: 10 });
  });
});

describe("libellé du rattachement", () => {
  const base = {
    plannedId: "p", plannedLabel: "Footing", activityId: "a", activitySource: "coros", activityDevice: null, date: "2026-11-03",
    watchKm: 10.24, watchDurationS: 3000, countedKm: 10.24, countedSource: "watch" as const,
  };
  it("distance de la montre, sinon durée, et la provenance", () => {
    expect(watchRunText(base)).toBe("Réalisée — 10,2 km montre");
    expect(watchRunMeasure({ ...base, watchKm: null, activitySource: "file_import" })).toBe("50 min fichier");
  });
});

describe("watchRunMeasure — attribution Garmin", () => {
  const base = {
    plannedId: "p", plannedLabel: "Footing", activityId: "a", date: "2026-11-07",
    watchKm: 10.2, watchDurationS: 3000, countedKm: 10.2, countedSource: "watch" as const,
  };
  it("nomme Garmin et le modèle, jamais « montre »", () => {
    const txt = watchRunMeasure({ ...base, activitySource: "garmin", activityDevice: "Forerunner 265" });
    expect(txt).toContain("Garmin Forerunner 265");
    expect(txt).not.toContain("montre");
  });
  it("écrit « Garmin » seul si le modèle est inconnu", () => {
    expect(watchRunMeasure({ ...base, activitySource: "garmin", activityDevice: null })).toMatch(/Garmin$/);
  });
  it("garde « montre » pour COROS", () => {
    expect(watchRunMeasure({ ...base, activitySource: "coros", activityDevice: null })).toMatch(/montre$/);
  });
});
