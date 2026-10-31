import { describe, it, expect } from "vitest";
import {
  computeWeeklyMuscleVolume,
  formatSets,
  resolveMuscles,
  rollUpToGroups,
  weekStartISO,
  weekStartsBetween,
  type BankMuscles,
} from "@/lib/muscleVolume";
import { defaultExerciceParams } from "@/features/coach/components/programmation/types";
import type { Exercice, ProgSession } from "@/features/coach/components/programmation/types";

const ex = (id: string, exerciseId: string, sets: number, extra: Partial<Exercice> = {}): Exercice => ({
  id,
  exercise_id: exerciseId,
  exercise_name: exerciseId,
  mode: "classique",
  sort_order: 0,
  params: defaultExerciceParams(sets),
  ...extra,
});

const session = (id: string, exercices: Exercice[]): ProgSession => ({
  id,
  name: id,
  short: id,
  recurrence: "weekly",
  multi_semaine: false,
  blocs: [{ id: "b", name: "b", series_mode: "libre", timing_mode: "libre", sort_order: 0, exercices }],
});

const bank = new Map<string, BankMuscles>([
  ["bench", { primary: ["Pecs"], secondary: ["Triceps", "Ep-Ant"] }],
  ["row", { primary: ["Dos-GD", "Dos-Rhom"], secondary: ["Biceps"] }],
]);

describe("semaines", () => {
  it("lundi de la semaine", () => {
    expect(weekStartISO("2026-11-01")).toBe("2026-10-26"); // dimanche
    expect(weekStartISO("2026-10-26")).toBe("2026-10-26"); // lundi
  });
  it("lundis couvrant une plage", () => {
    expect(weekStartsBetween("2026-10-28", "2026-11-10")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });
});

describe("resolveMuscles", () => {
  it("banque par défaut", () => {
    expect(resolveMuscles(ex("1", "bench", 3), bank)).toEqual({ primary: ["Pecs"], secondary: ["Triceps", "Ep-Ant"] });
  });
  it("la surcharge du programme l'emporte sur la banque", () => {
    const e = ex("1", "bench", 3, { muscles: { primary: ["Triceps"], secondary: [] } });
    expect(resolveMuscles(e, bank)).toEqual({ primary: ["Triceps"], secondary: [] });
  });
  it("2 principaux max, un secondaire ne double pas un principal", () => {
    const e = ex("1", "x", 3, { muscles: { primary: ["Pecs", "Triceps", "Biceps"], secondary: ["Pecs", "Core"] } });
    expect(resolveMuscles(e, bank)).toEqual({ primary: ["Pecs", "Triceps"], secondary: ["Core"] });
  });
  it("exercice inconnu : aucun muscle", () => {
    expect(resolveMuscles(ex("1", "inconnu", 3), bank)).toEqual({ primary: [], secondary: [] });
  });
});

describe("computeWeeklyMuscleVolume", () => {
  const weekStarts = ["2026-10-26", "2026-11-02"];

  it("principal ×1, secondaire ×0,5 (2 séries pour en faire 1)", () => {
    const out = computeWeeklyMuscleVolume({
      sessions: [session("A", [ex("1", "bench", 4)])],
      logs: [{ id: "l1", session_id: "A", scheduled_date: "2026-10-27", status: "planned" }],
      bank,
      weekStarts,
    });
    expect(out["2026-10-26"].Pecs).toEqual({ planned: 4, done: 0 });
    expect(out["2026-10-26"].Triceps).toEqual({ planned: 2, done: 0 });
    expect(out["2026-10-26"]["Ep-Ant"]).toEqual({ planned: 2, done: 0 });
    expect(out["2026-11-02"]).toEqual({});
  });

  it("deux principaux comptent chacun la série entière", () => {
    const out = computeWeeklyMuscleVolume({
      sessions: [session("A", [ex("1", "row", 3)])],
      logs: [{ id: "l1", session_id: "A", scheduled_date: "2026-10-27", status: "planned" }],
      bank,
      weekStarts,
    });
    expect(out["2026-10-26"]["Dos-GD"].planned).toBe(3);
    expect(out["2026-10-26"]["Dos-Rhom"].planned).toBe(3);
    expect(out["2026-10-26"].Biceps.planned).toBe(1.5);
  });

  it("cumule les séances d'une semaine et sépare le terminé", () => {
    const out = computeWeeklyMuscleVolume({
      sessions: [session("A", [ex("1", "bench", 4)])],
      logs: [
        { id: "l1", session_id: "A", scheduled_date: "2026-10-26", status: "completed" },
        { id: "l2", session_id: "A", scheduled_date: "2026-10-29", status: "planned" },
      ],
      bank,
      weekStarts,
    });
    expect(out["2026-10-26"].Pecs).toEqual({ planned: 8, done: 4 });
  });

  it("ignore les séances skipped et hors plage", () => {
    const out = computeWeeklyMuscleVolume({
      sessions: [session("A", [ex("1", "bench", 4)])],
      logs: [
        { id: "l1", session_id: "A", scheduled_date: "2026-10-27", status: "skipped" },
        { id: "l2", session_id: "A", scheduled_date: "2027-01-05", status: "planned" },
      ],
      bank,
      weekStarts,
    });
    expect(out["2026-10-26"]).toEqual({});
  });

  it("utilise les paramètres de l'occurrence (progression des séries)", () => {
    const progressive = ex("1", "bench", 0, {
      params: { "1": defaultExerciceParams(3), "2": defaultExerciceParams(5) },
    });
    const out = computeWeeklyMuscleVolume({
      sessions: [session("A", [progressive])],
      logs: [
        { id: "l1", session_id: "A", scheduled_date: "2026-10-27", status: "planned" },
        { id: "l2", session_id: "A", scheduled_date: "2026-11-03", status: "planned" },
      ],
      bank,
      weekStarts,
    });
    expect(out["2026-10-26"].Pecs.planned).toBe(3);
    expect(out["2026-11-02"].Pecs.planned).toBe(5);
  });

  it("une note libre ne compte pas de séries", () => {
    const libre = ex("1", "bench", 4, { mode: "libre" });
    const out = computeWeeklyMuscleVolume({
      sessions: [session("A", [libre])],
      logs: [{ id: "l1", session_id: "A", scheduled_date: "2026-10-27", status: "planned" }],
      bank,
      weekStarts,
    });
    expect(out["2026-10-26"]).toEqual({});
  });
});

describe("affichage", () => {
  it("regroupe les sous-muscles", () => {
    const rolled = rollUpToGroups({
      "Dos-GD": { planned: 3, done: 1 },
      "Dos-Rhom": { planned: 3, done: 0 },
      Pecs: { planned: 4, done: 0 },
    });
    expect(rolled.Dos).toEqual({ planned: 6, done: 1 });
    expect(rolled.Pecs).toEqual({ planned: 4, done: 0 });
  });
  it("formate 12 et 12,5", () => {
    expect(formatSets(12)).toBe("12");
    expect(formatSets(12.5)).toBe("12,5");
  });
});
