/**
 * Ce que l'assistant IA d'un coach peut lire.
 *
 * Les cas qui comptent : le texte libre de l'athlète ne sort pas, une valeur
 * absurde devient null plutôt qu'une donnée fausse, et la période est bornée.
 */
import { describe, expect, it } from "vitest";
import { buildSummary, firstName, parsePeriod, readProgram, type SummaryInput } from "../coachApiRead";

function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    athlete: { id: "a1", first_name: "Léa", full_name: "Léa Martin" },
    from: "2026-10-01",
    to: "2026-10-28",
    appData: {
      "asp:goals": { sessionsPerWeek: 4, sleepTarget: 8, sleepBedtime: { h: 22, m: 30 } },
      "asp:bw": { current: 62, target: 60 },
      "asp:wh": {
        "2026-09-30": { fatigue: 2 },
        "2026-10-02": {
          score: 71, fatigue: 3, sommeil: 4, stress: 9, sleepDur: 7.5,
          sleepInterruptNote: "réveillée par une crise", injComment: "douleur au genou depuis l'IRM",
        },
      },
      "asp:wlog": { "2026-10-02": 62.4, "2026-10-03": "n'importe quoi" },
      "asp:injuries": [
        { id: "i1", zones: ["Genou G"], type: "tendinite", intensity: 4, status: "active", date_start: "2026-09-20" },
        { id: "i2", zones: ["Épaule"], status: "guerie", date_start: "2026-01-01", date_end: "2026-02-01" },
      ],
    },
    prog: [{ id: "s1", name: "A", short: "A", recurrence: "weekly", multi_semaine: false,
      blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [
        { id: "e1", exercise_id: "x", exercise_name: "Squat", mode: "classique", sort_order: 0, params: { nb_series: 3 } },
      ] }] }],
    workoutLogs: [{
      scheduled_date: "2026-10-02", session_id: "s1", session_name: "A", status: "completed",
      rpe_score: 8, duration_s: 3600,
      athlete_modifications: {
        sessionForme: 4,
        sessionComment: "j'ai pris mon traitement",
        exerciceComments: { e1: "mal au dos" },
        sessionSets: {
          e1: [{ done: true, kg: 100, reps: 5, rir: 2 }, { done: false, skipped: true }],
          retire: [{ done: true, kg: 50, reps: 10 }],
        },
      },
    }],
    prs: [{ date: "2026-10-02", exercise_ref: "Squat", kg: 110 }],
    activities: [],
    dailies: [],
    ...over,
  };
}

