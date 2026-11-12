/**
 * Santé Garmin (Health API) → tables d'Agon. Pur, testé.
 *
 * - `mapGarminDaily` : champs du résumé du jour (`provider_dailies`), un jeu de
 *   champs par type de résumé ; un type ne renseigne QUE ses champs (le
 *   sommeil n'efface pas les pas). Valeurs sentinelles de Garmin (−1, −2…)
 *   et valeurs impossibles → `null` (« — » à l'écran), jamais 0.
 * - `mapGarminIntraday` : séries de la journée (`provider_intraday`), en
 *   secondes depuis minuit LOCAL du jour ; points sentinelles retirés.
 * - `mapGarminMoveIQ` : activités détectées automatiquement (à part).
 *
 * Règle YOXX : Body Battery, score de sommeil, stress, VO2max, âge fitness
 * sont des scores de marque, stockés et affichables AVEC leur source, jamais
 * utilisés dans les calculs d'Agon (charge, feux wellness…). Aucune donnée
 * Garmin n'est envoyée à l'IA (`ai_allowed = false` posé par la base).
 */

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Valeur dans [min, max], arrondie à `d` décimales, sinon `null`. */
const within = (v: unknown, min: number, max: number, d = 0): number | null => {
  const n = finite(v);
  if (n === null || n < min || n > max) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Secondes → minutes (≥ 0), sinon `null`. */
const minutes = (sec: unknown, max = 1440): number | null => {
  const n = finite(sec);
  return n === null || n < 0 || n / 60 > max ? null : Math.round(n / 60);
};

const isoAt = (sec: unknown): string | null => {
  const n = finite(sec);
  return n === null || n <= 0 ? null : new Date(n * 1000).toISOString();
};

export function localDay(startSec: number, offsetSec: number | null): string {
  return new Date((startSec + (offsetSec ?? 0)) * 1000).toISOString().slice(0, 10);
}

/** Jour du résumé : `calendarDate`, sinon jour local du départ. */
export function calendarDate(e: Record<string, unknown>): string | null {
  const d = e.calendarDate;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const start = finite(e.startTimeInSeconds) ?? finite(e.measurementTimeInSeconds);
  const off = finite(e.startTimeOffsetInSeconds) ?? finite(e.measurementTimeOffsetInSeconds) ?? finite(e.offsetInSeconds);
  return start !== null && start > 0 ? localDay(start, off) : null;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const offsetValues = (m: unknown): Array<[number, number]> => {
  if (!m || typeof m !== "object" || Array.isArray(m)) return [];
  const out: Array<[number, number]> = [];
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    const o = Number(k);
    const n = finite(v);
    if (Number.isFinite(o) && n !== null) out.push([o, n]);
  }
  return out.sort((a, b) => a[0] - b[0]);
};

/** Types de résumé santé rangés dans `provider_dailies` (+ séries). */
export const HEALTH_DAILY_TYPES = [
  "dailies", "sleeps", "hrv", "pulseox", "allDayRespiration", "stressDetails", "epochs",
  "skinTemp", "userMetrics", "hydration", "bodyComps", "bloodPressures",
] as const;

export type DailyFields = Record<string, number | string | Record<string, unknown> | null>;

export interface GarminDaily {
  kind: string;
  day: string;
  fields: DailyFields;
  /** Brut allégé : sans les grandes séries (le brut complet est dans `provider_raw_records`). */
  raw: Record<string, unknown>;
}

const HEAVY_KEYS = /^(timeOffset|sleepLevelsMap$|hrvValues$|bodyBatteryActivityEvents$|readings$)/;

export function lightRaw(e: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(e).filter(([k]) => !HEAVY_KEYS.test(k)));
}

const stressLevel = (v: unknown) => within(v, 0, 100);

/**
 * Résumé santé Garmin → champs `provider_dailies`. `null` si le type n'est
 * pas un type santé connu ou si le jour est introuvable.
 */
