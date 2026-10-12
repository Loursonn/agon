import type { EnergyTarget, ExerciseInterval } from "@/types/energy";
import { paceBounds } from "./paceCompat";

/** Formate un EnergyTarget en string lisible en français. Retourne "" si les valeurs sont vides/invalides. */
export function formatTarget(target: EnergyTarget): string {
  if (!target) return "";

  // Guard : valide qu'un nombre est exploitable
  const ok = (v: unknown): v is number => typeof v === "number" && isFinite(v) && !isNaN(v);
  const fmt = (v: number) => (ok(v) ? v : "?");

  switch (target.kind) {
    case "none":
      return "Libre";

    case "hr_zone":
      return ok(target.zone) ? `Zone ${target.zone}` : "";

    case "hr_pct": {
      if (!ok(target.min) && !ok(target.max)) return "";
      if (ok(target.min) && ok(target.max)) return `${fmt(target.min)}–${fmt(target.max)}% FCmax`;
      return `${fmt(ok(target.min) ? target.min : target.max)}% FCmax`;
    }

    case "hr_bpm": {
      if (!ok(target.min) && !ok(target.max)) return "";
      if (ok(target.min) && ok(target.max)) return `${fmt(target.min)}–${fmt(target.max)} bpm`;
      return `${fmt(ok(target.min) ? target.min : target.max)} bpm`;
    }

    case "pace": {
      const { min: pMin, max: pMax } = paceBounds(target);
      const minOk = ok(pMin) && pMin > 0;
      const maxOk = ok(pMax) && pMax > 0;
      if (!minOk && !maxOk) return "";
      if (target.unit === "min_per_km") {
        if (minOk && maxOk) return `${_fmtPace(pMin)}–${_fmtPace(pMax)}/km`;
        return `${_fmtPace(minOk ? pMin : pMax)}/km`;
      }
      // kmh: stored as s/km, display as km/h
      if (minOk && maxOk)
        return `${(3600 / pMin).toFixed(1)}–${(3600 / pMax).toFixed(1)} km/h`;
      const v = minOk ? pMin : pMax;
      return `${(3600 / v).toFixed(1)} km/h`;
    }

    case "pace_test_pct": {
      if (!ok(target.min) && !ok(target.max)) return "";
      return `${fmt(target.min)}–${fmt(target.max)}% ${target.test_metric ?? ""}`;
    }

    case "power": {
      if (!ok(target.min) && !ok(target.max)) return "";
      if (ok(target.min) && ok(target.max)) return `${fmt(target.min)}–${fmt(target.max)} W`;
      return `${fmt(ok(target.min) ? target.min : target.max)} W`;
    }

    case "power_test_pct": {
      if (!ok(target.min) && !ok(target.max)) return "";
      return `${fmt(target.min)}–${fmt(target.max)}% ${target.test_metric ?? ""}`;
    }

    case "cadence": {
      if (!ok(target.min) && !ok(target.max)) return "";
      return `${fmt(target.min)}–${fmt(target.max)} ${target.unit}`;
    }

    case "x_per_y": {
      if (!ok(target.x_value) || !ok(target.y_value)) return "";
      const xLabel = { time: "s", cal: "kcal", watt: "W" }[target.x_kind];
      const yLabel = { time: "s", distance: "m" }[target.y_kind];
      return `${target.x_value} ${xLabel} / ${target.y_value} ${yLabel}`;
    }

    case "text":
      return target.value ?? "";

    default:
      return "";
  }
}

/** Formate des secondes par km en "M'SS" (ex: 260 → "4'20") */
function _fmtPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}'${String(secs).padStart(2, "0")}`;
}

/** Formate des secondes en MM:SS */
export function formatS(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.round(totalSecs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Formate des secondes en HH:MM:SS */
export function formatSLong(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.round(totalSecs % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Résumé d'une étape exercice (WOD) : « 15 reps · 110 kg », « 15 m · 110 kg », « 30 s · PDC ».
 * Distance prioritaire sur les reps (ex. Sled Push 15 m), puis reps, puis temps.
 */
export function formatExerciseStep(ex: ExerciseInterval): string {
  const d = ex.duration;
  const qty = d?.kind === "distance"
    ? `${d.value ?? 0} m`
    : ex.reps_min
    ? (ex.reps_max && ex.reps_max !== ex.reps_min ? `${ex.reps_min}-${ex.reps_max} reps` : `${ex.reps_min} reps`)
    : d?.kind === "time"
    ? formatS(d.value ?? 0)
    : d?.kind === "calories"
    ? `${d.value ?? 0} kcal`
    : null;
  const load = ex.weight_unit === "bw"
    ? (ex.weight_kg ? `PDC + ${ex.weight_kg} kg` : "PDC")
    : ex.weight_kg
    ? (ex.weight_unit === "pct_rm" ? `${ex.weight_kg}% RM` : `${ex.weight_kg} kg`)
    : null;
  return [qty, load].filter(Boolean).join(" · ");
}
