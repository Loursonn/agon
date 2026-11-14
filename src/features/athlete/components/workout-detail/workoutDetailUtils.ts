import type { AllSets, SetState } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import type { AthleteModifications, SessionSetLog } from "@/features/shared/types/athlete";
import type { ExerciceParams } from "@/features/coach/components/programmation/types";
import type { WorkoutBlocData, WorkoutExerciceData } from "@/features/shared/hooks/useWorkoutSession";
import { formatRepsAt, formatSetsReps } from "@/lib/formatSetsReps";
import { loadFromPctRm } from "@shared/domain/performance";
import { C, H } from "@/lib/theme";

// ── Helpers ────────────────────────────────────────────────────────────────────

export function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

export function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function parsePrevVal(str: string, field: "kg" | "reps"): string {
  if (!str || str === "—") return "";
  if (field === "kg") {
    const m = str.match(/^([\d,]+(?:\.\d+)?)/);
    return m ? m[1] : "";
  }
  const m = str.match(/×(\d+)/);
  return m ? m[1] : "";
}

/**
 * Charge à pré-remplir. En %RM, la valeur prescrite (« 75 ») est un
 * pourcentage : avant, elle s'affichait telle quelle dans la case kg et 75 kg
 * étaient enregistrés dès que l'athlète validait la série sans corriger.
 * Elle est maintenant convertie avec le 1RM de l'athlète (record, sinon 1RM
 * fictif du coach), arrondie à 0,5 kg ; sans 1RM, la case reste vide (la
 * consigne « @ 75%RM » reste affichée dans l'en-tête de l'exercice).
 */
export function prescribedKg(params: ExerciceParams, raw: number | null | undefined, oneRm: number | null | undefined): number | null {
  if (raw == null) return null;
  if (params.charge_unit === "kg") return raw;
  if (params.charge_unit === "%RM") return loadFromPctRm(oneRm ?? params.manual_rm, raw);
  return null;
}

export function getSetTarget(
  params: ExerciceParams,
  setIdx: number,
  oneRm?: number | null,
): { reps?: number; kg?: number | null; rir?: number | null } {
  const reps =
    params.reps.mode === "par_serie" ? params.reps.values[setIdx] : params.reps.value;
  const kg = prescribedKg(
    params,
    params.charge.mode === "par_serie" ? params.charge.values[setIdx] : params.charge.value,
    oneRm,
  );
  const rir =
    params.rir.mode === "par_serie"
      ? (params.rir.values as (number | null)[])[setIdx]
      : params.rir.value;
  return { reps, kg, rir };
}

export function initSetState(
  params: ExerciceParams,
  setIdx: number,
  saved?: SessionSetLog,
  oneRm?: number | null,
): SetState {
  if (saved) {
    return {
      kg: saved.kg != null ? String(saved.kg).replace(".", ",") : "",
      reps: saved.reps != null ? String(saved.reps) : "",
      rir: saved.rir != null ? String(saved.rir) : "",
      done: saved.done,
      skipped: saved.skipped ?? false,
    };
  }
  const t = getSetTarget(params, setIdx, oneRm);
  return {
    kg: t.kg != null ? String(t.kg).replace(".", ",") : "",
    reps: t.reps != null ? String(t.reps) : "",
    rir: t.rir != null ? String(t.rir) : "",
    done: false,
    skipped: false,
  };
}

export const BLANK_SET: SetState = { kg: "", reps: "", rir: "", done: false, skipped: false };

/**
 * Ramène n'importe quelle valeur à un SetState complet.
 * Indispensable : une ligne absente (exercice apparu après l'init, index hors
 * bornes) donnait `{...undefined}` = objet vide → `s.kg` undefined → crash à la
 * sauvegarde ("Cannot read properties of undefined (reading 'replace')").
 */
export function normalizeSet(s: Partial<SetState> | undefined | null): SetState {
  if (!s) return { ...BLANK_SET };
  return {
    kg: s.kg ?? "",
    reps: s.reps ?? "",
    rir: s.rir ?? "",
    done: s.done ?? false,
    skipped: s.skipped ?? false,
  };
}

