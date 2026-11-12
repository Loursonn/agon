import { describe, expect, it } from "vitest";
import { lightRaw, mapGarminDaily, mapGarminIntraday, mapGarminMoveIQ, SLEEP_STAGE_CODES } from "../providers/garminHealth";

/** Minuit local du 2025-11-07 à Paris (UTC+1) = 2025-11-06T23:00:00Z. */
const START = Date.parse("2025-11-06T23:00:00Z") / 1000;
const base = { calendarDate: "2025-11-07", startTimeInSeconds: START, startTimeOffsetInSeconds: 3600 };

describe("résumés santé → champs du jour", () => {
  it("dailies : valeurs sentinelles et hors bornes → null, total des calories", () => {
    const d = mapGarminDaily("dailies", {
      ...base, activeKilocalories: 600, bmrKilocalories: 1700, maxStressLevel: -2, minHeartRateInBeatsPerMinute: 0,
      restStressDurationInSeconds: -1, bodyBatteryChargedValue: 62, distanceInMeters: 8123.45,
    })!;
    expect(d.fields).toMatchObject({
      total_kcal: 2300, stress_max: null, hr_min: null, stress_rest_min: null, body_battery_charged: 62, distance_m: 8123.5,
    });
  });

  it("sleeps : début / fin, phases, respiration moyenne, sous-scores", () => {
    const s = mapGarminDaily("sleeps", {
      ...base, durationInSeconds: 28800, lightSleepDurationInSeconds: 14400, awakeDurationInSeconds: 600,
      timeOffsetSleepRespiration: { "0": 14, "60": 16 }, sleepScores: { stress: { qualifierKey: "GOOD" } },
    })!;
    expect(s.fields).toMatchObject({
      sleep_total_min: 480, sleep_light_min: 240, sleep_awake_min: 10, respiration_sleep_avg: 15,
      sleep_start_at: "2025-11-06T23:00:00.000Z", sleep_end_at: "2025-11-07T07:00:00.000Z",
      sleep_subscores: { stress: { qualifierKey: "GOOD" } },
    });
  });

  it("composition corporelle et tension : unités converties", () => {
    expect(mapGarminDaily("bodyComps", { ...base, weightInGrams: 72350, bodyFatInPercent: 14.24 })!.fields)
      .toMatchObject({ weight_kg: 72.4, body_fat_pct: 14.2, bmi: null });
    expect(mapGarminDaily("bloodPressures", { ...base, systolic: 121, diastolic: 300 })!.fields)
      .toMatchObject({ bp_systolic: 121, bp_diastolic: null });
  });

  it("le brut rangé dans la journée laisse les grandes séries de côté", () => {
    expect(lightRaw({ summaryId: "x", timeOffsetHeartRateSamples: { "0": 60 }, sleepLevelsMap: {}, steps: 3 }))
      .toEqual({ summaryId: "x", steps: 3 });
  });
});

describe("séries de la journée", () => {
  it("décalages ramenés à minuit local, valeurs invalides écartées", () => {
    const [hr] = mapGarminIntraday("dailies", { ...base, timeOffsetHeartRateSamples: { "30": 55, "15": 54, "45": 0 } });
    expect(hr).toEqual({ day: "2025-11-07", measure: "hr", offsets: [15, 30], values: [54, 55], utcOffsetS: 3600 });
  });

  it("résumé commencé après minuit : décalé d'autant", () => {
    const [ox] = mapGarminIntraday("pulseox", { ...base, startTimeInSeconds: START + 7200, timeOffsetSpo2Values: { "0": 96 } });
    expect(ox.offsets).toEqual([7200]);
  });

  it("phases de sommeil : codes et marque de fin (0)", () => {
    const at = (h: number) => START - 3600 + h * 3600; // 22 h locale la veille + h
    const series = mapGarminIntraday("sleeps", {
      ...base, startTimeInSeconds: at(0),
      sleepLevelsMap: {
        light: [{ startTimeInSeconds: at(0), endTimeInSeconds: at(1) }],
        deep: [{ startTimeInSeconds: at(1), endTimeInSeconds: at(2) }],
      },
    });
    const st = series.find((s) => s.measure === "sleep_stage")!;
    expect(st.offsets).toEqual([-3600, 0, 3600]);
    expect(st.values).toEqual([SLEEP_STAGE_CODES.light, SLEEP_STAGE_CODES.deep, 0]);
  });

  it("epochs : un point par mesure, intensité codée", () => {
    const s = mapGarminIntraday("epochs", { ...base, startTimeInSeconds: START + 900, steps: 120, met: 3.25, intensity: "ACTIVE" });
    expect(s.map((x) => [x.measure, x.offsets[0], x.values[0]])).toEqual([
      ["steps", 900, 120], ["met", 900, 3.3], ["intensity", 900, 1],
    ]);
  });

  it("rien sans départ ni jour", () => {
    expect(mapGarminIntraday("dailies", { calendarDate: "2025-11-07", timeOffsetHeartRateSamples: { "0": 60 } })).toEqual([]);
    expect(mapGarminIntraday("healthSnapshot", base)).toEqual([]);
  });
});

describe("Move IQ", () => {
  it("activité détectée rangée, ou null si incomplète", () => {
    expect(mapGarminMoveIQ({ ...base, summaryId: "m1", durationInSeconds: 900, activityType: "WALKING" })).toEqual({
      source: "garmin", external_id: "m1", day: "2025-11-07", started_at: "2025-11-06T23:00:00.000Z", duration_s: 900, activity_type: "WALKING",
    });
    expect(mapGarminMoveIQ({ ...base })).toBeNull();
  });
});
