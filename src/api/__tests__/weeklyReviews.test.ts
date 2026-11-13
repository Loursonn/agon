import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getWeekSummary, getWeeklyReview, listReviewsForWeek, saveWeeklyReview, toReview } from "@/api/weeklyReviews";
import type { WeekSummary } from "@/lib/weekly-review";

afterEach(() => setDbForTests(null));

const WEEK = "2026-11-23";
const row = (over: Record<string, unknown> = {}) => ({
  id: "r1", athlete_id: "ath", week_start: WEEK, status: "draft", answers: { feel: { note: 3 } }, auto: null,
  light: null, submitted_at: null, updated_at: "2026-11-29T10:00:00Z", ...over,
});

describe("api/weeklyReviews", () => {
  it("lecture : brouillon et champs inconnus tolérés", async () => {
    const { db } = fakeDb({ weekly_reviews: [row(), row({ id: "r2", athlete_id: "autre" })] });
    setDbForTests(db);
    const r = await getWeeklyReview("ath", WEEK);
    expect(r?.status).toBe("draft");
    expect(r?.answers.feel?.note).toBe(3);
    expect(r?.auto).toBeNull();
    expect(await getWeeklyReview("ath", "2026-11-16")).toBeNull();
    expect(toReview(row({ answers: "x", light: "violet", status: "?" })).answers).toEqual({});
    expect(toReview(row({ light: "violet" })).light).toBeNull();
    expect((await listReviewsForWeek(["ath", "autre"], WEEK)).map((x) => x.id).sort()).toEqual(["r1", "r2"]);
    expect(await listReviewsForWeek([], WEEK)).toEqual([]);
  });

  it("brouillon puis envoi : une seule RPC, bilan et feu seulement à l'envoi", async () => {
    const calls: Record<string, unknown>[] = [];
    const { db } = fakeDb({}, undefined, {
      save_weekly_review: (a) => (calls.push(a), row({ status: a.p_submit ? "submitted" : "draft", answers: a.p_answers, auto: a.p_auto ?? null, light: a.p_light ?? null })),
    });
    setDbForTests(db);
    await saveWeeklyReview(WEEK, { worked: "x" });
    const auto = { sessions: { done: 1, planned: 2 } } as unknown as WeekSummary;
    const sent = await saveWeeklyReview(WEEK, { worked: "x" }, { auto, light: "orange" });
    expect(calls[0]).toEqual({ p_week: WEEK, p_answers: { worked: "x" }, p_submit: false });
    expect(calls[1]).toEqual({ p_week: WEEK, p_answers: { worked: "x" }, p_submit: true, p_auto: auto, p_light: "orange" });
    expect(sent.status).toBe("submitted");
    expect(sent.light).toBe("orange");
  });

  it("refus de la base remonté tel quel", async () => {
    const { db } = fakeDb({}, undefined, {
      save_weekly_review: () => { throw Object.assign(new Error("La weekly review se remplit du dimanche au lundi soir"), { code: "22023" }); },
    });
    setDbForTests(db);
    await expect(saveWeeklyReview(WEEK, {})).rejects.toThrow("dimanche au lundi soir");
  });

  it("bilan de la semaine lu depuis le planning, les séances et le wellness", async () => {
    const { db } = fakeDb({
      workout_logs: [{ id: "w1", athlete_id: "ath", session_id: "s", session_name: "Force A", scheduled_date: WEEK, status: "completed", duration_s: 3600, notes: "Dur", rpe_score: 8 }],
      energy_session_assignments: [], provider_activities: [], activity_plan_links: [], activity_streams: [], activity_zone_summaries: [],
      test_sessions: [], app_data: [],
      wellness_entries: [],
    });
    setDbForTests(db);
    const s = await getWeekSummary("ath", WEEK);
    expect(s.sessions).toEqual({ done: 1, planned: 1 });
    expect(s.durationMin).toBe(60);
    expect(s.hardest).toEqual({ date: WEEK, label: "Force A", rpe: 8, comment: "Dur" });
  });
});
