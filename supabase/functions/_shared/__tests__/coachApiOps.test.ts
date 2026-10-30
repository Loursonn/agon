/**
 * Propositions de l'assistant IA d'un coach.
 *
 * Ce qui est vérifié ici, c'est la promesse faite au coach : une proposition
 * acceptée par l'API s'applique exactement comme il la lit, ne touche à rien
 * d'autre, et ne passe pas si elle vise un programme qui a changé.
 */
import { describe, expect, it } from "vitest";
import {
  applyGoalsOps,
  applyProgOps,
  DraftApplyError,
  normName,
  type ProgSessionShape,
  validateDraft,
} from "../coachApiOps";

const P = (nb = 4, reps = 8) => ({
  nb_series: nb,
  reps: { mode: "global" as const, value: reps },
  reps_mode: { mode: "global" as const, value: "EC" as const },
  charge_unit: "kg" as const,
  charge: { mode: "global" as const, value: 100 },
  rir: { mode: "global" as const, value: 2 },
  tempo: { mode: "global" as const, value: "" },
});

function prog(): ProgSessionShape[] {
  return [{
    id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
    blocs: [{
      id: "b1", name: "Force", sort_order: 0,
      exercices: [
        { id: "e1", exercise_id: "lib-squat", exercise_name: "Squat", mode: "classique", sort_order: 0, params: P() },
        { id: "e2", exercise_id: "", exercise_name: "Fentes", mode: "classique", sort_order: 1, params: P(3, 10) },
      ],
    }],
  }];
}

let n = 0;
const ctx = (p = prog()) => ({ prog: p, newId: () => `new-${++n}` });

describe("validateDraft — forme générale", () => {
  it("refuse un champ inconnu au premier niveau, en le nommant", () => {
    const r = validateDraft({ kind: "axe", title: "t", body: "b", extra: 1 }, ctx());
    expect(r).toEqual({ ok: false, error: expect.stringContaining("body.extra") });
  });

  it("accepte un axe de travail, qui est un texte sans opérations", () => {
    const r = validateDraft({ kind: "axe", title: "Sommeil", body: "Couché tard 4 soirs sur 7." }, ctx());
    expect(r).toEqual({ ok: true, value: { kind: "axe", title: "Sommeil", body: "Couché tard 4 soirs sur 7.", ops: [] } });
  });

  it("refuse un axe qui porte des opérations : un axe ne modifie rien", () => {
    const r = validateDraft({ kind: "axe", title: "t", body: "b", ops: [{ op: "set_goals", sessionsPerWeek: 3 }] }, ctx());
    expect(r.ok).toBe(false);
  });

  it("retire les caractères de contrôle et borne la longueur", () => {
    const ok = validateDraft({ kind: "axe", title: "a\u0007b", body: "x" }, ctx());
    expect(ok.ok && ok.value.title).toBe("ab");
    const tooLong = validateDraft({ kind: "axe", title: "x".repeat(121), body: "x" }, ctx());
    expect(tooLong.ok).toBe(false);
  });

  it("refuse plus de 50 opérations", () => {
    const ops = Array.from({ length: 51 }, () => ({ op: "set_goals", sessionsPerWeek: 3 }));
    expect(validateDraft({ kind: "objectifs", title: "t", ops }, ctx()).ok).toBe(false);
  });
});

