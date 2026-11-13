import { describe, expect, it } from "vitest";
import { defaultExerciceParams, type Bloc, type Exercice, type ProgSession } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams } from "@/lib/sessionOccurrence";
import { applyFromOccurrence, flattenBlocs } from "../useSessionOccurrence";

const ex = (id: string, params: Exercice["params"]): Exercice => ({
  id, exercise_id: `e-${id}`, exercise_name: id, mode: "classique", sort_order: 0, params,
});
const bloc = (id: string, exercices: Exercice[]): Bloc => ({ id, name: id, series_mode: "libre", timing_mode: "libre", exercices, sort_order: 0 });
const kg = (v: number) => ({ ...defaultExerciceParams(3), charge: { mode: "global" as const, value: v } });
const session = (blocs: Bloc[], multi = false): ProgSession => ({ id: "s", name: "S", short: "S", recurrence: "weekly", multi_semaine: multi, blocs });
const chargeAt = (s: ProgSession, exId: string, week: number) =>
  resolveExerciceParams(s.blocs.flatMap((b) => b.exercices).find((e) => e.id === exId)!.params, week)?.charge;

describe("flattenBlocs", () => {
  it("résout les params de l'occurrence demandée", () => {
    const s = session([bloc("b", [ex("squat", { "1": kg(100), "3": kg(110) })])], true);
    expect(flattenBlocs(s.blocs, 2)[0].exercices[0].params).toEqual(kg(100));
    expect(flattenBlocs(s.blocs, 4)[0].exercices[0].params).toEqual(kg(110));
  });
});

describe("applyFromOccurrence", () => {
  it("séance simple : le passé garde ses valeurs, l'occurrence et les suivantes prennent la nouvelle", () => {
    const s = session([bloc("b", [ex("squat", kg(100))])]);
    const edited = flattenBlocs(s.blocs, 3);
    (edited[0].exercices[0].params as ReturnType<typeof kg>).charge = { mode: "global", value: 105 };
    const next = applyFromOccurrence(s, edited, 3);
    expect(next.multi_semaine).toBe(true);
    expect(chargeAt(next, "squat", 1)).toEqual({ mode: "global", value: 100 });
    expect(chargeAt(next, "squat", 2)).toEqual({ mode: "global", value: 100 });
    expect(chargeAt(next, "squat", 3)).toEqual({ mode: "global", value: 105 });
    expect(chargeAt(next, "squat", 6)).toEqual({ mode: "global", value: 105 });
    expect(next.nb_semaines).toBeGreaterThanOrEqual(3);
  });

  it("garde une valeur déjà prévue plus loin (une modif vaut jusqu'à la suivante)", () => {
    const s = session([bloc("b", [ex("squat", { "1": kg(100), "4": kg(120) })])], true);
    const edited = flattenBlocs(s.blocs, 2);
    (edited[0].exercices[0].params as ReturnType<typeof kg>).charge = { mode: "global", value: 102.5 };
    const next = applyFromOccurrence(s, edited, 2);
    expect(chargeAt(next, "squat", 1)).toEqual({ mode: "global", value: 100 });
    expect(chargeAt(next, "squat", 3)).toEqual({ mode: "global", value: 102.5 });
    expect(chargeAt(next, "squat", 4)).toEqual({ mode: "global", value: 120 });
  });

  it("ajout, retrait et consigne libre", () => {
    const libre: Exercice = { ...ex("gainage", undefined as never), mode: "libre", libre_text: "3 × 45 s" };
    const s = session([bloc("b", [ex("squat", kg(100)), ex("rdl", kg(80)), libre])]);
    const edited = flattenBlocs(s.blocs, 2);
    edited[0].exercices.splice(1, 1); // retire rdl
    edited[0].exercices.push(ex("hip", kg(90)));
    const next = applyFromOccurrence(s, edited, 2);
    const ids = next.blocs[0].exercices.map((e) => e.id);
    expect(ids).toEqual(["squat", "gainage", "hip"]);
    expect(next.blocs[0].exercices[1].params).toBeUndefined();
    expect(next.blocs[0].exercices[2].params).toEqual({ "2": kg(90) });
  });
});
