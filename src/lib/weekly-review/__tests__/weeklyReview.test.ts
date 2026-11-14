import { describe, expect, it } from "vitest";
import type { WellnessEntry } from "@shared/domain/wellness";
import type { PlannedItem, PlannedVsDoneDay } from "@/lib/plannedVsDone";
import {
  cleanAnswers,
  commitmentsToReview,
  formatDuration,
  initialAnswers,
  isReviewOpen,
  lastReviewWeek,
  missingFields,
  openReviewWeek,
  painRequired,
  reviewState,
  summarizeWeek,
  type ReviewAnswers,
} from "..";

// Semaine fictive « Thomas » (référence du 05/11) : lundi 23 → dimanche 29 novembre 2026.
const WEEK = "2026-11-23";

function item(p: Partial<PlannedItem> & Pick<PlannedItem, "id" | "kind" | "date" | "label">): PlannedItem {
  return { status: "planned", activity: null, linkId: null, linkStatus: null, done: false, rpe: null, ...p };
}

const run = (id: string, date: string, durationS: number, distanceM: number) => ({
  id, date, startedAt: `${date}T07:00:00Z`, source: "garmin", sport: "running", distanceM, durationS,
  deviceName: null, zoneShares: null,
});

const days: PlannedVsDoneDay[] = [
  { date: "2026-11-23", free: [], planned: [
    item({ id: "w1", kind: "workout", date: "2026-11-23", label: "Force A", done: true, status: "completed", rpe: { value: 7, source: "agon" } }),
  ] },
  { date: "2026-11-24", free: [], planned: [
    item({ id: "e1", kind: "energy", date: "2026-11-24", label: "Seuil 3 × 10 min", done: true,
      activity: run("act1", "2026-11-24", 3000, 9000), rpe: { value: 8, source: "agon" } }),
  ] },
  { date: "2026-11-26", free: [], planned: [
    item({ id: "w2", kind: "workout", date: "2026-11-26", label: "Force B", done: false }),
  ] },
  { date: "2026-11-28", free: [run("act2", "2026-11-28", 2700, 6500)], planned: [
    item({ id: "e2", kind: "energy", date: "2026-11-28", label: "Sortie longue", done: true,
      activity: run("act3", "2026-11-28", 4500, 13000), rpe: { value: 6, source: "strava" } }),
  ] },
  // Hors semaine : ignoré.
  { date: "2026-11-30", free: [], planned: [item({ id: "w9", kind: "workout", date: "2026-11-30", label: "Lundi d'après", done: true })] },
];

function well(day: string, v: Partial<WellnessEntry> & { n?: number }): WellnessEntry {
  const n = v.n ?? 3;
  return {
    day, items: { fatigue: n, sommeil: n, stress: n, energie: n, doms: n },
    sleep: { bedtime: null, wake: null, hours: null, interrupted: null, interruptNote: null },
    domsZones: [], domsPoints: [], domsLevels: {}, envie: v.envie ?? null, pain: v.pain ?? null, sick: v.sick ?? null,
    domsWorkout: null, injuryNote: null, weightKg: null, archived: v.archived ?? false,
  };
}

describe("fenêtre de la weekly review", () => {
  it("ouverte du dimanche au lundi soir", () => {
    expect(isReviewOpen(WEEK, "2026-11-28")).toBe(false); // samedi
    expect(isReviewOpen(WEEK, "2026-11-29")).toBe(true); // dimanche
    expect(isReviewOpen(WEEK, "2026-11-30")).toBe(true); // lundi
    expect(isReviewOpen(WEEK, "2026-12-01")).toBe(false); // mardi
    expect(isReviewOpen("2026-11-24", "2026-11-30")).toBe(false); // pas un lundi
  });

  it("semaine à revoir : dimanche → celle qui finit, lundi → celle d'hier, sinon rien", () => {
    expect(openReviewWeek("2026-11-29")).toBe(WEEK);
    expect(openReviewWeek("2026-11-30")).toBe(WEEK);
    expect(openReviewWeek("2026-11-27")).toBeNull();
    expect(lastReviewWeek("2026-11-27")).toBe("2026-11-16");
    expect(lastReviewWeek("2026-11-30")).toBe(WEEK);
  });

  it("état vu par le coach", () => {
    expect(reviewState(WEEK, "2026-11-27", null)).toBe("upcoming");
    expect(reviewState(WEEK, "2026-11-29", null)).toBe("waiting");
    expect(reviewState(WEEK, "2026-11-30", { status: "draft" })).toBe("draft");
    expect(reviewState(WEEK, "2026-12-01", null)).toBe("missed");
    expect(reviewState(WEEK, "2026-12-01", { status: "submitted" })).toBe("received");
  });
});

