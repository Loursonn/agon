import { describe, expect, it } from "vitest";
import { buildLoadWeeks, sessionLoads, type LoadInputs } from "@/lib/trainingLoadWeek";

const base = (over: Partial<LoadInputs> = {}): LoadInputs => ({
  from: "2026-11-02",
  weeks: 1,
  energy: [],
  workouts: [],
  program: [],
  exercises: {},
  activities: [],
  links: [],
  zoneSeconds: {},
  runStreams: {},
  zoneModels: [{ kind: "three", bounds: [150, 170], validFrom: "2026-01-01", status: "active" }],
  fiveBounds: null,
  fcmax: 190,
  speedRefs: { VMA: 18 },
  s1Kmh: 12,
  csKmh: 14,
  ...over,
});

const footing = {
  id: "e1", day: "2026-11-03", status: "completed", actualDurationMin: null, distanceKm: 8, name: "Footing",
  sessionKind: "endurance", intervals: [{ type: "interval" as const, role: "work", duration: { kind: "time", value: 2400 }, target: { kind: "hr_zone", zone: 2 } }],
};

describe("charge par séance", () => {
  it("énergie faite sans montre : fait comme prévu", () => {
    const [s] = sessionLoads(base({ energy: [footing] }));
    expect(s).toMatchObject({ planned: 40, done: 40, asPlanned: true, km: 8, focus: "endurance" });
  });

  it("énergie avec durée corrigée : prévu × durée réelle ÷ durée prévue", () => {
    const [s] = sessionLoads(base({ energy: [{ ...footing, actualDurationMin: 30 }] }));
    expect(s.done).toBeCloseTo(30, 6);
  });

  it("énergie prévue pas faite : réalisé « — »", () => {
    const [s] = sessionLoads(base({ energy: [{ ...footing, status: "planned" }] }));
    expect(s).toMatchObject({ planned: 40, done: null });
  });

  it("activité rattachée : temps par zone FC de la montre (modèle 5 zones → 3)", () => {
    const [s] = sessionLoads(base({
      energy: [{ ...footing, sessionKind: "specifique" }],
      activities: [{ id: "a1", day: "2026-11-03", sport: "training", distanceM: null, title: null }],
      links: [{ activityId: "a1", plannedKind: "energy", plannedId: "e1" }],
      zoneSeconds: { a1: [600, 600, 600, 600, 600] },
    }));
    // Z1 20', Z2 20', Z3 10' → 20 + 40 + 30.
    expect(s).toMatchObject({ focus: "mixed", done: 90, asPlanned: false });
  });

  it("muscu : prévu (séries × RIR prévus) et réalisé (séries saisies), échauffement exclu", () => {
    const [s] = sessionLoads(base({
      program: [{
        id: "p1",
        blocs: [
          { category: "Echauffement", exercices: [{ id: "x0", exercise_id: "ex0", exercise_name: "Mobilité", params: { nb_series: 2, rir: { mode: "global", value: 5 } } }] },
          { category: "Force", exercices: [{ id: "x1", exercise_id: "ex1", exercise_name: "Back squat", params: { nb_series: 4, rir: { mode: "global", value: 2 } } }] },
        ],
      }],
      exercises: { ex1: { name: "Back squat", isCompound: true, target: "Quads" } },
      workouts: [{
        id: "w1", day: "2026-11-04", status: "completed", sessionId: "p1", name: "Force", weekNumber: 1,
        sessionSets: { x1: [{ done: true, rir: 1 }, { done: true, rir: 1 }, { done: true }, { done: false }] },
        overrideBlocs: null,
      }],
    }));
    // Prévu : 4 × 0,75 × 1,5 × 6 = 27. Réalisé : (1 + 1 + 0,75) × 1,5 × 6 = 24,75.
    expect(s.planned).toBeCloseTo(27, 6);
    expect(s.done).toBeCloseTo(24.75, 6);
    expect(s.missingRir).toBe(0);
  });

  it("activité libre de course : comptée ; muscu libre ignorée", () => {
    const loads = sessionLoads(base({
      activities: [
        { id: "r1", day: "2026-11-05", sport: "running", distanceM: 10000, title: "Sortie" },
        { id: "m1", day: "2026-11-05", sport: "strength_training", distanceM: null, title: null },
      ],
      zoneSeconds: { r1: [3000, 600, 0], m1: [1200, 0, 0] },
    }));
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ id: "r1", done: 70, km: 10 });
  });
});

describe("semaines", () => {
  it("chronique sur les 4 semaines précédentes ; sans données : « — »", () => {
    const energy = [0, 1, 2, 3, 4].map((i) => ({ ...footing, id: `e${i}`, day: ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03"][i] }));
    const r = buildLoadWeeks(base({ from: "2026-10-06", weeks: 5, energy }));
    expect(r.weeks.map((w) => w.done)).toEqual([40, 40, 40, 40, 40]);
    expect(r.weeks[3].chronic).toBeNull();
    expect(r.weeks[4].chronic).toBe(40);
    expect(r.weeks[4].ratio).toBe(1);
  });
});

describe("mondayOf", () => {
  it("lundi de la semaine", async () => {
    const { mondayOf } = await import("@/lib/trainingLoadWeek");
    expect(mondayOf("2026-11-13")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
  });
});
