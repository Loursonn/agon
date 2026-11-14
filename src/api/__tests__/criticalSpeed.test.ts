import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getAthleteCriticalSpeed } from "@/api/criticalSpeed";

afterEach(() => setDbForTests(null));

describe("getAthleteCriticalSpeed", () => {
  it("retient la plus récente entre test et VC saisie, avec le seuil 1 du test", async () => {
    const { db } = fakeDb({
      hyrox_test_analyses: [
        { athlete_id: "ath", date: "2026-10-20", outputs: { scores: { running: { cs_kmh: 14.2, s1_kmh: 11.9 } } } },
        { athlete_id: "other", date: "2026-11-10", outputs: { scores: { running: { cs_kmh: 20 } } } },
      ],
      performance_logs: [
        { athlete_id: "ath", metric_name: "VC", value: 13.8, date: "2026-09-01", is_active_reference: true },
      ],
      provider_activities: [],
      activity_streams: [],
    });
    setDbForTests(db);
    const r = await getAthleteCriticalSpeed("ath", "2026-11-13");
    expect(r.current).toMatchObject({ source: "test", csKmh: 14.2 });
    expect(r.s1Kmh).toBe(11.9);
    expect(r.proposal).toBeNull();
  });

  it("sans aucune source : tout null", async () => {
    const { db } = fakeDb({ hyrox_test_analyses: [], performance_logs: [], provider_activities: [], activity_streams: [] });
    setDbForTests(db);
    expect(await getAthleteCriticalSpeed("ath", "2026-11-13")).toEqual({ current: null, proposal: null, s1Kmh: null });
  });
});
