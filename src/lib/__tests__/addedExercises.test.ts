import { describe, expect, it } from "vitest";
import {
  ADDED_BLOC_ID, ADDED_BLOC_NAME, ADDED_BY_ATHLETE_LABEL, addedExercisesOf, canRemoveAddedExercise,
  newAddedExercise, withAddedBloc, withAddedExercise, withoutAddedExercise,
} from "@/lib/addedExercises";
import { allSetsToMods, buildExSets, countSets } from "@/features/athlete/components/workout-detail/workoutDetailUtils";
import { buildExoRows } from "@/features/coach/components/planning/day-details/dayDetailsUtils";
import { mergeEntries, parseAthleteMods } from "@shared/domain/athleteMods";
import type { WorkoutBlocData } from "@/features/shared/hooks/useWorkoutSession";

const NOW = new Date("2026-11-16T18:30:00Z");
const bloc: WorkoutBlocData = {
  id: "b1", name: "Force", series_mode: "libre", timing_mode: "repos",
  exercices: [{ id: "squat", exercise_name: "Squat", mode: "classique", params: {
    nb_series: 3, reps: { mode: "global", value: 5 }, reps_mode: { mode: "global", value: "EC" },
    charge_unit: "kg", charge: { mode: "global", value: 100 }, rir: { mode: "global", value: 2 }, tempo: { mode: "global", value: "" },
  } }],
};

describe("newAddedExercise", () => {
  it("banque : garde l'exercice de la banque, id préfixé", () => {
    const a = newAddedExercise({ name: " Hip thrust ", exerciseId: "uuid-1" }, NOW, () => 0.5);
    expect(a.id.startsWith("ajout-")).toBe(true);
    expect(a).toMatchObject({ name: "Hip thrust", exercise_id: "uuid-1", addedAt: NOW.toISOString() });
  });
  it("nom libre : pas d'exercise_id", () => {
    expect(newAddedExercise({ name: "Gainage planche" }, NOW).exercise_id).toBeUndefined();
  });
  it("nom vide refusé", () => {
    expect(() => newAddedExercise({ name: "  " })).toThrow();
  });
  it("deux ajouts de suite ont des ids différents", () => {
    let r = 0;
    const rand = () => (r += 0.1);
    expect(newAddedExercise({ name: "A" }, NOW, rand).id).not.toBe(newAddedExercise({ name: "A" }, NOW, rand).id);
  });
});

describe("saisie avec un exercice ajouté", () => {
  const a = newAddedExercise({ name: "Curl" }, NOW, () => 0.1);

  it("l'ajout et ses séries partent dans la saisie, le reste est gardé", () => {
    const base = { sessionForme: 4, sessionSets: { squat: [{ done: true, kg: 100, reps: 5 }] } };
    const mods = allSetsToMods(
      { squat: [{ kg: "100", reps: "5", rir: "", done: true, skipped: false }], [a.id]: [{ kg: "12,5", reps: "10", rir: "", done: true, skipped: false }] },
      withAddedExercise(base, a),
    );
    expect(mods.addedExercises).toEqual([a]);
    expect(mods.sessionSets?.[a.id]).toEqual([{ done: true, skipped: false, kg: 12.5, reps: 10, rir: undefined }]);
    expect(mods.sessionForme).toBe(4);
  });

  it("fusion serveur (patch_workout_entries) : l'ajout est gardé, l'adaptation du coach aussi", () => {
    const server = { coachOverride: { blocs: [] }, sessionSets: {} };
    const merged = mergeEntries(server, withAddedExercise({ sessionSets: { [a.id]: [{ done: false }] } }, a));
    expect(parseAthleteMods(merged)?.addedExercises).toEqual([a]);
    expect(merged?.coachOverride).toEqual({ blocs: [] });
  });

  it("retirable tant qu'aucune série n'est saisie, plus ensuite", () => {
    const empty = withAddedExercise({ sessionSets: { [a.id]: [{ done: false }] } }, a);
    expect(canRemoveAddedExercise(empty, a.id)).toBe(true);
    const filled = withAddedExercise({ sessionSets: { [a.id]: [{ done: true, kg: 10 }] } }, a);
    expect(canRemoveAddedExercise(filled, a.id)).toBe(false);
    expect(canRemoveAddedExercise(empty, "squat")).toBe(false); // exercice du programme : jamais
  });

  it("retirer efface la liste, les séries et le commentaire de l'ajout seulement", () => {
    const mods = withAddedExercise({
      sessionSets: { squat: [{ done: true, kg: 100 }], [a.id]: [{ done: false }] },
      exerciceComments: { squat: "dur", [a.id]: "x" },
    }, a);
    expect(withoutAddedExercise(mods, a.id)).toEqual({
      sessionSets: { squat: [{ done: true, kg: 100 }] },
      exerciceComments: { squat: "dur" },
      addedExercises: [],
    });
  });
});

