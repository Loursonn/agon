/**
 * Écriture « planning » d'un exercice du programme, pour une occurrence :
 *   « 4 × 6 @ 75 % · RIR 2 · tempo 30X1 »
 * Lecture seule (vue staff). S'appuie sur les formateurs partagés.
 */
import type { Exercice, ExerciceParams, ParamValue } from "@/features/coach/components/programmation/types";
import { formatSetsReps } from "@/lib/formatSetsReps";
import { resolveExerciceParams } from "@/lib/sessionOccurrence";

function values<T>(pv: ParamValue<T> | undefined, n: number): T[] {
  if (!pv) return [];
  if (pv.mode === "global") return [pv.value];
  return Array.from({ length: Math.max(n, 1) }, (_, i) => pv.values?.[i] as T);
}

/** Valeurs distinctes non vides, jointes par « / » (« 70/75/80 »). */
function joined<T>(pv: ParamValue<T> | undefined, n: number): string {
  const vals = values(pv, n).filter((v) => v !== null && v !== undefined && v !== "");
  if (vals.length === 0) return "";
  const uniq = vals.every((v) => v === vals[0]) ? [vals[0]] : vals;
  return uniq.map(String).join("/");
}

function formatCharge(p: ExerciceParams): string {
  if (p.charge_unit === "PDC") return "PDC";
  const v = joined(p.charge, p.nb_series);
  if (!v) return "";
  return p.charge_unit === "%RM" ? `${v} %` : `${v} kg`;
}

export interface PrescriptionLine {
  name: string;
  detail: string;
  comment?: string;
}

export function formatExercice(ex: Exercice, occurrence: number): PrescriptionLine {
  if (ex.mode === "libre") {
    return { name: ex.exercise_name, detail: ex.libre_text?.trim() || "Consigne libre", comment: ex.comment };
  }
  const p = resolveExerciceParams(ex.params, occurrence);
  if (!p) return { name: ex.exercise_name, detail: "", comment: ex.comment };
  const parts = [formatSetsReps(p)];
  const charge = formatCharge(p);
  if (charge) parts[0] += ` @ ${charge}`;
  const rir = joined(p.rir, p.nb_series);
  if (rir) parts.push(`RIR ${rir}`);
  const tempo = joined(p.tempo, p.nb_series);
  if (tempo) parts.push(`tempo ${tempo}`);
  if (ex.mode === "methode") parts.push("méthode");
  return { name: ex.exercise_name, detail: parts.join(" · "), comment: ex.comment };
}

/** Récupération / départ d'un bloc : « repos 2'00 », « départ toutes les 1'30 ». */
export function formatBlocTiming(b: {
  timing_mode: "libre" | "depart" | "repos";
  timing_depart_min?: number; timing_depart_sec?: number;
  timing_repos_min?: number; timing_repos_sec?: number;
  series_mode: "libre" | "fixe"; series_count?: number;
}): string {
  const mmss = (m = 0, s = 0) => `${m}'${String(s).padStart(2, "0")}`;
  const parts: string[] = [];
  if (b.series_mode === "fixe" && b.series_count) parts.push(`${b.series_count} tours`);
  if (b.timing_mode === "repos" && (b.timing_repos_min || b.timing_repos_sec)) parts.push(`repos ${mmss(b.timing_repos_min, b.timing_repos_sec)}`);
  if (b.timing_mode === "depart" && (b.timing_depart_min || b.timing_depart_sec)) parts.push(`départ ${mmss(b.timing_depart_min, b.timing_depart_sec)}`);
  return parts.join(" · ");
}
