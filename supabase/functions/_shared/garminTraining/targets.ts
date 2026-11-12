/**
 * Cibles d'une étape : la consigne Agon traduite en valeurs absolues pour la
 * montre (bpm, m/s, watts), avec les zones, tests et références de l'athlète.
 *
 * Règle : tout part d'Agon. Les zones de la montre ne sont jamais utilisées ;
 * une consigne qu'Agon ne sait pas chiffrer (zones ou test absents, consigne
 * texte) part sans cible, avec son texte dans la description — jamais un
 * chiffre inventé.
 */
import { REFERENCE_UNITS, normalizeMetricName, type ReferenceKey } from "../domain/performance.ts";
import type { AgonTarget, AthleteTrainingContext, GarminSport, GarminTargetType } from "./types.ts";

export interface StepTarget {
  targetType: GarminTargetType | null;
  low: number | null;
  high: number | null;
  /** Consigne affichée en description (toujours renseignée quand il y a une consigne). */
  label: string | null;
}

const NONE: StepTarget = { targetType: null, low: null, high: null, label: null };

/** Borne basse « ouverte » de la zone 1 et haute de la dernière zone, sans FC repos / FC max connues. */
const HR_FLOOR = 40;
const HR_CEIL = 220;

const round = (v: number) => Math.round(v);
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function refOf(ctx: AthleteTrainingContext, metric: string): { value: number; unit: string | null } | null {
  const key = normalizeMetricName(metric);
  const r = ctx.refs[key];
  if (!r || !ok(r.value)) return null;
  const unit = r.unit ?? REFERENCE_UNITS[key as ReferenceKey] ?? null;
  return { value: r.value, unit };
}

/** Fourchette bpm de la zone `zone` (1..N) avec les bornes basses des zones 2..N. */
export function zoneBpmRange(
  zone: number,
  bounds: readonly number[] | null,
  fcRest: number | null,
  fcMax: number | null,
): { low: number; high: number } | null {
  if (!bounds || bounds.length === 0) return null;
  const n = bounds.length + 1;
  if (!Number.isInteger(zone) || zone < 1 || zone > n) return null;
  const low = zone === 1 ? (ok(fcRest) ? round(fcRest) : HR_FLOOR) : bounds[zone - 2];
  const high = zone === n ? (ok(fcMax) ? round(fcMax) : HR_CEIL) : bounds[zone - 1] - 1;
  return high > low ? { low, high } : null;
}

/** m/s depuis une allure en secondes par km. */
export function speedFromSecPerKm(sPerKm: number): number {
  return round3(1000 / sPerKm);
}

