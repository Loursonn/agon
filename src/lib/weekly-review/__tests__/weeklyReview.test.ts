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
  weekPainReports,
  type InjuryLike,
  type SessionPainLike,
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
    domsZones: [], domsPoints: [], domsLevels: {}, envie: v.envie ?? null, pain: v.pain ?? null, painLevels: {}, sick: v.sick ?? null,
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
    expect(s.runKm).toBe(28.5);
    expect(s.bikeKm).toBeNull();
  });

  it("course à pied et vélo comptés à part (le total garde les deux)", () => {
    const bike = { ...run("b1", "2026-11-25", 5400, 40_000), sport: "road_biking" };
    const swim = { ...run("n1", "2026-11-26", 1800, 2_000), sport: "lap_swimming" };
    const w = summarizeWeek({ weekStart: WEEK, wellness: [], days: [
      { date: "2026-11-24", planned: [], free: [run("r1", "2026-11-24", 3000, 10_000)] },
      { date: "2026-11-25", planned: [], free: [bike] },
      { date: "2026-11-26", planned: [], free: [swim] },
    ] });
    expect(w.runKm).toBe(10);
    expect(w.bikeKm).toBe(40);
    expect(w.distanceKm).toBe(52);
    const onlyBike = summarizeWeek({ weekStart: WEEK, wellness: [], days: [{ date: "2026-11-25", planned: [], free: [bike] }] });
    expect(onlyBike.runKm).toBeNull(); // affiché « — » : jamais 0
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
  it("douleur demandée seulement si une douleur a été saisie dans la semaine", () => {
    expect(painRequired([])).toBe(false);
    expect(painRequired(null)).toBe(false);
    expect(painRequired([{ day: "2026-11-24", source: "wellness", text: "Douleur 5/10", comment: null }])).toBe(true);
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

describe("douleurs de la semaine (retour d'Hugo du 15/11)", () => {
  const injury = (p: Partial<InjuryLike>): InjuryLike => ({
    title: "Entorse", zone: null, date: null, pain_level: null, notes: null, created_at: "2026-11-01T10:00:00Z", ...p,
  });

  it("feu orange sans douleur : aucune question", () => {
    const r = weekPainReports({ weekStart: WEEK, wellness: [well("2026-11-24", { pain: 0, n: 1 }), well("2026-11-25", {})] });
    expect(r).toEqual([]);
    expect(painRequired(r)).toBe(false);
  });

  it("wellness avec carte douleur : zones notées, dans l'ordre des jours", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [
        { ...well("2026-11-27", { pain: 3 }), painLevels: { lombaires: 3 } },
        { ...well("2026-11-24", { pain: 6 }), painLevels: { genou: 6, lombaires: 0 } },
      ],
    });
    expect(r).toEqual([
      { day: "2026-11-24", source: "wellness", text: "Douleur : genou 6/10", comment: null },
      { day: "2026-11-27", source: "wellness", text: "Douleur : lombaires 3/10", comment: null },
    ]);
    expect(painRequired(r)).toBe(true);
  });

  it("une gêne (1 à 3/10) compte aussi ; ancienne saisie sans zone : la note seule", () => {
    const r = weekPainReports({ weekStart: WEEK, wellness: [well("2026-11-25", { pain: 2 })] });
    expect(r.map((x) => x.text)).toEqual(["Douleur 2/10"]);
  });

  it("commentaire écrit par l'athlète rappelé ; note recomposée par l'app ignorée", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [
        { ...well("2026-11-24", { pain: 4 }), injuryNote: "Gêne au genou en descente d'escaliers" },
        { ...well("2026-11-25", { pain: 5 }), painLevels: { genou: 5 }, injuryNote: "Douleur : genou 5/10" },
        { ...well("2026-11-26", { pain: 5, sick: true }), injuryNote: "Malade ou fiévreux·se · Douleur : genou 5/10" },
      ],
    });
    expect(r.map((x) => x.comment)).toEqual(["Gêne au genou en descente d'escaliers", null, null]);
  });

  it("hors semaine, archivé ou sans réponse : ignoré", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [well("2026-11-22", { pain: 7 }), well("2026-11-30", { pain: 7 }), well("2026-11-24", { pain: 7, archived: true }), well("2026-11-25", {})],
    });
    expect(r).toEqual([]);
  });

  it("blessure datée dans la semaine : titre, zone, note et commentaire", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [],
      injuries: [injury({ date: "2026-11-26", zone: "Cheville gauche", pain_level: 6, notes: " Tordue sur un trottoir " })],
    });
    expect(r).toEqual([{ day: "2026-11-26", source: "blessure", text: "Entorse · Cheville gauche · 6/10", comment: "Tordue sur un trottoir" }]);
  });

  it("blessure sans date : jour de déclaration ; ancienne ou sans douleur (0/10) : ignorée", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [],
      injuries: [
        injury({ created_at: "2026-11-28T18:00:00Z" }),
        injury({ date: "2026-10-02", pain_level: 8 }),
        injury({ date: "2026-11-25", pain_level: 0 }),
      ],
    });
    expect(r).toEqual([{ day: "2026-11-28", source: "blessure", text: "Entorse", comment: null }]);
  });

  it("même jour : le wellness avant la blessure", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [well("2026-11-26", { pain: 4 })],
      injuries: [injury({ date: "2026-11-26", pain_level: 4 })],
    });
    expect(r.map((x) => x.source)).toEqual(["wellness", "blessure"]);
  });

  const fu = (p: Partial<SessionPainLike>): SessionPainLike => ({
    entryId: "m1", sessionId: "w1", day: "2026-11-25", name: "Force bas du corps", zone: "Genou", level: 6, note: null, ...p,
  });

  it("douleur de séance (suivis de blessure) : une ligne par séance, nom, zones, commentaire ; hors semaine ignorée", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [],
      sessions: [
        fu({ note: "  Au squat  " }),
        fu({ entryId: "m2", zone: "Lombaires", level: 3, note: "Au squat" }),
        fu({ entryId: "m3", sessionId: "w9", day: "2026-11-30", name: "Lundi suivant", zone: "Cou", level: 2 }),
      ],
    });
    expect(r).toEqual([
      { day: "2026-11-25", source: "seance", sessionName: "Force bas du corps", text: "Genou 6/10, lombaires 3/10", comment: "Au squat" },
    ]);
    expect(painRequired(r)).toBe(true);
  });

  it("blessure née d'une séance : pas répétée ; blessure ancienne suivie : la séance la rappelle", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [],
      sessions: [fu({ entryId: "new", day: "2026-11-26", zone: "Mollet", level: 4 }), fu({ entryId: "old", sessionId: "e1", name: null })],
      injuries: [
        injury({ id: "new", title: "Douleur en séance", zone: "Mollet", date: "2026-11-26", pain_level: 4 }),
        injury({ id: "old", title: "Tendinite", zone: "Genou", date: "2026-11-01", pain_level: 6 }),
      ],
    });
    expect(r).toEqual([
      { day: "2026-11-25", source: "seance", sessionName: "Séance", text: "Genou 6/10", comment: null },
      { day: "2026-11-26", source: "seance", sessionName: "Force bas du corps", text: "Mollet 4/10", comment: null },
    ]);
  });

  it("même jour : wellness, puis séance, puis blessure", () => {
    const r = weekPainReports({
      weekStart: WEEK,
      wellness: [well("2026-11-26", { pain: 2 })],
      sessions: [fu({ day: "2026-11-26", name: "", zone: "Mollet", level: 4 })],
      injuries: [injury({ id: "autre", date: "2026-11-26", pain_level: 4 })],
    });
    expect(r.map((x) => x.source)).toEqual(["wellness", "seance", "blessure"]);
    expect(r[1].sessionName).toBe("Séance");
  });
});
