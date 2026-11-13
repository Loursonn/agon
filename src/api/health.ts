import type { QueryClient } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import type { IntradayMeasure } from "@shared/providers/garminHealth";
import { providerAttribution } from "@/lib/activityDisplay";
import { db, unwrapRows } from "./client";

/**
 * Santé des montres : résumé du jour (`provider_dailies`) et séries de la
 * journée (`provider_intraday`), par athlète et plage de jours.
 *
 * Lecture seule : tout est écrit côté serveur (webhook Garmin, synchro COROS).
 * Mesure absente = `null` (affichée « — »), jamais 0. Les scores de marque
 * (Body Battery, score de sommeil, stress, VO2max…) s'affichent avec leur
 * source mais n'entrent dans aucun calcul d'Agon.
 */

export const healthKeys = {
  all: (aid: string) => ["health", aid] as const,
  days: (aid: string, from: IsoDay, to: IsoDay) => ["health", aid, "days", from, to] as const,
  intraday: (aid: string, from: IsoDay, to: IsoDay, measures: readonly string[]) =>
    ["health", aid, "intraday", from, to, measures.join(",")] as const,
};

/** Après une synchro ou une déconnexion. */
export function invalidateHealth(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: healthKeys.all(athleteId) }),
    // Le feu du matin lit la VFC, la FC de repos et le sommeil.
    qc.invalidateQueries({ queryKey: ["wellnessLight", athleteId] }),
  ]).then(() => undefined);
}

/** Colonnes numériques du résumé du jour (nom en base → nom renvoyé). */
const NUMERIC = {
  resting_hr: "restingHr", hr_min: "hrMin", hr_max: "hrMax", hr_avg: "hrAvg",
  steps: "steps", distance_m: "distanceM", floors_climbed: "floorsClimbed",
  active_kcal: "activeKcal", bmr_kcal: "bmrKcal", total_kcal: "totalKcal", active_time_min: "activeTimeMin",
  intensity_moderate_min: "intensityModerateMin", intensity_vigorous_min: "intensityVigorousMin",
  stress_avg: "stressAvg", stress_max: "stressMax", stress_rest_min: "stressRestMin", stress_low_min: "stressLowMin",
  stress_medium_min: "stressMediumMin", stress_high_min: "stressHighMin", stress_activity_min: "stressActivityMin",
  body_battery_min: "bodyBatteryMin", body_battery_max: "bodyBatteryMax",
  body_battery_charged: "bodyBatteryCharged", body_battery_drained: "bodyBatteryDrained",
  sleep_total_min: "sleepTotalMin", sleep_deep_min: "sleepDeepMin", sleep_rem_min: "sleepRemMin",
  sleep_light_min: "sleepLightMin", sleep_awake_min: "sleepAwakeMin", sleep_nap_min: "sleepNapMin",
  sleep_score: "sleepScore",
  hrv_ms: "hrvMs", hrv_peak_5min_ms: "hrvPeak5MinMs",
  spo2_avg: "spo2Avg", spo2_min: "spo2Min", respiration_sleep_avg: "respirationSleepAvg",
  respiration_day_avg: "respirationDayAvg", skin_temp_delta_c: "skinTempDeltaC",
  vo2max: "vo2max", vo2max_cycling: "vo2maxCycling", fitness_age: "fitnessAge", hydration_ml: "hydrationMl",
  weight_kg: "weightKg", body_fat_pct: "bodyFatPct", bmi: "bmi", muscle_mass_kg: "muscleMassKg",
  bone_mass_kg: "boneMassKg", body_water_pct: "bodyWaterPct",
  bp_systolic: "bpSystolic", bp_diastolic: "bpDiastolic", bp_pulse: "bpPulse",
} as const;

type NumericKey = (typeof NUMERIC)[keyof typeof NUMERIC];

export type HealthDay = { [K in NumericKey]: number | null } & {
  day: IsoDay;
  source: string;
  /** « Garmin », « COROS » : attribution affichée avec chaque mesure. */
  attribution: string;
  sleepStartAt: string | null;
  sleepEndAt: string | null;
  sleepSubscores: Record<string, unknown> | null;
};