describe("buildSummary", () => {
  it("n'expose aucun texte libre écrit par l'athlète", () => {
    const json = JSON.stringify(buildSummary(input()));
    for (const secret of ["crise", "IRM", "traitement", "mal au dos"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("ne garde que la période demandée", () => {
    const s = buildSummary(input());
    expect(s.bien_etre.map((w) => w.date)).toEqual(["2026-10-02"]);
  });

  it("remplace une valeur hors échelle par null, pas par un chiffre inventé", () => {
    const s = buildSummary(input());
    expect(s.bien_etre[0]).toMatchObject({ fatigue: 3, stress: null, sommeil_h: 7.5 });
    expect(s.poids).toEqual([{ date: "2026-10-02", kg: 62.4 }]);
  });

  it("ne donne que le prénom", () => {
    expect(buildSummary(input()).athlete).toEqual({ id: "a1", prenom: "Léa" });
    expect(firstName({ first_name: null, full_name: "Léa Martin" })).toBe("Léa");
  });

  it("garde les blessures qui recouvrent la période, ouvertes comprises", () => {
    expect(buildSummary(input()).blessures.map((b) => b.zones)).toEqual([["Genou G"]]);
  });

  it("nomme les séries réalisées par l'exercice du programme, et écarte celles qu'on ne sait plus nommer", () => {
    const seance = buildSummary(input()).seances[0];
    expect(seance).toMatchObject({ rpe: 8, duree_min: 60, forme: 4 });
    expect(seance.exercices).toEqual([{
      exercice: "Squat",
      series: [{ kg: 100, reps: 5, rir: 2, faite: true }, { kg: null, reps: null, rir: null, faite: false }],
    }]);
  });
});

describe("parsePeriod", () => {
  it("prend les 28 derniers jours par défaut", () => {
    expect(parsePeriod(null, null, "2026-10-28")).toEqual({ ok: true, from: "2026-10-01", to: "2026-10-28" });
  });

  it("refuse plus de 90 jours, une date invalide, ou une période à l'envers", () => {
    expect(parsePeriod("2026-01-01", "2026-10-28", "2026-10-28").ok).toBe(false);
    expect(parsePeriod("2026-13-01", null, "2026-10-28").ok).toBe(false);
    expect(parsePeriod("2026-10-10", "2026-10-01", "2026-10-28").ok).toBe(false);
  });
});

describe("readProgram", () => {
  it("garde les ids et le format des opérations, et donne la prochaine occurrence", () => {
    const p = readProgram(input().prog, new Map([["s1", 5]]));
    expect(p[0]).toMatchObject({ id: "s1", prochaine_occurrence: 5, day_of_week: null });
    expect(p[0].blocs[0].exercices[0]).toMatchObject({ id: "e1", exercise_name: "Squat", dans_bibliotheque: true, params: { nb_series: 3 } });
  });

  it("ne renvoie que les paramètres connus", () => {
    const prog = [{ id: "s1", name: "A", short: "A", recurrence: "weekly", multi_semaine: false, blocs: [{ id: "b1", name: "F", sort_order: 0,
      exercices: [{ id: "e1", exercise_id: "", exercise_name: "X", mode: "classique", sort_order: 0, params: { nb_series: 3, secret: "y" } }] }] }];
    expect(readProgram(prog, new Map())[0].blocs[0].exercices[0].params).toEqual({ nb_series: 3 });
  });
});

describe("buildSummary — semaine prévue et réalisée", () => {
  it("donne les thèmes du jour et les séances énergétiques de la période, sans texte libre", () => {
    const s = buildSummary(input({
      dayThemes: [
        { date: "2026-10-05", label: "Jambes lourdes", intensity: "hard", dominante: "force" },
        { date: "2026-11-05", label: "Hors période", intensity: null, dominante: null },
      ],
      energyLogs: [{
        energy_session_id: "es1", scheduled_date: "2026-10-06", status: "completed", rpe_score: 7, actual_duration_min: 48, distance_km: 9.2,
        energy_sessions: { name: "VMA 6 × 400", session_kind: "vo2", total_duration_s: 2700, total_distance_m: 5400 },
      }],
    }));
    expect(s.themes_du_jour).toEqual([{ date: "2026-10-05", label: "Jambes lourdes", intensite: "hard", dominante: "force" }]);
    expect(s.seances_energie).toEqual([{
      date: "2026-10-06", energy_session_id: "es1", nom: "VMA 6 × 400", type: "vo2", statut: "completed",
      duree_prevue_min: 45, distance_prevue_km: 5.4, rpe: 7, duree_min: 48, distance_km: 9.2,
    }]);
  });

  it("tolère une séance énergétique dont la fiche a disparu", () => {
    const s = buildSummary(input({
      energyLogs: [{ scheduled_date: "2026-10-06", status: "planned", rpe_score: null, actual_duration_min: null, distance_km: null, energy_sessions: null }],
    }));
    expect(s.seances_energie[0]).toMatchObject({ nom: null, statut: "planned", duree_prevue_min: null });
  });
});

describe("buildSummary — événements", () => {
  it("donne compétitions, tests et événements de vie, sans texte libre de l'athlète", () => {
    const s = buildSummary(input({
      competitions: [
        { id: "c1", date: "2026-10-10", name: "Hyrox Paris", type: "competition", priority: "A", location: "Paris" },
        { id: "c2", date: "2026-12-01", name: "Hyrox Lyon", type: "competition", priority: "B", location: null },
      ],
      tests: [{ id: "t1", date: "2026-10-12", title: "Squat 1RM", type: "musculation", completed: true,
        results_structured: { variables: { "1rm": 140, bidon: "x" }, comment: "genou douloureux" } }],
      lifeEvents: [
        { date_start: "2026-10-20", date_end: "2026-10-22", title: "Partiels" },
        { date_start: "2026-11-20", date_end: "2026-11-22", title: "Hors période" },
      ],
    }));
    expect(s.evenements.competitions).toEqual([{ id: "c1", date: "2026-10-10", nom: "Hyrox Paris", type: "competition", priorite: "A", lieu: "Paris" }]);
    expect(s.evenements.competitions_a_venir).toEqual([{ id: "c2", date: "2026-12-01", nom: "Hyrox Lyon", type: "competition", priorite: "B" }]);
    expect(s.evenements.tests).toEqual([{ id: "t1", date: "2026-10-12", titre: "Squat 1RM", type: "musculation", fait: true, resultats: { "1rm": 140 } }]);
    expect(s.evenements.vie).toEqual([{ du: "2026-10-20", au: "2026-10-22", titre: "Partiels" }]);
    expect(JSON.stringify(s)).not.toContain("genou douloureux");
  });
});