describe("programme", () => {
  it("ajoute un exercice : id fixé à la validation, lien bibliothèque par nom, sort_order renuméroté", () => {
    const library = new Map([[normName("Soulevé de terre roumain"), { id: "lib-rdl", name: "Soulevé de terre roumain" }]]);
    const r = validateDraft({
      kind: "programme", title: "Ajout RDL",
      ops: [{ op: "add_exercice", session_id: "s1", bloc_id: "b1", position: 1,
        exercice: { exercise_name: "souleve de terre ROUMAIN", params: { nb_series: 3, reps: 8, charge: 80 } } }],
    }, { ...ctx(), library });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const next = applyProgOps(prog(), r.value.ops as never);
    const ex = next[0].blocs[0].exercices;
    expect(ex.map((e) => e.exercise_name)).toEqual(["Squat", "Soulevé de terre roumain", "Fentes"]);
    expect(ex.map((e) => e.sort_order)).toEqual([0, 1, 2]);
    expect(ex[1]).toMatchObject({ exercise_id: "lib-rdl", mode: "classique" });
    expect(ex[1].id).toMatch(/^new-/);
    // Rejouer la même proposition donne le même résultat : l'id ne bouge pas.
    expect(applyProgOps(prog(), r.value.ops as never)[0].blocs[0].exercices[1].id).toBe(ex[1].id);
  });

  it("laisse exercise_id vide quand l'exercice n'est pas dans la bibliothèque", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "add_exercice", session_id: "s1", bloc_id: "b1", exercice: { exercise_name: "Exo inventé", params: { nb_series: 2, reps: 5 } } }],
    }, ctx());
    expect(r.ok && (r.value.ops[0] as { exercice: { exercise_id: string } }).exercice.exercise_id).toBe("");
  });

  it("accepte les raccourcis de paramètres : valeur seule = globale, tableau = par série", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "add_exercice", session_id: "s1", bloc_id: "b1",
        exercice: { exercise_name: "Squat", params: { nb_series: 3, reps: [5, 4, 3], charge: 120, charge_unit: "kg" } } }],
    }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const params = (r.value.ops[0] as { exercice: { params: { reps: unknown; charge: unknown } } }).exercice.params;
    expect(params.reps).toEqual({ mode: "par_serie", values: [5, 4, 3] });
    expect(params.charge).toEqual({ mode: "global", value: 120 });
  });

  it("refuse des valeurs par série dont le nombre ne correspond pas à nb_series", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "add_exercice", session_id: "s1", bloc_id: "b1",
        exercice: { exercise_name: "Squat", params: { nb_series: 3, reps: [5, 4] } } }],
    }, ctx());
    expect(r).toEqual({ ok: false, error: expect.stringContaining("3 valeurs attendues") });
  });

  it("refuse un champ de paramètre inconnu plutôt que de l'ignorer", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "add_exercice", session_id: "s1", bloc_id: "b1",
        exercice: { exercise_name: "Squat", params: { nb_series: 3, reps: 5, poids: 100 } } }],
    }, ctx());
    expect(r).toEqual({ ok: false, error: expect.stringContaining("params.poids") });
  });

  it("exige a_partir_de pour modifier des paramètres : sans lui, les séances passées seraient réécrites", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "update_exercice", session_id: "s1", exercice_id: "e1", params: { nb_series: 5, reps: 3 } }],
    }, ctx());
    expect(r).toEqual({ ok: false, error: expect.stringContaining("a_partir_de") });
  });

  it("modifie à partir d'une occurrence sans toucher aux précédentes", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "update_exercice", session_id: "s1", exercice_id: "e1", a_partir_de: 4, params: { nb_series: 5, reps: 3 } }],
    }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = applyProgOps(prog(), r.value.ops as never)[0];
    expect(s.multi_semaine).toBe(true);
    expect(s.nb_semaines).toBe(4);
    const squat = s.blocs[0].exercices[0].params as Record<string, { nb_series: number }>;
    // Occurrences 1 à 3 gardent l'ancien 4×8 ; la 4e passe à 5×3.
    expect(squat["1"].nb_series).toBe(4);
    expect(squat["4"].nb_series).toBe(5);
    // L'autre exercice de la séance passe aussi en stockage par occurrence,
    // sans changer ce qu'il produit.
    expect(s.blocs[0].exercices[1].params).toEqual({ "1": P(3, 10) });
  });

  it("refuse de modifier les paramètres d'un exercice en mode méthode", () => {
    const p = prog();
    p[0].blocs[0].exercices[0].mode = "methode";
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "update_exercice", session_id: "s1", exercice_id: "e1", a_partir_de: 1, params: { nb_series: 3, reps: 3 } }],
    }, ctx(p));
    expect(r.ok).toBe(false);
  });

  it("refuse une référence inexistante, en nommant la séance", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [{ op: "remove_exercice", session_id: "s1", exercice_id: "nope" }],
    }, ctx());
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Bas du corps") });
  });

  it("détecte à la validation deux suppressions du même exercice", () => {
    const r = validateDraft({
      kind: "programme", title: "t",
      ops: [
        { op: "remove_exercice", session_id: "s1", exercice_id: "e2" },
        { op: "remove_exercice", session_id: "s1", exercice_id: "e2" },
      ],
    }, ctx());
    expect(r.ok).toBe(false);
  });

  it("préserve les champs que le module ne connaît pas (fiches, demandes vidéo…)", () => {
    const p = prog() as unknown as Array<ProgSessionShape & { fiches: string[] }>;
    p[0].fiches = ["fiche-1"];
    (p[0].blocs[0].exercices[0] as unknown as { video_request: unknown }).video_request = { "1": { requested: true } };
    const next = applyProgOps(p, [{ op: "set_bloc_instructions", session_id: "s1", bloc_id: "b1", instructions: "Repos 3 min" }]);
    expect((next[0] as unknown as { fiches: string[] }).fiches).toEqual(["fiche-1"]);
    expect(next[0].blocs[0].exercices[0]).toHaveProperty("video_request");
    expect(next[0].blocs[0].instructions).toBe("Repos 3 min");
  });

  it("ne modifie pas le programme reçu", () => {
    const p = prog();
    const before = JSON.stringify(p);
    applyProgOps(p, [{ op: "remove_exercice", session_id: "s1", exercice_id: "e1" }]);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("lève DraftApplyError si le programme a changé depuis la proposition", () => {
    const changed = prog();
    changed[0].blocs[0].exercices = [];
    expect(() => applyProgOps(changed, [{ op: "remove_exercice", session_id: "s1", exercice_id: "e1" }]))
      .toThrow(DraftApplyError);
  });
});

