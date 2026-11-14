import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { addDays } from "@shared/domain/dates";
import { setDbForTests } from "@/api/client";
import { brandOf, getWellnessLight } from "@/api/wellnessLight";

afterEach(() => setDbForTests(null));

const TODAY = "2026-11-13";
const empty = {
  workout_logs: [], provider_activities: [], activity_plan_links: [], app_data: [], hr_zone_models: [],
  performance_logs: [], hyrox_test_analyses: [], activity_streams: [], activity_laps: [], activity_zone_summaries: [],
  energy_session_assignments: [], exercises: [], provider_dailies: [], wellness_entries: [],
};

const entry = (day: string, over: Record<string, unknown> = {}) => ({
  athlete_id: "ath", day, fatigue: 4, sommeil: 4, stress: 4, energie: 4, doms: 4, bedtime: null, wake: null,
  sleep_hours: null, sleep_interrupted: null, sleep_interrupt_note: null, doms_zones: [], doms_points: [],
  injury_note: null, weight_kg: null, archived: false, envie: 4, pain: 0, sick: false, ...over,
});

describe("getWellnessLight", () => {
  it("export Garmin = Garmin", () => {
    expect(brandOf("garmin_export")).toBe("garmin");
    expect(brandOf("coros")).toBe("coros");
  });

  it("sans montre ni charge, wellness du matin « malade » : rouge", async () => {
    const { db } = fakeDb({ ...empty, wellness_entries: [entry(TODAY, { sick: true })] });
    setDbForTests(db);
    const r = await getWellnessLight("ath", TODAY);
    expect(r?.light).toBe("red");
    expect(r?.brand).toBeNull();
  });

  it("VFC de la montre sous la zone : orange, phrase VFC", async () => {
    const dailies = Array.from({ length: 35 }, (_, i) => {
      const day = addDays(TODAY, -34 + i);
      const low = i >= 28;
      return { athlete_id: "ath", day, source: "garmin", hrv_ms: Math.exp(low ? 4.0 : i % 2 ? 4.37 : 4.13), resting_hr: 50 };
    });
    const { db } = fakeDb({ ...empty, provider_dailies: dailies, wellness_entries: [entry(TODAY)] });
    setDbForTests(db);
    const r = await getWellnessLight("ath", TODAY);
    expect(r?.brand).toBe("garmin");
    expect(r?.light).toBe("orange");
    expect(r?.sentence).toMatch(/^VFC sous ta zone habituelle/);
  });

  it("saisie d'avant-hier et rien d'autre : pas de feu", async () => {
    const { db } = fakeDb({ ...empty, wellness_entries: [entry(addDays(TODAY, -2))] });
    setDbForTests(db);
    expect(await getWellnessLight("ath", TODAY)).toBeNull();
  });
});
