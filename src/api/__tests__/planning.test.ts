import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getActivePlan, getCalendarEvents, getTimeline, getWeekWorkouts, placeSession } from "@/api/planning";

const A = "ath-1";

const log = (id: string, date: string, o: Row = {}) => ({
  id, athlete_id: A, session_id: "s1", session_name: "Force", scheduled_date: date,
  status: "planned", athlete_modifications: null, rpe_score: null, ...o,
});

function seed(extra: Record<string, Row[]> = {}, failOn?: { table: string; op: string }) {
  return fakeDb({
    macrocycles: [{ id: "ma1", athlete_id: A, name: "Saison", start_date: "2026-09-01", end_date: "2027-06-30" }],
    mesocycles: [{ id: "me1", macrocycle_id: "ma1", name: "Méso", objective: "Force", start_date: "2026-11-02", end_date: "2026-11-29", frequency: 3 }],
    cycles: [
      { id: "c-now", mesocycle_id: null, athlete_id: A, name: "Bloc 2", start_date: "2026-11-02", end_date: "2026-11-29" },
      { id: "c-past", mesocycle_id: null, athlete_id: A, name: "Bloc 1", start_date: "2026-10-05", end_date: "2026-11-01" },
    ],
    microcycles: ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map((d, i) => ({
      id: `w${i + 1}`, cycle_id: "c-now", week_number: i + 1, start_date: d,
      end_date: `2026-11-${String(Number(d.slice(8)) + 6).padStart(2, "0")}`, is_deload: false,
    })),
    workout_logs: [
      log("old", "2026-10-06", { status: "completed" }),
      log("old-missed", "2026-10-08", { status: "missed", session_id: "s2" }),
      log("w-a", "2026-11-09", { status: "completed" }),
      log("w-b", "2026-11-11", { session_id: "s2", session_name: "Course" }),
      log("w-skip", "2026-11-12", { status: "skipped" }),
    ],
    energy_session_assignments: [{
      id: "e1", athlete_id: A, energy_session_id: "es1", scheduled_date: "2026-11-10", status: "planned",
      rpe_score: null, block_logs: { b1: { done: true }, b2: { done: false } },
      energy_sessions: { id: "es1", name: "VMA courte", session_kind: "vo2" },
    }],
    test_sessions: [
      { id: "t1", athlete_id: A, title: "Squat 1RM", type: "force", date: "2026-11-13", completed: false },
      { id: "t2", athlete_id: A, title: "Hors semaine", type: "force", date: "2026-12-13", completed: false },
    ],
    competitions: [
      { id: "co1", athlete_id: A, name: "Régionaux", type: "hyrox", date: "2026-11-15", location: "Lyon", priority: "A", athlete_comment: null },
      { id: "co2", athlete_id: A, name: "Plus tard", type: "hyrox", date: "2026-12-01", location: null, priority: "B" },
    ],
    app_data: [{ athlete_id: A, key: "asp:freesess", value: [
      { id: "f1", date: "2026-11-12", sport: "Vélo", completed: true },
      { id: "f2", date: "2026-12-01", sport: "Ski" },
    ] }],
    athlete_life_events: [{ id: "le1", athlete_id: A, date_start: "2026-11-14", date_end: "2026-11-17", title: "Vacances" }],
    ...extra,
  }, failOn);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T10:00:00")); // mercredi
});
afterEach(() => {
  vi.useRealTimers();
  setDbForTests(null);
});