describe("planning", () => {
  it("change le jour d'une séance, ou le retire avec null", () => {
    const moved = applyProgOps(prog(), [{ op: "set_session_schedule", session_id: "s1", day_of_week: 3 }]);
    expect(moved[0].day_of_week).toBe(3);
    const unset = applyProgOps(prog(), [{ op: "set_session_schedule", session_id: "s1", day_of_week: null }]);
    expect(unset[0]).not.toHaveProperty("day_of_week");
  });

  it("refuse un jour hors de 0–6", () => {
    const r = validateDraft({ kind: "planning", title: "t", ops: [{ op: "set_session_schedule", session_id: "s1", day_of_week: 7 }] }, ctx());
    expect(r.ok).toBe(false);
  });

  it("refuse une opération de programme dans une proposition de planning", () => {
    const r = validateDraft({ kind: "planning", title: "t", ops: [{ op: "remove_exercice", session_id: "s1", exercice_id: "e1" }] }, ctx());
    expect(r.ok).toBe(false);
  });
});

describe("objectifs", () => {
  it("ne change que les objectifs nommés", () => {
    const r = validateDraft({ kind: "objectifs", title: "t", ops: [{ op: "set_goals", sessionsPerWeek: 4 }] }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = applyGoalsOps({ sessionsPerWeek: 6, sleepTarget: 8 }, r.value.ops as never);
    expect(next).toEqual({ sessionsPerWeek: 4, sleepTarget: 8 });
  });

  it("refuse une opération vide et des heures impossibles", () => {
    expect(validateDraft({ kind: "objectifs", title: "t", ops: [{ op: "set_goals" }] }, ctx()).ok).toBe(false);
    expect(validateDraft({ kind: "objectifs", title: "t", ops: [{ op: "set_goals", sleepBedtime: { h: 25, m: 0 } }] }, ctx()).ok).toBe(false);
  });
});
