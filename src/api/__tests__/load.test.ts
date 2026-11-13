import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getLoadWeeks } from "@/api/load";

afterEach(() => setDbForTests(null));

const empty = {
  workout_logs: [], provider_activities: [], activity_plan_links: [], app_data: [], hr_zone_models: [],
  performance_logs: [], hyrox_test_analyses: [], activity_streams: [], activity_laps: [], activity_zone_summaries: [],
  energy_session_assignments: [], exercises: [],
};

describe("getLoadWeeks", () => {
  it("6 semaines affichées, la dernière avec la séance faite comme prévu", async () => {
    const { db } = fakeDb({
      ...empty,
      hr_zone_models: [{ id: "m", athlete_id: "ath", kind: "three", bounds: [150, 170], valid_from: "2026-01-01", status: "active", origin: "manual", created_at: "2026-01-01" }],
      energy_session_assignments: [{
        id: "e1", athlete_id: "ath", scheduled_date: "2026-11-10", status: "completed", actual_duration_min: null, distance_km: 8,
        energy_session_id: "s1",
        energy_sessions: { id: "s1", name: "Footing", session_kind: "endurance", intervals: [{ type: "interval", role: "work", duration: { kind: "time", value: 2400 }, target: { kind: "hr_bpm", min: 140, max: 145 } }] },
      }],
    });
    setDbForTests(db);
    const r = await getLoadWeeks("ath", "2026-11-09", 6);
    expect(r.weeks).toHaveLength(6);
    expect(r.weeks[0].from).toBe("2026-10-05");
    const last = r.weeks[5];
    expect(last.from).toBe("2026-11-09");
    expect(last.done).toBe(40);
    expect(last.planned).toBe(40);
    expect(last.km.total).toBe(8);
    expect(last.chronic).toBe(0);
    expect(last.ratio).toBeNull();
  });
});
