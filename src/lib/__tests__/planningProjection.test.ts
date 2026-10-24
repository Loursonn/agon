import { describe, it, expect } from "vitest";
import {
  buildProjectionCoverage,
  isProjectionCovered,
  mondayOfISO,
  planDayChange,
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