describe("withAddedBloc (écran athlète)", () => {
  it("sans ajout : blocs inchangés", () => {
    const blocs = [bloc];
    expect(withAddedBloc(blocs, [])).toBe(blocs);
    expect(withAddedBloc(blocs, undefined)).toBe(blocs);
  });

  it("bloc « Exercices ajoutés » à la fin, sans prescription", () => {
    const a = newAddedExercise({ name: "Curl", exerciseId: "e-curl" }, NOW);
    const out = withAddedBloc([bloc], [a]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ id: ADDED_BLOC_ID, name: ADDED_BLOC_NAME, timing_mode: "libre" });
    expect(out[1].exercices[0]).toMatchObject({ id: a.id, exercise_name: "Curl", exercise_id: "e-curl", added: true });
    expect(out[1].exercices[0].params.nb_series).toBe(0);
  });

  it("les lignes viennent de la saisie : rien d'inventé, rien de pré-rempli", () => {
    const ex = withAddedBloc([], [newAddedExercise({ name: "Curl" }, NOW)])[0].exercices[0];
    expect(buildExSets(ex, undefined, undefined)).toEqual([]);
    expect(buildExSets(ex, [{ done: true, kg: 12, reps: 10 }, { done: false }], undefined)).toEqual([
      { kg: "12", reps: "10", rir: "", done: true, skipped: false },
      { kg: "", reps: "", rir: "", done: false, skipped: false },
    ]);
  });

  it("compté dans le bilan de fin de séance", () => {
    const a = newAddedExercise({ name: "Curl" }, NOW);
    const blocs = withAddedBloc([bloc], [a]);
    const sets = { squat: [], [a.id]: [{ kg: "10", reps: "10", rir: "", done: true, skipped: false }] };
    expect(countSets(blocs, sets)).toEqual({ doneSets: 1, skippedSets: 0, totalSets: 1 });
  });
});

describe("addedExercisesOf : lecture tolérante", () => {
  it("écarte les entrées mal formées et les doublons", () => {
    expect(addedExercisesOf({ addedExercises: [
      { id: "ajout-1", name: "Curl", exercise_id: "e" },
      { id: "ajout-1", name: "Doublon" },
      { id: "ajout-2", name: "  " },
      { name: "sans id" },
      null, "x",
      { id: "ajout-3", name: "Gainage", exercise_id: 3 },
    ] })).toEqual([
      { id: "ajout-1", name: "Curl", exercise_id: "e" },
      { id: "ajout-3", name: "Gainage" },
    ]);
  });
  it("absent ou pas un tableau → []", () => {
    for (const m of [null, undefined, {}, { addedExercises: {} }]) expect(addedExercisesOf(m)).toEqual([]);
  });
});

describe("vue coach : séance réalisée (buildExoRows)", () => {
  it("l'ajout porte son nom et « Ajouté par l'athlète »", () => {
    const a = newAddedExercise({ name: "Curl" }, NOW);
    const rows = buildExoRows(undefined, { [a.id]: [{ done: true, kg: 12, reps: 10 }, { done: false }] }, 1, [a]);
    expect(rows).toEqual([{
      id: a.id, name: "Curl", blocName: ADDED_BY_ATHLETE_LABEL, mode: "classique", planned: null,
      actual: [{ done: true, kg: 12, reps: 10 }], addedByAthlete: true,
    }]);
  });
  it("série d'un id inconnu (hors ajout) : ancien libellé gardé", () => {
    const rows = buildExoRows(undefined, { inconnu: [{ done: true, kg: 1 }] }, 1, []);
    expect(rows[0]).toMatchObject({ name: "Exercice ajouté", blocName: "Bonus" });
  });
});
