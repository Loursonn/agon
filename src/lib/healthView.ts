import type { HealthDay } from "@/api/health";
import { addDays, type IsoDay } from "@shared/domain/dates";

/**
 * Page « Santé » (planche Ath2Sante) : mesures de la nuit venues de la montre,
 * comparées à la zone habituelle de l'athlète (moyenne ± 1 écart type des 28
 * jours précédents, 7 valeurs au moins). Pur et testé.
 */

export type HealthMetricKey = "sleep" | "hrv" | "restingHr" | "stress" | "bodyBattery" | "spo2" | "respiration" | "skinTemp";
export type HealthState = "normal" | "low" | "high" | null;

export interface HealthMetricDef {
  key: HealthMetricKey;
  label: string;
  unit: string;
  pick: (d: HealthDay) => number | null;
  digits: number;
  explain: string;
}

export const HEALTH_METRICS: readonly HealthMetricDef[] = [
  { key: "sleep", label: "Sommeil", unit: "", pick: (d) => d.sleepTotalMin, digits: 0, explain: "Durée de sommeil mesurée par la montre, siestes non comprises. Les phases (profond, léger, paradoxal, éveil) viennent de la montre telles quelles." },
  { key: "hrv", label: "VFC de la nuit", unit: "ms", pick: (d) => d.hrvMs, digits: 0, explain: "La VFC mesure les petites variations entre deux battements pendant ton sommeil. Plus haute que d’habitude : tu as bien récupéré. Plus basse plusieurs jours de suite : fatigue, stress ou début de maladie." },
  { key: "restingHr", label: "FC de repos", unit: "bpm", pick: (d) => d.restingHr, digits: 0, explain: "Ta fréquence cardiaque la plus basse au repos. Plus haute que d’habitude plusieurs jours de suite : fatigue, chaleur, alcool ou début de maladie." },
  { key: "stress", label: "Stress", unit: "/100", pick: (d) => d.stressAvg, digits: 0, explain: "Score de stress moyen de la journée calculé par la montre (0 à 100), affiché tel quel." },
  { key: "bodyBattery", label: "Body Battery", unit: "/100", pick: (d) => d.bodyBatteryMax, digits: 0, explain: "Réserve d’énergie estimée par Garmin (0 à 100), au plus haut de la journée, affichée telle quelle." },
  { key: "spo2", label: "SpO2", unit: "%", pick: (d) => d.spo2Avg, digits: 0, explain: "Saturation en oxygène du sang, moyenne de la nuit." },
  { key: "respiration", label: "Respiration", unit: "/min", pick: (d) => d.respirationSleepAvg, digits: 1, explain: "Nombre de respirations par minute pendant le sommeil." },
  { key: "skinTemp", label: "Température cutanée", unit: "°C", pick: (d) => d.skinTempDeltaC, digits: 1, explain: "Écart de température de la peau la nuit par rapport à ta référence." },
];

/** Une valeur par jour : la première source qui a la mesure (Garmin avant COROS). */
export function dailyValues(days: readonly HealthDay[], pick: (d: HealthDay) => number | null): Map<IsoDay, { v: number; source: string }> {
  const out = new Map<IsoDay, { v: number; source: string }>();
  const sorted = [...days].sort((a, b) => (a.source === b.source ? 0 : a.source === "garmin" ? -1 : 1));
  for (const d of sorted) {
    const v = pick(d);
    if (v != null && Number.isFinite(v) && !out.has(d.day)) out.set(d.day, { v, source: d.attribution });
  }
  return out;
}

export interface Baseline { mean: number; low: number; high: number; n: number }

/** Zone habituelle : 28 jours avant `day` (exclu), au moins 7 valeurs. */
export function baselineAt(values: Map<IsoDay, { v: number }>, day: IsoDay, span = 28): Baseline | null {
  const xs: number[] = [];
  for (let i = 1; i <= span; i++) { const x = values.get(addDays(day, -i)); if (x) xs.push(x.v); }
  if (xs.length < 7) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  return { mean, low: mean - sd, high: mean + sd, n: xs.length };
}

export function stateOf(v: number | null, b: Baseline | null): HealthState {
  if (v == null || !b) return null;
  return v < b.low ? "low" : v > b.high ? "high" : "normal";
}

/** Nuits consécutives (jusqu'à `day` inclus) dans le même état hors zone. */
export function streakOf(values: Map<IsoDay, { v: number }>, day: IsoDay, state: HealthState): number {
  if (state !== "low" && state !== "high") return 0;
  let n = 0;
  for (let d = day; ; d = addDays(d, -1)) {
    const x = values.get(d);
    if (!x || stateOf(x.v, baselineAt(values, d)) !== state) return n;
    n++;
  }
}

/** Série des `n` derniers jours jusqu'à `day` (null = pas de mesure). */
export function seriesTo(values: Map<IsoDay, { v: number }>, day: IsoDay, n: number): Array<{ day: IsoDay; v: number | null }> {
  return Array.from({ length: n }, (_, i) => { const d = addDays(day, i - n + 1); return { day: d, v: values.get(d)?.v ?? null }; });
}

/** 475 → « 7 h 55 » */
export function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

export function fmtValue(def: HealthMetricDef, v: number | null): string {
  if (v == null) return "—";
  if (def.key === "sleep") return fmtMinutes(v);
  return v.toLocaleString("fr-FR", { minimumFractionDigits: def.digits, maximumFractionDigits: def.digits });
}
