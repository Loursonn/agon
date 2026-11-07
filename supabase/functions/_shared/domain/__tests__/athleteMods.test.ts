import { describe, it, expect } from "vitest";
import {
  parseAthleteMods, hasLoggedEntries, countLoggedSets, exerciseHasEntries,
  isLoggedSet, mergeEntries, withoutCoachOverride,
} from "../athleteMods";
import { workoutStats, mondayOf } from "../workoutStats";

describe("parseAthleteMods", () => {
  it("absent ou pas un objet → null", () => {
    for (const raw of [null, undefined, "x", 3, [], true]) expect(parseAthleteMods(raw)).toBeNull();
  });

  it("garde les champs connus bien formés et les clés inconnues", () => {
    const raw = {
      sessionSets: { e1: [{ done: true, kg: 80, reps: 5, rir: 2 }, { done: false, skipped: true }] },
      sessionForme: 4, exerciceComments: { e1: "dur" }, sessionComment: "ok",
      videoSent: { e1: true }, coachOverride: { blocs: [], createdAt: "2026-11-01" }, futur: { a: 1 },
    };
    expect(parseAthleteMods(raw)).toEqual(raw);
  });

  it("écarte un champ connu mal formé sans lever", () => {
    const out = parseAthleteMods({
      sessionSets: { e1: [null, "x", { done: "oui", kg: "82,5", reps: "abc" }], e2: "pas un tableau" },
      sessionForme: "fort", exerciceComments: "x", sessionComment: 3, videoSent: [1], coachOverride: { note: "sans blocs" },
      bonusSets: {},
    });
    expect(out).toEqual({ sessionSets: { e1: [{ done: false, kg: 82.5 }], e2: [] } });
  });

  it("sessionSets non objet → retiré", () => {
    expect(parseAthleteMods({ sessionSets: [1, 2] })).toEqual({});
  });
});

describe("hasLoggedEntries = SQL workout_log_has_entries", () => {
  // Mêmes cas que la fonction SQL : clé présente et non null, 0 compris.
  const cases: [unknown, boolean][] = [
    [null, false],
    [{}, false],
    [{ sessionSets: {} }, false],
    [{ sessionSets: { e: [] } }, false],
    [{ sessionSets: { e: [{ done: true }] } }, false],
    [{ sessionSets: { e: [{ done: true, kg: null, reps: null }] } }, false],
    [{ sessionSets: { e: [{ done: false, reps: 0 }] } }, true],
    [{ sessionSets: { e: [{ kg: 0 }] } }, true],
    [{ sessionSets: { e: [{ kg: "" }] } }, true], // SQL : chaîne vide = valeur non null
    [{ sessionSets: { e: "x", f: [null, 3, { reps: 8 }] } }, true],
    [{ sessionSets: [{ kg: 1 }] }, false],          // SQL : jsonb_each sur un tableau → rien
    [{ sessionComment: "rien saisi" }, false],
  ];
  it.each(cases)("%j → %s", (mods, expected) => {
    expect(hasLoggedEntries(mods)).toBe(expected);
  });

  it("compte les séries saisies et par exercice", () => {
    const mods = { sessionSets: { a: [{ kg: 50, reps: 5 }, { done: true }], b: [{ reps: 10 }] } };
    expect(countLoggedSets(mods)).toBe(2);
    expect(exerciseHasEntries(mods, "a")).toBe(true);
    expect(exerciseHasEntries({ sessionSets: { a: [{ done: true }] } }, "a")).toBe(false);
    expect(exerciseHasEntries(mods, "zz")).toBe(false);
    expect(isLoggedSet(undefined)).toBe(false);
  });
});

describe("mergeEntries (règle des RPC)", () => {
  const server = { sessionSets: { a: [] }, coachOverride: { blocs: [1] }, sessionComment: "x" };

  it("fusionne au premier niveau et garde l'adaptation du coach du serveur", () => {
    const out = mergeEntries(server, { sessionSets: { b: [{ kg: 1 }] }, coachOverride: { blocs: ["périmé"] } });
    expect(out).toEqual({ sessionSets: { b: [{ kg: 1 }] }, coachOverride: { blocs: [1] }, sessionComment: "x" });
  });

  it("patch vide : une séance sans trace reste sans trace", () => {
    expect(mergeEntries(null, {})).toBeNull();
    expect(mergeEntries(null, { coachOverride: { blocs: [] } })).toBeNull();
    expect(mergeEntries(null, { sessionForme: 3 })).toEqual({ sessionForme: 3 });
  });

  it("retire coachOverride d'une saisie", () => {
    expect(withoutCoachOverride({ a: 1, coachOverride: 2 })).toEqual({ a: 1 });
  });
});

describe("workoutStats", () => {
  const today = "2026-11-12"; // jeudi ; semaine du 2026-11-09
  const L = (scheduled_date: string, status: string) => ({ scheduled_date, status });

  it("lundi ISO", () => {
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
  });

  it("total = séances validées ; série = semaines tenues consécutives", () => {
    const logs = [
      L("2026-10-13", "missed"),                            // semaine du 12/10 ratée → coupe
      L("2026-10-20", "completed"),                         // semaine du 19/10 tenue
      L("2026-10-28", "skipped"),                           // semaine du 26/10 : rien de dû → neutre
      L("2026-11-03", "completed"), L("2026-11-05", "completed"), // semaine du 02/11 tenue
      L("2026-11-10", "completed"), L("2026-11-14", "planned"),   // semaine en cours : le 14 n'est pas encore dû
    ];
    expect(workoutStats(logs, today)).toEqual({ totalDone: 4, streak: 3 });
  });

  it("une semaine passée incomplète casse la série ; la semaine en cours ne casse rien", () => {
    const logs = [L("2026-11-03", "completed"), L("2026-11-04", "missed"), L("2026-11-10", "missed")];
    expect(workoutStats(logs, today)).toEqual({ totalDone: 1, streak: 0 });
    expect(workoutStats([L("2026-11-03", "completed"), L("2026-11-10", "missed")], today)).toEqual({ totalDone: 1, streak: 1 });
  });

  it("aucune séance → 0 / 0", () => {
    expect(workoutStats([], today)).toEqual({ totalDone: 0, streak: 0 });
  });
});