function fmtPace(sPerKm: number): string {
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}/km`;
}

function sorted(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

function speedType(sport: GarminSport): GarminTargetType {
  return sport === "RUNNING" ? "PACE" : "SPEED";
}

/** Texte de la consigne Agon, pour la description (ce que l'athlète lit sur l'écran Agon). */
export function targetLabel(t: AgonTarget): string | null {
  switch (t.kind) {
    case "none":
      return null;
    case "hr_zone":
      return `Zone ${t.zone}`;
    case "hr_pct":
      return `${t.min}–${t.max} % FCmax`;
    case "hr_bpm":
      return `${t.min}–${t.max} bpm`;
    case "pace": {
      const lo = t.min_s_per_unit ?? t.min;
      const hi = t.max_s_per_unit ?? t.max;
      if (!ok(lo) || !ok(hi)) return null;
      const [a, b] = sorted(lo, hi);
      return a === b ? fmtPace(a) : `${fmtPace(a)}–${fmtPace(b)}`;
    }
    case "pace_test_pct":
    case "power_test_pct":
      return `${t.min}–${t.max} % ${t.test_metric}`;
    case "power":
      return `${t.min}–${t.max} W`;
    case "cadence":
      return `${t.min}–${t.max} ${t.unit === "rpm" ? "tr/min" : "pas/min"}`;
    case "x_per_y":
      return `${t.x_value} ${t.x_kind} / ${t.y_value} ${t.y_kind}`;
    case "text":
      return t.value?.trim() || null;
  }
}

/**
 * Cible Garmin d'une consigne Agon. Natation : la Training API n'accepte pas de
 * cible principale, la consigne part en description.
 */
export function convertTarget(t: AgonTarget | undefined, sport: GarminSport, ctx: AthleteTrainingContext): StepTarget {
  if (!t || t.kind === "none") return NONE;
  const label = targetLabel(t);
  const textOnly: StepTarget = { targetType: null, low: null, high: null, label };
  if (sport === "LAP_SWIMMING" || sport === "STRENGTH_TRAINING") return textOnly;

  const fcMax = refOf(ctx, "FCmax")?.value ?? null;
  const fcRest = refOf(ctx, "FCrepos")?.value ?? null;

  switch (t.kind) {
    case "hr_zone": {
      const r = zoneBpmRange(t.zone, ctx.hrZoneBounds, fcRest, fcMax);
      if (!r) return { ...textOnly, label: `${label} (zones FC non renseignées dans Agon)` };
      return { targetType: "HEART_RATE", low: r.low, high: r.high, label: `${label} · ${r.low}–${r.high} bpm` };
    }
    case "hr_pct": {
      if (!ok(fcMax) || !ok(t.min) || !ok(t.max)) return { ...textOnly, label: `${label} (FCmax non renseignée dans Agon)` };
      const [a, b] = sorted(t.min, t.max);
      const low = round((fcMax * a) / 100);
      const high = round((fcMax * b) / 100);
      return { targetType: "HEART_RATE", low, high, label: `${label} · ${low}–${high} bpm` };
    }
    case "hr_bpm": {
      if (!ok(t.min) || !ok(t.max)) return textOnly;
      const [a, b] = sorted(round(t.min), round(t.max));
      return { targetType: "HEART_RATE", low: a, high: b, label };
    }
    case "pace": {
      const lo = t.min_s_per_unit ?? t.min;
      const hi = t.max_s_per_unit ?? t.max;
      if (!ok(lo) || !ok(hi)) return textOnly;
      const [fast, slow] = sorted(lo, hi);
      return { targetType: speedType(sport), low: speedFromSecPerKm(slow), high: speedFromSecPerKm(fast), label };
    }
    case "pace_test_pct": {
      const ref = refOf(ctx, t.test_metric);
      if (!ref || ref.unit !== "km/h" || !ok(t.min) || !ok(t.max)) {
        return { ...textOnly, label: `${label} (${t.test_metric} non renseignée dans Agon)` };
      }
      const [a, b] = sorted(t.min, t.max);
      const low = round3((ref.value * a) / 100 / 3.6);
      const high = round3((ref.value * b) / 100 / 3.6);
      const pace = (ms: number) => fmtPace(1000 / ms);
      return { targetType: speedType(sport), low, high, label: `${label} · ${pace(high)}–${pace(low)}` };
    }
    case "power": {
      if (!ok(t.min) || !ok(t.max)) return textOnly;
      const [a, b] = sorted(round(t.min), round(t.max));
      return { targetType: "POWER", low: a, high: b, label };
    }
    case "power_test_pct": {
      const ref = refOf(ctx, t.test_metric);
      if (!ref || ref.unit !== "W" || !ok(t.min) || !ok(t.max)) {
        return { ...textOnly, label: `${label} (${t.test_metric} non renseignée dans Agon)` };
      }
      const [a, b] = sorted(t.min, t.max);
      const low = round((ref.value * a) / 100);
      const high = round((ref.value * b) / 100);
      return { targetType: "POWER", low, high, label: `${label} · ${low}–${high} W` };
    }
    case "cadence": {
      if (!ok(t.min) || !ok(t.max)) return textOnly;
      const [a, b] = sorted(round(t.min), round(t.max));
      return { targetType: "CADENCE", low: a, high: b, label };
    }
    default:
      return textOnly;
  }
}