export function mapGarminDaily(kind: string, e: Record<string, unknown>): GarminDaily | null {
  if (!(HEALTH_DAILY_TYPES as readonly string[]).includes(kind)) return null;
  const day = calendarDate(e);
  if (!day) return null;
  const out = (fields: DailyFields): GarminDaily => ({ kind, day, fields, raw: lightRaw(e) });

  switch (kind) {
    case "dailies": {
      const active = within(e.activeKilocalories, 0, 20000);
      const bmr = within(e.bmrKilocalories, 0, 10000);
      return out({
        resting_hr: within(e.restingHeartRateInBeatsPerMinute, 20, 150),
        hr_min: within(e.minHeartRateInBeatsPerMinute, 20, 250),
        hr_max: within(e.maxHeartRateInBeatsPerMinute, 20, 250),
        hr_avg: within(e.averageHeartRateInBeatsPerMinute, 20, 250),
        steps: within(e.steps, 0, 200000),
        distance_m: within(e.distanceInMeters, 0, 500000, 1),
        floors_climbed: within(e.floorsClimbed, 0, 1000),
        active_kcal: active,
        bmr_kcal: bmr,
        total_kcal: active !== null && bmr !== null ? active + bmr : null,
        active_time_min: minutes(e.activeTimeInSeconds),
        intensity_moderate_min: minutes(e.moderateIntensityDurationInSeconds),
        intensity_vigorous_min: minutes(e.vigorousIntensityDurationInSeconds),
        // Garmin code « pas de mesure » par -1 / -2 sur le stress : pas un niveau.
        stress_avg: stressLevel(e.averageStressLevel),
        stress_max: stressLevel(e.maxStressLevel),
        stress_rest_min: minutes(e.restStressDurationInSeconds),
        stress_low_min: minutes(e.lowStressDurationInSeconds),
        stress_medium_min: minutes(e.mediumStressDurationInSeconds),
        stress_high_min: minutes(e.highStressDurationInSeconds),
        stress_activity_min: minutes(e.activityStressDurationInSeconds),
        body_battery_charged: within(e.bodyBatteryChargedValue, 0, 100),
        body_battery_drained: within(e.bodyBatteryDrainedValue, 0, 100),
      });
    }
    case "sleeps": {
      const total = minutes(e.durationInSeconds);
      const score = e.overallSleepScore && typeof e.overallSleepScore === "object"
        ? (e.overallSleepScore as Record<string, unknown>).value
        : e.sleepScore;
      const start = finite(e.startTimeInSeconds);
      const dur = finite(e.durationInSeconds);
      const resp = offsetValues(e.timeOffsetSleepRespiration).map(([, v]) => v).filter((v) => v > 0 && v < 80);
      const r = avg(resp);
      return out({
        sleep_total_min: total === 0 ? null : total,
        sleep_deep_min: minutes(e.deepSleepDurationInSeconds),
        sleep_rem_min: minutes(e.remSleepInSeconds ?? e.remSleepDurationInSeconds),
        sleep_light_min: minutes(e.lightSleepDurationInSeconds),
        sleep_awake_min: minutes(e.awakeDurationInSeconds),
        sleep_nap_min: minutes(e.totalNapDurationInSeconds),
        sleep_start_at: isoAt(start),
        sleep_end_at: start !== null && dur !== null && dur > 0 ? isoAt(start + dur) : null,
        sleep_score: within(score, 0, 100),
        sleep_subscores: e.sleepScores && typeof e.sleepScores === "object" && !Array.isArray(e.sleepScores)
          ? (e.sleepScores as Record<string, unknown>)
          : null,
        respiration_sleep_avg: r === null ? null : Math.round(r * 10) / 10,
      });
    }
    case "hrv":
      return out({
        hrv_ms: within(e.lastNightAvg, 0.01, 500, 2),
        hrv_peak_5min_ms: within(e.lastNight5MinHigh, 0.01, 500, 2),
      });
    case "skinTemp":
      return out({ skin_temp_delta_c: within(e.avgDeviationCelsius, -10, 10, 2) });
    case "userMetrics":
      return out({
        vo2max: within(e.vo2Max, 10, 100, 1),
        vo2max_cycling: within(e.vo2MaxCycling, 10, 100, 1),
        fitness_age: within(e.fitnessAge, 5, 120),
      });
    case "hydration":
      return out({ hydration_ml: within(e.fluidIntakeInML ?? e.valueInML, 0, 30000) });
    case "bodyComps": {
      const g = (v: unknown, max: number) => {
        const n = within(v, 0.001, max * 1000);
        return n === null ? null : Math.round(n / 100) / 10;
      };
      return out({
        weight_kg: g(e.weightInGrams, 400),
        body_fat_pct: within(e.bodyFatInPercent, 1, 80, 1),
        bmi: within(e.bodyMassIndex, 8, 80, 1),
        muscle_mass_kg: g(e.muscleMassInGrams, 200),
        bone_mass_kg: g(e.boneMassInGrams, 20),
        body_water_pct: within(e.bodyWaterInPercent, 20, 90, 1),
      });
    }
    case "bloodPressures":
      return out({
        bp_systolic: within(e.systolic, 50, 260),
        bp_diastolic: within(e.diastolic, 30, 180),
        bp_pulse: within(e.pulse, 20, 250),
      });
    default:
      // pulseox, allDayRespiration, stressDetails, epochs : valeurs du jour
      // calculées depuis leurs séries (`provider_intraday_merge`).
      return out({});
  }
}

// ── Séries de la journée ─────────────────────────────────────────────────────

export type IntradayMeasure =
  | "hr" | "stress" | "body_battery" | "respiration" | "spo2" | "hrv" | "sleep_stage" | "sleep_respiration"
  | "sleep_spo2" | "steps" | "distance" | "active_kcal" | "met" | "intensity";

export interface IntradaySeries {
  day: string;
  measure: IntradayMeasure;
  /** Secondes depuis minuit local du jour. */
  offsets: number[];
  values: number[];
  utcOffsetS: number | null;
}

/** Codes des phases de sommeil (`sleep_stage`). 0 = fin de la nuit. */
export const SLEEP_STAGE_CODES = { deep: 1, light: 2, rem: 3, awake: 4 } as const;
const INTENSITY_CODES: Record<string, number> = { SEDENTARY: 0, ACTIVE: 1, HIGHLY_ACTIVE: 2 };