export function setStateToLog(s: SetState | undefined): SessionSetLog {
  const n = normalizeSet(s);
  const kgStr = n.kg.replace(",", ".");
  return {
    done: n.done,
    skipped: n.skipped,
    kg: kgStr ? parseFloat(kgStr) : undefined,
    reps: n.reps ? parseInt(n.reps) : undefined,
    rir: n.rir === "5+" ? 5 : n.rir !== "" ? parseFloat(n.rir) : undefined,
  };
}

export function allSetsToMods(allSets: AllSets, base: AthleteModifications): AthleteModifications {
  const sessionSets: Record<string, SessionSetLog[]> = {};
  for (const [exId, exSets] of Object.entries(allSets)) {
    sessionSets[exId] = Array.isArray(exSets) ? exSets.map(setStateToLog) : [];
  }
  return { ...base, sessionSets };
}

/**
 * Lignes de séries attendues pour un exercice, à partir de la prescription
 * courante, des séries déjà enregistrées et de la saisie en cours.
 * La saisie en cours (`prev`) gagne toujours, et on ne supprime jamais de ligne
 * (séries bonus, prescription réduite par le coach en cours de séance).
 */
export function buildExSets(
  ex: WorkoutExerciceData,
  saved: SessionSetLog[] | undefined,
  prev: SetState[] | undefined,
  oneRm?: number | null,
): SetState[] {
  if (ex.mode === "libre") {
    // Libre : une seule "série" virtuelle = case à cocher de validation
    const existing = prev?.[0];
    if (existing) return [normalizeSet(existing)];
    const savedItem = saved?.[0];
    return [normalizeSet({ done: savedItem?.done, skipped: savedItem?.skipped })];
  }

  const c = ex.params.cluster;
  const prescribed = c ? ex.params.nb_series * c.nb_clusters : ex.params.nb_series;
  const count = Math.max(prescribed || 0, saved?.length ?? 0, prev?.length ?? 0);

  const safeReps = c ? (Array.isArray(c.reps) ? c.reps : Array(c.nb_clusters).fill(5)) : null;
  const globalKgNum =
    c && ex.params.charge.mode === "global" ? prescribedKg(ex.params, ex.params.charge.value, oneRm) : null;
  const globalKg = globalKgNum != null ? String(globalKgNum).replace(".", ",") : "";

  return Array.from({ length: count }, (_, i) => {
    const existing = prev?.[i];
    if (existing) return normalizeSet(existing);
    const savedItem = saved?.[i];

    if (c && safeReps) {
      const prescribedReps = safeReps[i % c.nb_clusters] ?? 5;
      if (savedItem) {
        return normalizeSet({
          kg: savedItem.kg != null ? String(savedItem.kg).replace(".", ",") : "",
          reps: savedItem.reps != null ? String(savedItem.reps) : String(prescribedReps),
          rir: savedItem.rir != null ? String(savedItem.rir) : "",
          done: savedItem.done,
          skipped: savedItem.skipped,
        });
      }
      return { kg: globalKg, reps: String(prescribedReps), rir: "", done: false, skipped: false };
    }

    return normalizeSet(initSetState(ex.params, i, savedItem ?? undefined, oneRm));
  });
}

export function sameSets(a: SetState[], b: SetState[] | undefined): boolean {
  if (!b || a.length !== b.length) return false;
  return a.every((s, i) => {
    const o = b[i];
    return (
      !!o &&
      s.kg === o.kg && s.reps === o.reps && s.rir === o.rir &&
      s.done === o.done && s.skipped === o.skipped
    );
  });
}

