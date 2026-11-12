import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { confirmMatch, getPlannedVsDone, rejectMatch } from "@/api/plannedVsDone";

afterEach(() => setDbForTests(null));

const activity = (id: string, extra: Record<string, unknown> = {}) => ({
  id, athlete_id: "ath", source: "garmin", started_at: "2026-11-10T17:34:00Z", local_date: "2026-11-10", sport: "running",
  duration_s: 2890, distance_m: 7400, elevation_gain_m: null, avg_hr: 152, max_hr: 170, avg_pace_s_per_km: 390,
  calories: null, device_name: "Forerunner 265", details: null, title: null, description: null, rpe: null, gear: null,
  commute: null, sources: null, ...extra,
});

describe("getPlannedVsDone (carte du planning)", () => {
  it("donne allure, FC et présence du fichier de chaque activité", async () => {
    const { db } = fakeDb({
      provider_activities: [activity("a1"), activity("a2", { started_at: "2026-11-10T07:00:00Z" })],
      activity_streams: [{ activity_id: "a1", athlete_id: "ath" }],
      activity_plan_links: [],
      activity_zone_summaries: [],
    });
    setDbForTests(db);
    const week = await getPlannedVsDone("ath", "2026-11-10", "2026-11-10");
    const byId = new Map(week[0].free.map((a) => [a.id, a]));
    expect(byId.get("a1")).toMatchObject({ hasStream: true, avgPaceSPerKm: 390, avgHr: 152 });
    expect(byId.get("a2")?.hasStream).toBe(false);
  });

  it("confirmer / refuser passent par la RPC decide_plan_link", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { db } = fakeDb({}, undefined, { decide_plan_link: (args) => (calls.push(args), null) });
    setDbForTests(db);
    await confirmMatch("l1");
    await rejectMatch("l2");
    expect(calls).toEqual([{ p_link: "l1", p_confirm: true }, { p_link: "l2", p_confirm: false }]);
  });
});