/**
 * Séries d'un résumé santé. Les décalages Garmin sont relatifs au départ du
 * résumé (`startTimeInSeconds`) : on les ramène à minuit local du jour.
 */
export function mapGarminIntraday(kind: string, e: Record<string, unknown>): IntradaySeries[] {
  const day = calendarDate(e);
  const start = finite(e.startTimeInSeconds);
  if (!day || start === null) return [];
  const utc = finite(e.startTimeOffsetInSeconds);
  const midnightLocal = Date.parse(`${day}T00:00:00Z`) / 1000;
  const base = start + (utc ?? 0) - midnightLocal;

  const series = (
    measure: IntradayMeasure,
    m: unknown,
    keep: (v: number) => boolean,
    round = 1,
  ): IntradaySeries | null => {
    const pts = offsetValues(m).filter(([, v]) => keep(v));
    if (pts.length === 0) return null;
    return {
      day,
      measure,
      offsets: pts.map(([o]) => Math.round(base + o)),
      values: pts.map(([, v]) => Math.round(v * round) / round),
      utcOffsetS: utc,
    };
  };
  const list = (...xs: Array<IntradaySeries | null>) => xs.filter((x): x is IntradaySeries => x !== null);

  switch (kind) {
    case "dailies":
      return list(series("hr", e.timeOffsetHeartRateSamples, (v) => v >= 20 && v <= 250));
    case "stressDetails":
      return list(
        series("stress", e.timeOffsetStressLevelValues, (v) => v >= 0 && v <= 100),
        series("body_battery", e.timeOffsetBodyBatteryValues, (v) => v >= 0 && v <= 100),
      );
    case "allDayRespiration":
      return list(series("respiration", e.timeOffsetEpochToBreaths, (v) => v > 0 && v < 80, 10));
    case "pulseox":
      return list(series("spo2", e.timeOffsetSpo2Values, (v) => v >= 50 && v <= 100));
    case "hrv":
      return list(series("hrv", e.hrvValues, (v) => v > 0 && v < 500, 10));
    case "sleeps": {
      const out = list(
        series("sleep_respiration", e.timeOffsetSleepRespiration, (v) => v > 0 && v < 80, 10),
        series("sleep_spo2", e.timeOffsetSleepSpo2, (v) => v >= 50 && v <= 100),
      );
      const map = e.sleepLevelsMap;
      if (map && typeof map === "object") {
        const pts: Array<[number, number]> = [];
        let lastEnd: number | null = null;
        for (const [stage, code] of Object.entries(SLEEP_STAGE_CODES)) {
          const arr = (map as Record<string, unknown>)[stage];
          if (!Array.isArray(arr)) continue;
          for (const it of arr) {
            const s = finite((it as Record<string, unknown>)?.startTimeInSeconds);
            const en = finite((it as Record<string, unknown>)?.endTimeInSeconds);
            if (s === null) continue;
            pts.push([Math.round(s + (utc ?? 0) - midnightLocal), code]);
            if (en !== null && (lastEnd === null || en > lastEnd)) lastEnd = en;
          }
        }
        if (pts.length) {
          pts.sort((a, b) => a[0] - b[0]);
          if (lastEnd !== null) pts.push([Math.round(lastEnd + (utc ?? 0) - midnightLocal), 0]);
          out.push({ day, measure: "sleep_stage", offsets: pts.map((p) => p[0]), values: pts.map((p) => p[1]), utcOffsetS: utc });
        }
      }
      return out;
    }
    case "epochs": {
      const at = Math.round(base);
      const one = (measure: IntradayMeasure, v: number | null): IntradaySeries | null =>
        v === null ? null : { day, measure, offsets: [at], values: [v], utcOffsetS: utc };
      const intensity = typeof e.intensity === "string" ? INTENSITY_CODES[e.intensity] ?? null : null;
      return list(
        one("steps", within(e.steps, 0, 20000)),
        one("distance", within(e.distanceInMeters, 0, 20000, 1)),
        one("active_kcal", within(e.activeKilocalories, 0, 5000, 1)),
        one("met", within(e.met, 0, 30, 1)),
        one("intensity", intensity),
      );
    }
    default:
      return [];
  }
}

// ── Move IQ ──────────────────────────────────────────────────────────────────

export interface GarminMoveIQRow {
  source: "garmin";
  external_id: string;
  day: string;
  started_at: string;
  duration_s: number | null;
  activity_type: string | null;
}

export function mapGarminMoveIQ(e: Record<string, unknown>): GarminMoveIQRow | null {
  const id = typeof e.summaryId === "string" ? e.summaryId : null;
  const start = finite(e.startTimeInSeconds);
  const day = calendarDate(e);
  if (!id || start === null || start <= 0 || !day) return null;
  const dur = finite(e.durationInSeconds);
  return {
    source: "garmin",
    external_id: id.slice(0, 200),
    day,
    started_at: new Date(start * 1000).toISOString(),
    duration_s: dur === null || dur < 0 ? null : Math.round(dur),
    activity_type: typeof e.activityType === "string" ? e.activityType.slice(0, 60) : null,
  };
}
