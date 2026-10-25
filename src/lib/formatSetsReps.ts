/**
 * Formateur unique séries × répétitions, côté coach ET athlète.
 *
 * reps_mode vaut 'EC' (répétitions) ou 'iso' (reps = secondes de maintien).
 * Pas de changement de schéma : en iso, `reps` contient des secondes.
 *   EC  → « 4 × 8 », « 4 × 8-10 », « 8 / 6 / 4 »
 *   iso → « 4 × 30 s », « 4 × 30-40 s », « 30 s / 20 s »
 */
import type { ExerciceParams, ParamValue } from "@/features/coach/components/programmation/types";
import { formatClusterReps } from "@/features/coach/components/programmation/clusterFormat";

type RepsParams = Pick<ExerciceParams, "nb_series" | "reps" | "reps_max" | "reps_mode" | "cluster">;

function at<T>(pv: ParamValue<T> | undefined, i: number): T | undefined {
  if (!pv) return undefined;
  return pv.mode === "global" ? pv.value : pv.values?.[i];
}

/** Série `i` (0-based) en isométrie ? */
export function isIsoAt(p: Pick<ExerciceParams, "reps_mode"> | null | undefined, i = 0): boolean {
  return at(p?.reps_mode, i) === "iso";
}

/** Au moins une série en isométrie (pour le badge « Iso »). */
export function hasIso(p: Pick<ExerciceParams, "reps_mode" | "nb_series"> | null | undefined): boolean {
  if (!p?.reps_mode) return false;
  if (p.reps_mode.mode === "global") return p.reps_mode.value === "iso";
  return (p.reps_mode.values ?? []).some((v) => v === "iso");
}

/** Toutes les séries en isométrie. */
export function isAllIso(p: Pick<ExerciceParams, "reps_mode" | "nb_series"> | null | undefined): boolean {
  if (!p?.reps_mode) return false;
  if (p.reps_mode.mode === "global") return p.reps_mode.value === "iso";
  const n = Math.max(p.nb_series ?? 0, 1);
  const vals = p.reps_mode.values ?? [];
  return Array.from({ length: n }, (_, i) => vals[i] === "iso").every(Boolean);
}

function range(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null) return "?";
  return max != null && max !== min ? `${min}-${max}` : String(min);
}

/** Répétitions (ou secondes) de la série `i`, avec unité en iso : « 8-10 », « 30 s ». */
export function formatRepsAt(p: RepsParams, i = 0): string {
  const r = range(at(p.reps, i), at(p.reps_max, i));
  return isIsoAt(p, i) ? `${r} s` : r;
}

/** Répétitions seules (sans nombre de séries) : « 8-10 », « 30 s », « 8 / 6 / 4 ». */
export function formatReps(p: RepsParams): string {
  if (p.cluster) return formatClusterReps(p.cluster);
  if (!p.reps) return "?";
  const perSet = p.reps.mode === "par_serie" || p.reps_max?.mode === "par_serie" || p.reps_mode?.mode === "par_serie";
  if (!perSet) return formatRepsAt(p, 0);
  const n = Math.max(p.nb_series ?? 0, 1);
  const parts = Array.from({ length: n }, (_, i) => formatRepsAt(p, i));
  return parts.every((x) => x === parts[0]) ? parts[0] : parts.join(" / ");
}

/** « 4 × 8 », « 4 × 30 s », « 3 × (3+2+1 + 15s) », « 8 / 6 / 4 » quand les séries diffèrent. */
export function formatSetsReps(p: RepsParams | null | undefined): string {
  if (!p) return "—";
  const reps = formatReps(p);
  if (reps.includes(" / ")) return reps;
  return `${p.nb_series} × ${reps}`;
}

/** Variante pour les données déjà aplaties (Retours) : séries + reps_range texte. */
export function formatPlannedSetsReps(sets: number, repsRange: string | null | undefined, isIso?: boolean): string {
  const r = repsRange ?? "—";
  return `${sets} × ${r}${isIso && repsRange ? " s" : ""}`;
}
