/**
 * Ce que l'athlète a choisi lui-même sur une séance (workout_logs) :
 * déplacement, exercices ajoutés, séries bonus, séries sautées, commentaires.
 * Affiché côté coach avec le tag « Choix de l'athlète ».
 */
import type { AthleteModifications } from "@/features/shared/types/athlete";

export const ATHLETE_CHOICE_LABEL = "Choix de l'athlète";

export interface AthleteChoiceSet {
  kg?: number | null;
  reps?: number | null;
  duration_s?: number | null;
  rir?: number | null;
}

export interface AthleteChoiceExercise {
  key: string;
  name: string;
  /** "custom" = exercice ajouté par l'athlète, "bonus" = séries en plus sur un exercice prévu */
  kind: "custom" | "bonus" | "extra";
  sets: AthleteChoiceSet[];
}

export interface AthleteChoices {
  moved: { from: string; to: string } | null;
  exercises: AthleteChoiceExercise[];
  skippedSets: number;
  sessionComment: string | null;
  exerciceComments: number;
  /** Au moins un élément à afficher */
  any: boolean;
}

export interface AthleteChoicesInput {
  mods: AthleteModifications | null | undefined;
  /** ids Exercice prévus par le coach (pour repérer les ajouts) */
  plannedExerciceIds?: Iterable<string>;
  scheduledDate?: string;
  originalScheduledDate?: string | null;
  rescheduledByAthlete?: boolean;
}

export function summarizeAthleteChoices(input: AthleteChoicesInput): AthleteChoices {
  const { mods, scheduledDate, originalScheduledDate, rescheduledByAthlete } = input;
  const planned = new Set(input.plannedExerciceIds ?? []);

  const moved = rescheduledByAthlete && originalScheduledDate && scheduledDate && originalScheduledDate !== scheduledDate
    ? { from: originalScheduledDate, to: scheduledDate }
    : null;

  const exercises: AthleteChoiceExercise[] = [];
  for (const ce of mods?.customExercises ?? []) {
    exercises.push({
      key: "custom-" + ce.tempId,
      name: ce.name || "Exercice ajouté",
      kind: "custom",
      sets: (ce.sets ?? []).map((s) => ({ kg: s.kg ?? null, reps: s.reps ?? null, duration_s: s.duration_s ?? null, rir: s.rir ?? null })),
    });
  }
  for (const [i, bs] of (mods?.bonusSets ?? []).entries()) {
    exercises.push({
      key: `bonus-${bs.exerciseId}-${i}`,
      name: bs.exerciseName || "Exercice",
      kind: "bonus",
      sets: (bs.sets ?? []).map((s) => ({ kg: s.kg ?? null, reps: s.reps ?? null, rir: s.rir ?? null })),
    });
  }

  let skippedSets = 0;
  if (planned.size > 0) {
    for (const [exId, sets] of Object.entries(mods?.sessionSets ?? {})) {
      if (!Array.isArray(sets)) continue;
      if (!planned.has(exId)) {
        const done = sets.filter((s) => s?.done);
        if (done.length) exercises.push({ key: "extra-" + exId, name: "Exercice ajouté", kind: "extra", sets: done.map((s) => ({ kg: s.kg ?? null, reps: s.reps ?? null, rir: s.rir ?? null })) });
        continue;
      }
      skippedSets += sets.filter((s) => s?.skipped).length;
    }
  }

  const sessionComment = mods?.sessionComment?.trim() ? mods.sessionComment.trim() : null;
  const exerciceComments = Object.values(mods?.exerciceComments ?? {}).filter((c) => typeof c === "string" && c.trim()).length;

  return {
    moved,
    exercises,
    skippedSets,
    sessionComment,
    exerciceComments,
    any: !!moved || exercises.length > 0 || skippedSets > 0 || !!sessionComment || exerciceComments > 0,
  };
}

/** « 3 × 8 @ 60 kg » — résumé compact des séries d'un ajout athlète. */
export function formatChoiceSets(sets: AthleteChoiceSet[]): string {
  if (!sets.length) return "—";
  const reps = sets.map((s) => (s.duration_s ? `${s.duration_s} s` : s.reps != null ? String(s.reps) : "?"));
  const allSame = reps.every((r) => r === reps[0]);
  const kgs = sets.map((s) => s.kg).filter((v): v is number => v != null && !Number.isNaN(v));
  const maxKg = kgs.length ? Math.max(...kgs) : null;
  const base = allSame ? `${sets.length} × ${reps[0]}` : reps.join(" / ");
  return maxKg != null ? `${base} @ ${maxKg} kg` : base;
}

const FR_DAY = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const FR_MONTH = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « lun. 19 oct. » */
export function shortFrDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${FR_DAY[d.getDay()]} ${d.getDate()} ${FR_MONTH[d.getMonth()]}`;
}

/**
 * Libellé du badge d'une séance touchée par l'athlète :
 * « Déplacé par l'athlète · prévu lun. 19 oct. » ou, si la date n'a pas bougé
 * (séance démarrée hors programme), « Choix de l'athlète · séance ajoutée ».
 */
export function athleteMoveTitle(date: string, originalDate?: string | null): string {
  if (originalDate && originalDate !== date) return `Déplacé par l'athlète · prévu ${shortFrDate(originalDate)}`;
  return `${ATHLETE_CHOICE_LABEL} · séance ajoutée`;
}
