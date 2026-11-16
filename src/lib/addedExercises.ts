/**
 * Exercices ajoutés par l'athlète pendant une séance de musculation (retour
 * d'Hugo du 16/11/2026 : « j'ai rajouté quelque chose qui n'était pas prévu,
 * je ne peux pas le renseigner »).
 *
 * Choix d'Hugo :
 *   - exercice de la banque OU nom libre ;
 *   - il n'existe que dans la séance réalisée (le programme ne change pas) ;
 *   - il arrive avec une série vide, « + série » pour les suivantes ;
 *   - le coach le voit avec son nom et l'étiquette « Ajouté par l'athlète ».
 *
 * Stockage : `athlete_modifications.addedExercises` (liste) et les séries dans
 * `sessionSets[<id>]`, comme un exercice du programme. La RPC
 * `patch_workout_entries` fusionne les clés de premier niveau : rien à changer
 * en base.
 */
import {
  ADDED_EXERCISE_PREFIX,
  addedExercisesOf,
  exerciseHasEntries,
  type AddedExercise,
} from "@shared/domain/athleteMods";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import type { WorkoutBlocData, WorkoutExerciceData } from "@/features/shared/hooks/useWorkoutSession";

export type { AddedExercise };
export { addedExercisesOf, ADDED_EXERCISE_PREFIX };

/** Étiquette côté coach. */
export const ADDED_BY_ATHLETE_LABEL = "Ajouté par l'athlète";
/** Titre du bloc côté athlète. */
export const ADDED_BLOC_NAME = "Exercices ajoutés";
/** Id du bloc virtuel qui porte les ajouts, à la fin de la séance. */
export const ADDED_BLOC_ID = "ajouts-athlete";

/** Nouvel exercice ajouté (banque si `exerciseId`, sinon nom libre). */
export function newAddedExercise(
  p: { name: string; exerciseId?: string | null },
  now: Date = new Date(),
  rand: () => number = Math.random,
): AddedExercise {
  const name = p.name.trim();
  if (!name) throw new Error("Nom d'exercice vide");
  const id = `${ADDED_EXERCISE_PREFIX}${now.getTime().toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`;
  const out: AddedExercise = { id, name, addedAt: now.toISOString() };
  if (p.exerciseId) out.exercise_id = p.exerciseId;
  return out;
}

/** La saisie avec un exercice ajouté en plus (à la fin de la liste). */
export function withAddedExercise(mods: AthleteModifications, added: AddedExercise): AthleteModifications {
  return { ...mods, addedExercises: [...addedExercisesOf(mods), added] };
}

/**
 * Un ajout se retire tant qu'aucune série n'y est saisie (charge ou reps) :
 * une fois rempli, c'est une donnée de la séance réalisée.
 */
export function canRemoveAddedExercise(mods: AthleteModifications, id: string): boolean {
  return addedExercisesOf(mods).some((a) => a.id === id) && !exerciseHasEntries(mods, id);
}

/** La saisie sans cet ajout (liste, séries, commentaire). */
export function withoutAddedExercise(mods: AthleteModifications, id: string): AthleteModifications {
  const { [id]: _sets, ...sessionSets } = mods.sessionSets ?? {};
  const { [id]: _comment, ...exerciceComments } = mods.exerciceComments ?? {};
  void _sets; void _comment;
  const out: AthleteModifications = {
    ...mods,
    addedExercises: addedExercisesOf(mods).filter((a) => a.id !== id),
  };
  if (mods.sessionSets) out.sessionSets = sessionSets;
  if (mods.exerciceComments) out.exerciceComments = exerciceComments;
  return out;
}

/**
 * Exercice d'affichage d'un ajout : pas de prescription (0 série prévue), les
 * lignes viennent uniquement de la saisie. `added` le distingue à l'écran.
 */
export function addedToWorkoutExercice(a: AddedExercise): WorkoutExerciceData {
  return {
    id: a.id,
    exercise_id: a.exercise_id ?? undefined,
    exercise_name: a.name,
    mode: "classique",
    added: true,
    params: {
      nb_series: 0,
      reps: { mode: "global", value: 0 },
      reps_mode: { mode: "global", value: "EC" },
      charge_unit: "kg",
      charge: { mode: "global", value: null },
      rir: { mode: "global", value: null },
      tempo: { mode: "global", value: "" },
    },
  };
}

/** Blocs de la séance + un bloc « Exercices ajoutés » à la fin s'il y en a. */
export function withAddedBloc(blocs: WorkoutBlocData[], added: readonly AddedExercise[] | undefined): WorkoutBlocData[] {
  if (!added || added.length === 0) return blocs;
  return [
    ...blocs,
    {
      id: ADDED_BLOC_ID,
      name: ADDED_BLOC_NAME,
      series_mode: "libre",
      timing_mode: "libre",
      exercices: added.map(addedToWorkoutExercice),
    },
  ];
}
