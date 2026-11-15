import { describe, it, expect } from "vitest";
import {
  buildProjectionCoverage,
  isProjectionCovered,
  mondayOfISO,
  planDayChange,
  planRecurringPlacement,
  planUnplannedStart,
} from "@/lib/planningProjection";

describe("mondayOfISO", () => {
  it("ramène au lundi, dimanche compris", () => {
    expect(mondayOfISO("2026-10-21")).toBe("2026-10-19"); // mercredi
    expect(mondayOfISO("2026-10-19")).toBe("2026-10-19"); // lundi
    expect(mondayOfISO("2026-10-25")).toBe("2026-10-19"); // dimanche
  });
});

describe("isProjectionCovered", () => {
  it("séance déplacée lundi → mercredi : plus de fantôme le lundi", () => {
    const cov = buildProjectionCoverage([
      { session_id: "A", scheduled_date: "2026-10-21", original_scheduled_date: "2026-10-19" },
    ]);
    expect(isProjectionCovered(cov, "A", "2026-10-19", 3)).toBe(true);
  });

  it("log sans date d'origine : la même semaine suffit", () => {
    const cov = buildProjectionCoverage([{ session_id: "A", scheduled_date: "2026-10-23" }]);
    expect(isProjectionCovered(cov, "A", "2026-10-19")).toBe(true);
  });

  it("séance décalée à la semaine suivante : l'occurrence suivante reste projetée", () => {
    const cov = buildProjectionCoverage([
      { session_id: "A", scheduled_date: "2026-10-27", original_scheduled_date: "2026-10-19" },
    ]);
    expect(isProjectionCovered(cov, "A", "2026-10-19")).toBe(true);
    expect(isProjectionCovered(cov, "A", "2026-10-26")).toBe(false);
  });

  it("même numéro d'occurrence → couvert", () => {
    const cov = buildProjectionCoverage([{ session_id: "A", scheduled_date: "2026-09-01", week_number: 4 }]);
    expect(isProjectionCovered(cov, "A", "2026-10-19", 4)).toBe(true);
    expect(isProjectionCovered(cov, "A", "2026-10-19", 5)).toBe(false);
  });

  it("autre séance : non couvert", () => {
    const cov = buildProjectionCoverage([{ session_id: "B", scheduled_date: "2026-10-19" }]);
    expect(isProjectionCovered(cov, "A", "2026-10-19")).toBe(false);
  });
});

describe("planUnplannedStart", () => {
  const today = "2026-10-22"; // jeudi
  it("séance prévue lundi non faite → on la déplace", () => {
    expect(planUnplannedStart([
      { id: "l1", session_id: "A", scheduled_date: "2026-10-19", status: "planned" },
      { id: "l2", session_id: "A", scheduled_date: "2026-10-24", status: "planned" },
    ], "A", today)).toEqual({ action: "move", logId: "l1", fromDate: "2026-10-19" });
  });
  it("déjà un log aujourd'hui → on l'ouvre", () => {
    expect(planUnplannedStart([
      { id: "l1", session_id: "A", scheduled_date: today, status: "planned" },
    ], "A", today)).toEqual({ action: "open", logId: "l1" });
  });
  it("séance déjà faite cette semaine ou ailleurs → nouvelle ligne", () => {
    expect(planUnplannedStart([
      { id: "l1", session_id: "A", scheduled_date: "2026-10-19", status: "completed" },
      { id: "l2", session_id: "A", scheduled_date: "2026-10-27", status: "planned" },
      { id: "l3", session_id: "B", scheduled_date: "2026-10-20", status: "planned" },
    ], "A", today)).toEqual({ action: "insert" });
  });
  it("log sauté ignoré", () => {
    expect(planUnplannedStart([
      { id: "l1", session_id: "A", scheduled_date: "2026-10-20", status: "skipped" },
    ], "A", today)).toEqual({ action: "insert" });
  });
});

describe("planDayChange", () => {
  it("conserve les choix de l'athlète et les séances faites", () => {
    const r = planDayChange([
      { id: "a", week_start: "2026-10-19", status: "planned" },
      { id: "b", week_start: "2026-10-26", status: "planned", rescheduled_by_athlete: true },
      { id: "c", week_start: "2026-11-02", status: "completed" },
      { id: "d", week_start: null, status: "planned" },
    ], 2);
    expect(r.updates).toEqual([{ id: "a", scheduled_date: "2026-10-21" }]);
    expect(r.keptByAthlete).toBe(1);
  });
});

describe("planDayChange — séance commencée", () => {
  it("une séance commencée garde son jour", () => {
    const r = planDayChange([{ id: "a", week_start: "2026-10-19", status: "in_progress" }], 2);
    expect(r.updates).toEqual([]);
  });
});

describe("planRecurringPlacement", () => {
  const weeks = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map((d, i) => ({
    id: `w${i + 1}`, week_number: i + 1, start_date: d,
    end_date: `2026-11-${String(Number(d.slice(8)) + 6).padStart(2, "0")}`,
  }));

  it("séance du lundi créée en cours de cycle : un lundi concret par semaine restante, aucun dans le passé", () => {
    expect(planRecurringPlacement(weeks, [], 0, "2026-11-10")).toEqual([
      { date: "2026-11-16", microcycleId: "w3", weekNumber: 3 },
      { date: "2026-11-23", microcycleId: "w4", weekNumber: 4 },
    ]);
  });

  it("le jour même compte (lundi = aujourd'hui)", () => {
    expect(planRecurringPlacement(weeks, [], 0, "2026-11-16").map((r) => r.date)).toEqual(["2026-11-16", "2026-11-23"]);
  });

  it("une semaine qui a déjà sa séance (faite, sautée, déplacée par l'athlète) n'en reçoit pas une 2e", () => {
    const logs = [
      { scheduled_date: "2026-11-18", original_scheduled_date: "2026-11-16", microcycle_id: "w3" }, // déplacée au mercredi
      { scheduled_date: "2026-11-25", original_scheduled_date: null, microcycle_id: null },          // ancienne, sans semaine
    ];
    expect(planRecurringPlacement(weeks, logs, 0, "2026-11-01")).toEqual([
      { date: "2026-11-02", microcycleId: "w1", weekNumber: 1 },
      { date: "2026-11-09", microcycleId: "w2", weekNumber: 2 },
    ]);
  });

  it("séance déplacée vers la semaine suivante : couvre sa semaine d'origine, pas la suivante", () => {
    const logs = [{ scheduled_date: "2026-11-17", original_scheduled_date: "2026-11-13", microcycle_id: null }];
    expect(planRecurringPlacement(weeks, logs, 4, "2026-11-01").map((r) => r.weekNumber)).toEqual([1, 3, 4]);
  });

  it("cycle commencé un mercredi : pas de lundi la 1re semaine", () => {
    const w = [{ id: "x1", week_number: 1, start_date: "2026-11-04", end_date: "2026-11-10" }];
    expect(planRecurringPlacement(w, [], 0, "2026-11-01")).toEqual([]);
    expect(planRecurringPlacement(w, [], 4, "2026-11-01")).toEqual([{ date: "2026-11-06", microcycleId: "x1", weekNumber: 1 }]);
  });
});