const ATTRIBUTION: Record<string, string> = { garmin: "Garmin", coros: "COROS", garmin_export: "Garmin" };

/** Fournisseur d'une source de santé (l'export de compte Garmin reste Garmin). */
const brandOf = (source: string) => (source === "garmin_export" ? "garmin" : source);

/**
 * Dernier modèle de montre connu par fournisseur, lu sur les activités : les
 * résumés du jour n'en portent pas, et Garmin exige « Garmin [modèle] » à côté
 * de chaque mesure affichée.
 */
async function latestDevices(athleteId: string, sources: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const brands = [...new Set(sources.map(brandOf))].filter((b) => b === "garmin" || b === "coros");
  for (const brand of brands) {
    const rows = unwrapRows(
      await db().from("provider_activities")
        .select("device_name, started_at")
        .eq("athlete_id", athleteId)
        .eq("source", brand)
        .order("started_at", { ascending: false })
        .limit(10),
      "modèle de la montre",
    ) as Array<{ device_name: string | null }>;
    const hit = rows.find((r) => typeof r.device_name === "string" && r.device_name.trim() !== "");
    if (hit?.device_name) out.set(brand, hit.device_name);
  }
  return out;
}

const attributionOf = (source: string, devices: Map<string, string>) => {
  const device = devices.get(brandOf(source));
  return device ? providerAttribution(brandOf(source), device) : ATTRIBUTION[source] ?? source;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const DAY_COLS = [
  "day", "source", "sleep_start_at", "sleep_end_at", "sleep_subscores", ...Object.keys(NUMERIC),
].join(", ");

/** Résumés du jour entre deux jours inclus (un par source et par jour), dans l'ordre chronologique. */
export async function getHealthDays(athleteId: string, from: IsoDay, to: IsoDay): Promise<HealthDay[]> {
  const rows = unwrapRows(
    await db().from("provider_dailies")
      .select(DAY_COLS)
      .eq("athlete_id", athleteId)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true }),
    "santé du jour",
  ) as unknown as Array<Record<string, unknown>>;
  const devices = rows.length ? await latestDevices(athleteId, rows.map((r) => String(r.source))) : new Map<string, string>();
  return rows.map((r) => {
    const out = {
      day: r.day as IsoDay,
      source: String(r.source),
      attribution: attributionOf(String(r.source), devices),
      sleepStartAt: (r.sleep_start_at as string | null) ?? null,
      sleepEndAt: (r.sleep_end_at as string | null) ?? null,
      sleepSubscores: (r.sleep_subscores as Record<string, unknown> | null) ?? null,
    } as HealthDay;
    for (const [col, key] of Object.entries(NUMERIC)) out[key as NumericKey] = num(r[col]);
    return out;
  });
}

export interface IntradaySeries {
  day: IsoDay;
  source: string;
  attribution: string;
  measure: IntradayMeasure;
  /** Secondes depuis minuit local du jour (négatif : la veille, pour le sommeil). */
  offsets: number[];
  values: number[];
}

/**
 * Séries de la journée (FC, stress, Body Battery, SpO2, respiration, VFC,
 * phases de sommeil, epochs) entre deux jours inclus. À charger pour un jour
 * ou une semaine affichés, jamais pour une liste d'athlètes.
 */
export async function getIntraday(
  athleteId: string,
  from: IsoDay,
  to: IsoDay,
  measures?: readonly IntradayMeasure[],
): Promise<IntradaySeries[]> {
  let q = db().from("provider_intraday")
    .select("day, source, measure, offsets, values")
    .eq("athlete_id", athleteId)
    .gte("day", from)
    .lte("day", to);
  if (measures?.length) q = q.in("measure", [...measures]);
  const rows = unwrapRows(await q.order("day", { ascending: true }), "séries de la journée");
  const devices = rows.length ? await latestDevices(athleteId, rows.map((r) => r.source)) : new Map<string, string>();
  return rows.map((r) => ({
    day: r.day as IsoDay,
    source: r.source,
    attribution: attributionOf(r.source, devices),
    measure: r.measure as IntradayMeasure,
    offsets: (r.offsets ?? []).map(Number),
    values: (r.values ?? []).map(Number),
  }));
}