export function formatPrescription(params: ExerciceParams): string {
  const nb = params.nb_series;
  if (params.cluster) {
    const c = params.cluster;
    const repsArr = Array.isArray(c.reps) ? c.reps : Array(c.nb_clusters).fill(5);
    let s = `${nb}×(${repsArr.join("+")} + ${c.recup_sec}s)`;
    const charge = params.charge.mode === "global" ? params.charge.value : null;
    if (charge != null && params.charge_unit !== "PDC") s += ` @ ${charge}${params.charge_unit}`;
    const ct = params.tempo?.mode === "global" && params.tempo.value ? params.tempo.value : null;
    if (ct) s += ` · T ${ct}`;
    return s;
  }
  if (params.reps.mode === "par_serie" || params.charge.mode === "par_serie") {
    const parts = Array.from({ length: nb }, (_, i) => {
      const r = formatRepsAt(params, i);
      const c = params.charge.mode === "par_serie" ? params.charge.values[i] : params.charge.value;
      if (c != null && params.charge_unit !== "PDC") return `${r}@${c}${params.charge_unit}`;
      return r;
    });
    let ps = `${nb}× ${parts.join(" / ")}`;
    const pt = params.tempo?.mode === "global" && params.tempo.value ? params.tempo.value : null;
    if (pt) ps += ` · T ${pt}`;
    return ps;
  }
  const chargeVal =
    params.charge_unit === "PDC"
      ? "PDC"
      : params.charge.mode === "global" && params.charge.value != null
      ? `${params.charge.value}${params.charge_unit}`
      : null;
  const rirVal = params.rir.mode === "global" && params.rir.value != null ? params.rir.value : null;
  let s = formatSetsReps(params);
  if (chargeVal) s += ` @ ${chargeVal}`;
  if (rirVal != null) s += ` · RIR ${rirVal}`;
  const tempoVal = params.tempo?.mode === "global" && params.tempo.value ? params.tempo.value : null;
  if (tempoVal) s += ` · T ${tempoVal}`;
  return s;
}

export function timingLabel(bloc: {
  timing_mode: string;
  timing_repos_min?: number;
  timing_repos_sec?: number;
  timing_depart_min?: number;
  timing_depart_sec?: number;
}): string | null {
  if (bloc.timing_mode === "libre") return null;
  if (bloc.timing_mode === "depart") {
    const min = bloc.timing_depart_min ?? 0;
    const sec = bloc.timing_depart_sec ?? 0;
    return sec > 0
      ? `Départ /${min > 0 ? `${min}min ` : ""}${sec}s`
      : `Départ /${min}min`;
  }
  const min = bloc.timing_repos_min ?? 0;
  const sec = bloc.timing_repos_sec ?? 0;
  if (min > 0 && sec > 0) return `Repos ${min}min ${sec}s`;
  if (min > 0) return `Repos ${min}min`;
  if (sec > 0) return `Repos ${sec}s`;
  return null;
}

export function blocRestSeconds(bloc: {
  timing_mode: string;
  timing_depart_min?: number;
  timing_depart_sec?: number;
  timing_repos_min?: number;
  timing_repos_sec?: number;
}): number {
  if (bloc.timing_mode === "repos") {
    const s = (bloc.timing_repos_min ?? 0) * 60 + (bloc.timing_repos_sec ?? 0);
    return s > 0 ? s : 0;
  }
  if (bloc.timing_mode === "depart") {
    const s = (bloc.timing_depart_min ?? 0) * 60 + (bloc.timing_depart_sec ?? 0);
    return s > 0 ? s : 0;
  }
  return 0; // libre → rien
}
export function getRirColor(val: string): string {
  const n = val === "5+" ? 6 : parseFloat(val);
  if (n <= 0.5) return H.rougeVif;
  if (n <= 1.5) return H.orange;
  if (n <= 2.5) return H.jaune;
  if (n <= 3.5) return H.citron;
  if (n <= 4.5) return H.vert;
  if (n <= 5)   return C.g;
  return H.bleuVif;
}
/** Séries faites / passées / prévues de la séance (fin de séance). */
export function countSets(blocs: WorkoutBlocData[], allSets: AllSets) {
  let totalSets = 0, doneSets = 0, skippedSets = 0;
  for (const bloc of blocs) {
    for (const ex of bloc.exercices) {
      const exSets = allSets[ex.id] ?? [];
      totalSets += exSets.length;
      doneSets += exSets.filter((s) => s?.done).length;
      skippedSets += exSets.filter((s) => s?.skipped).length;
    }
  }
  return { doneSets, skippedSets, totalSets };
}
