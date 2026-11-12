import { afterEach, describe, expect, it } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { getHealthDays, getIntraday } from "@/api/health";

afterEach(() => setDbForTests(null));

const day = (d: string, extra: Record<string, unknown> = {}) => ({
  athlete_id: "lea", source: "garmin", day: d, resting_hr: 48, hrv_ms: "52.5", sleep_total_min: 450, spo2_avg: null, ...extra,
});

describe("santé", () => {
  it("résumés du jour : plage, ordre, numeric converti, absent = null, attribution", async () => {
    const { db } = fakeDb({
      provider_dailies: [day("2031-03-05"), day("2031-03-04", { sleep_subscores: { stress: { qualifierKey: "GOOD" } } }), day("2031-02-01"), { ...day("2031-03-04"), athlete_id: "autre" }],
    });
    setDbForTests(db);
    const d = await getHealthDays("lea", "2031-03-01", "2031-03-07");
    expect(d.map((x) => x.day)).toEqual(["2031-03-04", "2031-03-05"]);
    expect(d[0]).toMatchObject({ restingHr: 48, hrvMs: 52.5, sleepTotalMin: 450, spo2Avg: null, bodyBatteryMax: null, attribution: "Garmin" });
    expect(d[0].sleepSubscores).toEqual({ stress: { qualifierKey: "GOOD" } });
  });

  it("séries de la journée : filtrées par mesure", async () => {
    const s = (measure: string) => ({ athlete_id: "lea", source: "garmin", day: "2031-03-04", measure, offsets: [0, 60], values: [55, 57] });
    const { db } = fakeDb({ provider_intraday: [s("hr"), s("stress"), s("spo2")] });
    setDbForTests(db);
    const r = await getIntraday("lea", "2031-03-04", "2031-03-04", ["hr", "spo2"]);
    expect(r.map((x) => x.measure)).toEqual(["hr", "spo2"]);
    expect(r[0]).toMatchObject({ offsets: [0, 60], values: [55, 57], attribution: "Garmin" });
  });

  it("erreur de lecture → lève (jamais une liste vide silencieuse)", async () => {
    const { db } = fakeDb({}, { table: "provider_dailies", op: "select" });
    setDbForTests(db);
    await expect(getHealthDays("lea", "2031-03-01", "2031-03-07")).rejects.toThrow();
  });
});