describe("getActivePlan", () => {
  it("méso et cycle en cours, cycles passés, semaine jour par jour", async () => {
    const { db } = seed();
    setDbForTests(db);
    const p = await getActivePlan(A);
    expect(p.mesocycle).toMatchObject({ id: "me1", macroName: "Saison", totalLogs: 2, completedLogs: 1, completionPct: 50, totalWeeks: 4, currentWeek: 2 });
    expect(p.cycle).toMatchObject({ id: "c-now", completionPct: 50 });
    expect(p.pastCycles).toEqual([expect.objectContaining({ id: "c-past", totalLogs: 2, completedLogs: 1 })]);
    expect(p.weekDays.map((d) => d.date)).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
    expect(p.weekDays[0].sessions.map((s) => s.id)).toEqual(["w-a"]);
    expect(p.weekDays[1].sessions[0]).toMatchObject({ id: "e1", kind: "energy", sessionName: "VMA courte", sessionKind: "vo2" });
    expect(p.weekDays[3].sessions).toEqual([]); // séance annulée exclue
    expect(p.weekDays[4].tests.map((t) => t.id)).toEqual(["t1"]);
    expect(p.weekDays[6].competitions.map((c) => c.id)).toEqual(["co1"]);
    expect(p.weekSessionCount).toBe(3);
  });

  it("semaine suivante via weekOffset", async () => {
    setDbForTests(seed().db);
    const p = await getActivePlan(A, 1);
    expect(p.weekDays[0].date).toBe("2026-11-16");
    expect(p.weekSessionCount).toBe(0);
  });

  it("lève si une lecture échoue (plus de plan vide silencieux)", async () => {
    setDbForTests(seed({}, { table: "workout_logs", op: "select" }).db);
    await expect(getActivePlan(A)).rejects.toThrow();
  });
});

describe("getCalendarEvents", () => {
  it("rassemble séances, tests, compétitions, énergie, activités libres et événements de vie", async () => {
    setDbForTests(seed().db);
    const ev = await getCalendarEvents(A, "2026-11-09", "2026-11-15");
    const byType = (t: string) => ev.filter((e) => e.type === t);
    expect(byType("workout").map((e) => e.id)).toEqual(["w-a", "w-b", "w-skip"]);
    expect(byType("test").map((e) => e.id)).toEqual(["t1"]);
    expect(byType("competition").map((e) => e.id)).toEqual(["co1"]);
    expect(byType("energy")[0]).toMatchObject({ id: "e1", title: "VMA courte", partial: true, status: "planned" });
    expect(byType("free_activity")[0]).toMatchObject({ id: "f1", status: "completed", title: "Vélo" });
    expect(byType("life_event").map((e) => e.date)).toEqual(["2026-11-14", "2026-11-15"]);
  });
});

describe("getTimeline", () => {
  it("périodisation + compétitions et tests de la fenêtre", async () => {
    setDbForTests(seed().db);
    const t = await getTimeline(A, "2026-11-01", "2026-11-30");
    expect(t.cycles.map((c) => c.id)).toEqual(["c-past", "c-now"]);
    expect(t.competitions.map((c) => c.id)).toEqual(["co1"]);
    expect(t.tests.map((x) => x.id)).toEqual(["t1"]);
  });
});

describe("getWeekWorkouts", () => {
  it("séances non annulées de la semaine avec leur occurrence", async () => {
    setDbForTests(seed().db);
    const w = await getWeekWorkouts(A, "2026-11-09", "2026-11-15");
    expect(w.map((l) => [l.id, l.occurrence])).toEqual([["w-a", 2], ["w-b", 2]]);
  });
});

describe("placeSession", () => {
  it("séance hebdomadaire : une par semaine restante du cycle, sans toucher une séance déjà posée", async () => {
    const { db, tables } = seed({
      workout_logs: [log("deja", "2026-11-11", { session_id: "s9", status: "completed", session_name: "Ancien" })],
    });
    setDbForTests(db);
    await placeSession({
      session: { id: "s9", name: "Gainage", recurrence: "weekly", day_of_week: 2 },
      athleteId: A, coachId: "coach", date: "2026-11-11", cycleId: "c-now", today: "2026-11-10",
    });
    const s9 = tables.workout_logs.filter((l) => l.session_id === "s9");
    expect(s9.map((l) => [l.scheduled_date, l.status]).sort()).toEqual([
      ["2026-11-11", "completed"], ["2026-11-18", "planned"], ["2026-11-25", "planned"],
    ]);
    expect(s9.find((l) => l.scheduled_date === "2026-11-18")).toMatchObject({ microcycle_id: "w3", original_scheduled_date: "2026-11-18" });
  });

  it("séance ponctuelle : une seule, au jour donné", async () => {
    const { db, tables } = seed({ workout_logs: [] });
    setDbForTests(db);
    await placeSession({ session: { id: "s7", name: "Test" }, athleteId: A, coachId: "coach", date: "2026-11-12", weekNumber: 2 });
    expect(tables.workout_logs).toEqual([expect.objectContaining({ session_id: "s7", scheduled_date: "2026-11-12", status: "planned", week_number: 2 })]);
  });
});
