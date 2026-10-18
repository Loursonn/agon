import { describe, it, expect } from "vitest";
import { windows, wellnessTrend, weightTrend, sleepScore, recentProgress, attendance, ruleInsights } from "../athleteTrends";
import type { TrendSummary } from "../athleteTrends";

const TODAY = new Date("2026-10-07T10:00:00");

describe("windows", () => {
  it("30 j glissants + période précédente", () => {
    const { cur, prev } = windows(30, TODAY);
    expect(cur).toEqual({ start: "2026-09-08", end: "2026-10-07" });
    expect(prev).toEqual({ start: "2026-08-09", end: "2026-09-07" });
  });
});

describe("wellnessTrend", () => {
  it("moyenne sur la période vs précédente, clés YYYYMMDD et ISO", () => {
    const wh = { "20261006": { score: 80 }, "2026-10-01": { score: 70 }, "20260901": { score: 60 } };
    const t = wellnessTrend(wh, "score", 30, TODAY);
    expect(t.value).toBe(75);
    expect(t.prev).toBe(60);
    expect(t.delta).toBe(15);
    expect(t.series).toHaveLength(30);
  });
  it("aucune donnée → null", () => {
    expect(wellnessTrend({}, "score", 7, TODAY).value).toBeNull();
  });
});

describe("weightTrend", () => {
  it("dernière mesure de chaque période", () => {
    const t = weightTrend({ "20261001": 80.4, "20261005": 80, "20260901": 82 }, 30, TODAY);
    expect(t.value).toBe(80);
    expect(t.prev).toBe(82);
    expect(t.delta).toBe(-2);
  });
});

describe("sleepScore", () => {
  const w = { start: "2026-10-01", end: "2026-10-07" };
  it("objectif tenu + coucher régulier = 100", () => {
    const wh = {
      "20261005": { sleepDur: 8, coucher: { h: 23, m: 0 } },
      "20261006": { sleepDur: 8.5, coucher: { h: 23, m: 10 } },
    };
    const s = sleepScore(wh, { sleepTarget: 8, sleepBedtime: { h: 23, m: 0 } }, w)!;
    expect(s.quantity).toBe(50);
    expect(s.regularity).toBe(50);
    expect(s.score).toBe(100);
  });
  it("gère le passage de minuit et le déficit", () => {
    const wh = {
      "20261005": { sleepDur: 7, coucher: { h: 0, m: 30 } },  // 1h30 après la cible
      "20261006": { sleepDur: 7, coucher: { h: 0, m: 30 } },
    };
    const s = sleepScore(wh, { sleepTarget: 8, sleepBedtime: { h: 23, m: 0 } }, w)!;
    expect(s.bedtimeDeviationMin).toBe(90);
    expect(s.regularity).toBe(0);
    expect(s.quantity).toBe(25);
  });
  it("sans données → null", () => {
    expect(sleepScore({}, {}, w)).toBeNull();
  });
});

describe("recentProgress", () => {
  it("ne garde que les records battus dans la période", () => {
    const prs = [
      { exercise_ref: "Squat", kg: 140, date: "2026-10-01" },
      { exercise_ref: "Squat", kg: 130, date: "2026-08-01" },
      { exercise_ref: "Bench", kg: 90, date: "2026-10-02" },
      { exercise_ref: "Bench", kg: 95, date: "2026-07-01" },
      { exercise_ref: "Deadlift", kg: 180, date: "2026-09-20" },
    ];
    const p = recentProgress(prs, 30, TODAY);
    expect(p.map(x => x.exercise)).toEqual(["Squat", "Deadlift"]);
    expect(p[0].gain).toBe(10);
    expect(p[1].prevKg).toBeNull();
  });
});

describe("attendance", () => {
  it("faites / prévues", () => {
    const a = attendance(
      [{ scheduled_date: "2026-10-01", status: "completed" }, { scheduled_date: "2026-10-02", status: "planned" }, { scheduled_date: "2026-08-01", status: "completed" }],
      { start: "2026-09-08", end: "2026-10-07" },
    );
    expect(a).toEqual({ done: 1, planned: 2, pct: 50 });
  });

  it("ignore les séances retirées (skipped) et celles du jour pas encore faites", () => {
    const w = { start: "2026-10-01", end: "2026-10-07" };
    const a = attendance(
      [
        { scheduled_date: "2026-10-02", status: "completed" },
        { scheduled_date: "2026-10-03", status: "skipped" },   // retirée : pas prescrite
        { scheduled_date: "2026-10-04", status: "missed" },    // prescrite, ratée
        { scheduled_date: "2026-10-07", status: "planned" },   // aujourd'hui, pas encore due
        { scheduled_date: "2026-10-07", status: "completed" }, // aujourd'hui, faite
      ],
      w,
      "2026-10-07",
    );
    expect(a).toEqual({ done: 2, planned: 3, pct: 67 });
  });
});

describe("ruleInsights", () => {
  it("max 4 phrases, priorise le déficit de sommeil", () => {
    const empty = { value: null, prev: null, delta: null, series: [] };
    const s: TrendSummary = {
      days: 30,
      health: { value: 70, prev: 60, delta: 10, series: [] },
      weight: empty, weightTarget: null,
      sleep: { score: 40, regularity: 20, quantity: 20, avgHours: 6.5, targetHours: 8, bedtimeDeviationMin: 50 },
      prevSleep: null,
      fatigue: { ...empty, value: 2 }, stress: empty,
      attendance: { done: 4, planned: 8, pct: 50 }, prevAttendance: { done: 0, planned: 0, pct: null },
      progress: [{ exercise: "Squat", kg: 140, prevKg: 130, gain: 10, date: "2026-10-01" }],
    };
    const out = ruleInsights(s);
    expect(out.length).toBe(4);
    expect(out[0]).toContain("6.5 h");
  });
});