describe("bilan automatique (bloc 1)", () => {
  const wellness = [
    well("2026-11-23", { n: 4, envie: 4 }),
    well("2026-11-24", { n: 3, envie: 3, pain: 2 }),
    well("2026-11-25", { n: 2, envie: 2, pain: 5, sick: true }),
    well("2026-11-20", { n: 1 }), // semaine d'avant
    well("2026-11-26", { n: 1, archived: true }), // bloc archivé
  ];
  const s = summarizeWeek({
    weekStart: WEEK, days, wellness,
    workouts: { w1: { durationS: 3600, notes: "  Squat lourd, bonnes sensations " } },
  });

  it("séances réalisées / prévues, activités libres hors compte", () => {
    expect(s.sessions).toEqual({ done: 3, planned: 4 });
  });

  it("durée et distance : séances faites + activités libres, sans tonnage", () => {
    expect(s.durationMin).toBe(Math.round((3600 + 3000 + 4500 + 2700) / 60));
    expect(s.distanceKm).toBe(28.5);
  });

  it("RPE moyen et séance la plus dure avec le commentaire", () => {
    expect(s.rpeAvg).toBe(7);
    expect(s.hardest).toEqual({ date: "2026-11-24", label: "Seuil 3 × 10 min", rpe: 8, comment: null });
    const s2 = summarizeWeek({ weekStart: WEEK, days: days.slice(0, 1), wellness: [], workouts: { w1: { durationS: null, notes: " Dur " } } });
    expect(s2.hardest?.comment).toBe("Dur");
  });

  it("wellness : moyenne à partir de 3 jours, sinon « — » (null)", () => {
    expect(s.wellness.days).toBe(3);
    expect(s.wellness.items.sommeil).toBe(3);
    expect(s.wellness.envie).toBe(3);
    expect(s.wellness.painMax).toBe(5);
    expect(s.wellness.sickDays).toBe(1);
    const few = summarizeWeek({ weekStart: WEEK, days: [], wellness: wellness.slice(0, 2) });
    expect(few.wellness.items.sommeil).toBeNull();
    expect(few.durationMin).toBeNull();
    expect(few.distanceKm).toBeNull();
    expect(few.rpeAvg).toBeNull();
    expect(few.sessions).toEqual({ done: 0, planned: 0 });
  });
});

describe("saisie", () => {
  it("douleur demandée seulement si feu orange ou rouge", () => {
    expect(painRequired("green")).toBe(false);
    expect(painRequired(null)).toBe(false);
    expect(painRequired("orange")).toBe(true);
    expect(painRequired("red")).toBe(true);
  });

  it("les 3 engagements d'une semaine sont évalués la semaine d'après", () => {
    const prev: ReviewAnswers = { next: [" Couché avant 23 h ", "", "2 séances de mobilité", "en trop", "x"] };
    expect(commitmentsToReview(prev)).toEqual([
      { text: "Couché avant 23 h", status: null },
      { text: "2 séances de mobilité", status: null },
      { text: "en trop", status: null },
    ]);
    expect(initialAnswers(null, prev).kept).toHaveLength(3);
    const draft: ReviewAnswers = { kept: [{ text: "a", status: "kept" }], worked: "x" };
    expect(initialAnswers(draft, prev)).toEqual(draft);
    expect(initialAnswers({ worked: "x" }, null)).toEqual({ worked: "x", kept: [] });
  });

  it("ce qui manque avant l'envoi", () => {
    const a: ReviewAnswers = {
      feel: { note: 4, energie: 3, motivation: 5, vie: 2, nutrition: 3 },
      kept: [{ text: "a", status: "partly", why: "voyage" }],
      worked: "La régularité", stuck: "Le sommeil", stuckCause: "vie", change: "Écran coupé à 22 h",
      next: ["Couché avant 23 h", "", ""],
    };
    expect(missingFields(a, { painRequired: false })).toEqual([]);
    expect(missingFields(a, { painRequired: true }).map((m) => m.key)).toEqual(["pain"]);
    expect(missingFields({ ...a, pain: { zone: "genou", level: 4 } }, { painRequired: true })).toEqual([]);
    expect(missingFields({}, { painRequired: false }).map((m) => m.key)).toEqual([
      "feel.note", "feel.energie", "feel.motivation", "feel.vie", "feel.nutrition", "worked", "stuck", "change", "next",
    ]);
  });

  it("nettoyage avant l'envoi", () => {
    const out = cleanAnswers(
      { worked: "  ok ", next: [" a ", "", "b", "c", "d"], pain: { zone: "genou", level: 3 }, coachNote: "  " },
      { painRequired: false },
    );
    expect(out.worked).toBe("ok");
    expect(out.next).toEqual(["a", "b", "c"]);
    expect(out.pain).toBeUndefined();
    expect(out.coachNote).toBeUndefined();
    expect(cleanAnswers({ pain: { zone: " genou ", level: 6, kind: "blessure" } }, { painRequired: true }).pain)
      .toEqual({ zone: "genou", kind: "blessure", level: 6 });
  });

  it("durées affichées", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(85)).toBe("1 h 25");
  });
});
