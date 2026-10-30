import { describe, expect, it } from "vitest";
import { describeOp, namesFrom, paramsText } from "@/lib/coachApiDraftText";
import { API_KEY_PREFIX, generateApiKey, keyPrefix, sha256Hex } from "@/lib/coachApiKey";
import { LEGAL_VERSION } from "@/lib/legal";
import { AI_ASSISTANT_SINCE, type ProgSessionShape } from "@shared/coachApiOps.ts";

const g = <T,>(value: T) => ({ mode: "global" as const, value });

const prog: ProgSessionShape[] = [{
  id: "s1", name: "Bas du corps", short: "A", recurrence: "weekly", multi_semaine: false,
  blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [
    { id: "e1", exercise_id: "x", exercise_name: "Squat", mode: "classique", sort_order: 0,
      params: { nb_series: 4, reps: g(8), reps_mode: g("EC" as const), charge_unit: "kg", charge: g(100), rir: g(2), tempo: g("") } },
  ] }],
}];

describe("consentement", () => {
  it("le texte qui nomme l'assistant du coach est en vigueur", () => {
    // Si LEGAL_VERSION était antérieure, aucun accord ne pourrait atteindre
    // AI_ASSISTANT_SINCE et l'API ne verrait jamais aucun athlète.
    expect(LEGAL_VERSION >= AI_ASSISTANT_SINCE).toBe(true);
  });
});

describe("clé API", () => {
  it("a le format attendu par l'Edge Function", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^agon_[A-Za-z0-9]{40}$/);
    expect(keyPrefix(key)).toBe(key.slice(0, API_KEY_PREFIX.length + 8));
    expect(generateApiKey()).not.toBe(key);
  });

  it("est hachée en SHA-256 hexadécimal", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("description des opérations", () => {
  const names = namesFrom(prog);

  it("résume les paramètres comme un coach les écrit", () => {
    expect(paramsText({ nb_series: 3, reps: { mode: "par_serie", values: [5, 4, 3] }, reps_mode: g("EC" as const),
      charge_unit: "%RM", charge: g(80), rir: g(null), tempo: g("") })).toBe("3 × 5/4/3 @ 80 %RM");
  });

  it("nomme la séance et l'exercice au lieu des identifiants", () => {
    expect(describeOp({ op: "remove_exercice", session_id: "s1", exercice_id: "e1" }, names))
      .toBe("Retirer Squat de Bas du corps");
    expect(describeOp({ op: "update_exercice", session_id: "s1", exercice_id: "e1", a_partir_de: 3,
      params: { nb_series: 5, reps: g(3), reps_mode: g("EC" as const), charge_unit: "kg", charge: g(120), rir: g(1), tempo: g("") } }, names))
      .toBe("Modifier Squat (Bas du corps) : 5 × 3 @ 120 kg, RIR 1 à partir de la séance n° 3");
  });

  it("signale un exercice ajouté hors bibliothèque", () => {
    expect(describeOp({ op: "add_exercice", session_id: "s1", bloc_id: "b1", exercice: {
      id: "n1", exercise_id: "", exercise_name: "Nordic", mode: "classique", sort_order: 0,
      params: { nb_series: 3, reps: g(6), reps_mode: g("EC" as const), charge_unit: "PDC", charge: g(null), rir: g(null), tempo: g("") },
    } }, names)).toBe("Ajouter Nordic (hors bibliothèque) : 3 × 6 au poids du corps — Bas du corps › Force");
  });

  it("décrit le planning et les objectifs", () => {
    expect(describeOp({ op: "set_session_schedule", session_id: "s1", day_of_week: 2 }, names)).toBe("Placer Bas du corps le mercredi");
    expect(describeOp({ op: "set_goals", sessionsPerWeek: 4, sleepBedtime: { h: 22, m: 30 } }, names))
      .toBe("Objectifs : 4 séances par semaine, coucher à 22h30");
  });
});
