import type { FlatExecStep } from "@/features/athlete/hooks/useSpecificExecution";
import { estimateIntervalDuration } from "@/lib/energy";
import { formatExerciseStep } from "@/lib/energy/formatTarget";

/**
 * Minuteur de la séance spécifique (planche Ath2SeanceSpecifique) : ce que
 * l'écran plein écran affiche à partir de la liste à plat des pas.
 */

export const PHASE_LABEL: Record<string, string> = {
  warmup: "Échauffement", work: "Effort", recovery: "Récup",
  rest: "Repos", cooldown: "Retour au calme", open: "Libre",
};

type Step = FlatExecStep["step"];

/** Pas de récupération (on prépare le suivant). */
export function isRestStep(step: Step): boolean {
  return step.role === "recovery" || step.role === "rest";
}

export function stepTitle(step: Step): string {
  if (step.type === "exercise") return step.exercise_name;
  return step.notes?.trim() || PHASE_LABEL[step.role] || step.role;
}

/** « 40 s · 6 kg · vise 12 reps » / « max de reps · vise 8 ». */
export function stepDetail(step: Step): string {
  if (step.type !== "exercise") return "";
  return formatExerciseStep(step);
}

export function stepSeconds(step: Step): number {
  if (step.type === "exercise" && !step.duration) return 0;
  return estimateIntervalDuration(step);
}

/** « 40 s », « 1:30 ». */
export function fmtShort(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** « 0:27 ». */
export function fmtClock(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** « Tour 3 / 5 » → { round: 3, rounds: 5 }. */
export function roundOf(fs: FlatExecStep | null | undefined): { round: number; rounds: number } | null {
  const m = fs?.roundLabel?.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { round: Number(m[1]), rounds: Number(m[2]) } : null;
}

export interface RoundView {
  /** Exercices du tour en cours (récups exclues). */
  names: string[];
  /** Exercice en cours (effort) ou à venir (récup) dans `names`, -1 sinon. */
  current: number;
}

/** Pas contigus du même tour que `i`. */
function roundRange(flat: readonly FlatExecStep[], i: number): [number, number] {
  const label = flat[i]?.roundLabel;
  if (!label) return [i, i];
  let a = i, b = i;
  while (a > 0 && flat[a - 1].roundLabel === label) a--;
  while (b < flat.length - 1 && flat[b + 1].roundLabel === label) b++;
  return [a, b];
}

export function roundView(flat: readonly FlatExecStep[], i: number): RoundView {
  if (!flat[i]) return { names: [], current: -1 };
  const [a, b] = roundRange(flat, i);
  const names: string[] = [];
  let current = -1;
  for (let k = a; k <= b; k++) {
    if (isRestStep(flat[k].step)) continue;
    if (current === -1 && k >= i) current = names.length;
    names.push(stepTitle(flat[k].step));
  }
  return { names, current };
}

/** Prochain pas d'effort après `i` (null s'il n'y en a plus). */
export function nextWork(flat: readonly FlatExecStep[], i: number): FlatExecStep | null {
  for (let k = i + 1; k < flat.length; k++) if (!isRestStep(flat[k].step)) return flat[k];
  return null;
}

/** « WOD · 5 tours · 40 s / 20 s ». */
export function wodSummary(flat: readonly FlatExecStep[]): string {
  const parts = ["WOD"];
  const r = roundOf(flat.find((f) => f.roundLabel));
  if (r) parts.push(`${r.rounds} tours`);
  const work = flat.find((f) => !isRestStep(f.step) && stepSeconds(f.step) > 0);
  const rest = flat.find((f) => isRestStep(f.step) && stepSeconds(f.step) > 0);
  if (work && rest) parts.push(`${fmtShort(stepSeconds(work.step))} / ${fmtShort(stepSeconds(rest.step))}`);
  return parts.join(" · ");
}
