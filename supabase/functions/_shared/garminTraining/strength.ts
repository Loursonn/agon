/**
 * Séance de musculation du programme (`asp:prog`, ProgSession) → séance
 * résolue pour une occurrence : paramètres de la bonne semaine, charge en kg
 * calculée comme l'écran athlète (kg, ou %RM × 1RM du record, sinon 1RM fictif
 * du coach), équivalent Garmin de l'exercice.
 */
import { loadFromPctRm } from "../domain/performance.ts";
import { resolveWeekParams } from "../domain/programParams.ts";
import { suggestGarminExercise } from "./exercises.ts";
import type { ResolvedSet, ResolvedStrengthBloc, ResolvedStrengthExercise, ResolvedStrengthSession } from "./types.ts";

type ParamValue<T> = { mode: "global"; value: T } | { mode: "par_serie"; values: T[] };

export interface ProgExerciceParams {
  nb_series: number;
  cluster?: { nb_clusters: number; reps: number[]; recup_sec: number };
  reps: ParamValue<number>;
  reps_max?: ParamValue<number | null>;
  reps_mode: ParamValue<"EC" | "iso">;
  charge_unit: "%RM" | "kg" | "PDC";
  charge: ParamValue<number | null>;
  rir: ParamValue<number | null>;
  tempo: ParamValue<string>;
  manual_rm?: number | null;
}

export interface ProgExercice {
  id: string;
  exercise_id: string;
  exercise_name: string;
  mode: "classique" | "methode" | "libre";
  libre_text?: string;
  methode_id?: string;
  sort_order: number;
  comment?: string;
  superset_with_next?: boolean;
  params: ProgExerciceParams | Record<string, ProgExerciceParams>;
}

export interface ProgBloc {
  name: string;
  category?: string;
  timing_mode: "libre" | "depart" | "repos";
  timing_depart_min?: number;
  timing_depart_sec?: number;
  timing_repos_min?: number;
  timing_repos_sec?: number;
  instructions?: string;
  exercices: ProgExercice[];
  sort_order: number;
}

export interface ProgSessionLite {
  id: string;
  name: string;
  blocs: ProgBloc[];
}

export interface StrengthLookups {
  /** 1RM (kg) de l'exercice programmé, via son record ; null = inconnu. */
  oneRm(ex: ProgExercice): number | null;
  /** Équivalent Garmin de l'exercice de la banque ; null = aucun. */
  garmin(exerciseId: string): { category: string; name: string } | null;
  /** Nom d'une méthode (drop set…) ; null = inconnue. */
  methodName?(id: string): string | null;
}

function at<T>(p: ParamValue<T> | undefined, i: number): T | undefined {
  if (!p) return undefined;
  return p.mode === "par_serie" ? p.values?.[i] : p.value;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function seconds(min?: number, sec?: number): number | null {
  const s = (min ?? 0) * 60 + (sec ?? 0);
  return s > 0 ? s : null;
}

function resolveSet(p: ProgExerciceParams, i: number, oneRm: number | null): ResolvedSet {
  const reps = num(at(p.reps, i));
  const repsMax = num(at(p.reps_max, i));
  const charge = num(at(p.charge, i));
  let kg: number | null = null;
  let loadText: string | null = null;
  if (p.charge_unit === "kg") {
    kg = charge != null && charge > 0 ? charge : null;
  } else if (p.charge_unit === "%RM") {
    kg = loadFromPctRm(oneRm ?? p.manual_rm, charge);
    if (kg == null && charge != null) loadText = `${charge} %RM (1RM non renseigné dans Agon)`;
  } else if (p.charge_unit === "PDC") {
    loadText = "poids du corps";
  }
  const tempo = at(p.tempo, i);
  return {
    reps,
    repsMax,
    iso: at(p.reps_mode, i) === "iso",
    kg,
    loadText,
    rir: num(at(p.rir, i)),
    tempo: typeof tempo === "string" && tempo.trim() ? tempo.trim() : null,
  };
}

/** Équivalent choisi par le coach absent : proposition depuis le nom (corrigeable dans la banque). */
function garminFromName(name: string): { category: string; name: string } | null {
  const s = name ? suggestGarminExercise(name) : null;
  return s ? { category: s.category, name: s.name } : null;
}

function resolveExercise(ex: ProgExercice, occurrence: number, look: StrengthLookups): ResolvedStrengthExercise {
  const base = {
    name: ex.exercise_name,
    garmin: (ex.exercise_id ? look.garmin(ex.exercise_id) : null) ?? garminFromName(ex.exercise_name),
    mode: ex.mode,
    libreText: ex.libre_text ?? null,
    comment: ex.comment ?? null,
    methodName: ex.methode_id ? look.methodName?.(ex.methode_id) ?? null : null,
    supersetWithNext: ex.superset_with_next === true,
  };
  const p = ex.mode === "libre" ? null : resolveWeekParams<ProgExerciceParams>(ex.params, occurrence);
  if (!p) return { ...base, cluster: null, sets: [] };
  const n = Math.max(0, Math.round(p.nb_series || 0));
  const oneRm = p.charge_unit === "%RM" ? look.oneRm(ex) : null;
  return {
    ...base,
    cluster: p.cluster && p.cluster.nb_clusters > 1 ? { reps: p.cluster.reps, restS: p.cluster.recup_sec } : null,
    sets: Array.from({ length: n }, (_, i) => resolveSet(p, i, oneRm)),
  };
}

export function resolveStrengthSession(session: ProgSessionLite, occurrence: number, look: StrengthLookups): ResolvedStrengthSession {
  // Ordre du tableau, comme l'écran athlète (pas `sort_order`).
  const blocs: ResolvedStrengthBloc[] = (session.blocs ?? []).map((b) => ({
      name: b.name,
      category: b.category ?? null,
      instructions: b.instructions ?? null,
      restS: b.timing_mode === "repos" ? seconds(b.timing_repos_min, b.timing_repos_sec) : null,
      departS: b.timing_mode === "depart" ? seconds(b.timing_depart_min, b.timing_depart_sec) : null,
      exercises: (b.exercices ?? []).map((ex) => resolveExercise(ex, occurrence, look)),
    }));
  return { name: session.name, blocs };
}
