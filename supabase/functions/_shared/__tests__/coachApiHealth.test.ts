/**
 * Contrat de `GET /athletes/:id/summary` après le passage des lectures santé
 * des clés `app_data` (`asp:wh`, `asp:blockHistory`, `asp:wlog`, `asp:bw`) aux
 * tables (`wellness_entries`, `body_weight_logs`, `body_weight_goals`).
 *
 * Des clients externes (le skill « agon » de l'assistant de Titouan) lisent
 * cette sortie : la forme ne doit pas bouger d'un octet.
 * `coachApiSummary.golden.json` a été produit AVANT la migration, par l'ancien
 * `buildSummary` alimenté avec les clés `app_data` ; ce test rejoue les mêmes
 * données sous forme de lignes de tables et exige la même sortie.
 */
import { describe, expect, it } from "vitest";
import golden from "./coachApiSummary.golden.json";
import { fakeDb } from "./fakeDb";
import { readSummaryHealth } from "../coachApiHealth";
import { buildSummary, type SummaryInput } from "../coachApiRead";

const wellnessBlank = {
  fatigue: null, sommeil: null, stress: null, energie: null, doms: null,
  bedtime: null, wake: null, sleep_hours: null, sleep_interrupted: null, sleep_interrupt_note: null,
  doms_zones: [], doms_points: [], injury_note: null, weight_kg: null, archived: false,
};

const tables = {
  wellness_entries: [
    { athlete_id: "a1", day: "2026-09-30", ...wellnessBlank, fatigue: 2, sommeil: 2, stress: 2, energie: 2, doms: 2 },
    {
      athlete_id: "a1", day: "2026-10-02", ...wellnessBlank,
      // `stress: 9` (ancienne échelle) est NULL dans la table (docs/SANTE_TABLES.md).
      fatigue: 3, sommeil: 4, stress: null, energie: 4, doms: 5, sleep_hours: "7.5",
      bedtime: "22:30:00", wake: "06:30:00",
      sleep_interrupt_note: "réveillée par une crise", injury_note: "douleur au genou depuis l'IRM", weight_kg: "62.4",
    },
    { athlete_id: "a1", day: "2026-10-03", ...wellnessBlank, fatigue: 4, sommeil: 4, stress: 4, energie: 4, doms: 4, sleep_hours: 30 },
    // Venait d'un bloc archivé : comptait déjà dans l'ancien `buildSummary`.
    { athlete_id: "a1", day: "2026-10-05", ...wellnessBlank, fatigue: 5, sommeil: 5, stress: 5, energie: 5, doms: 5, archived: true },
    // Autre athlète : ne doit jamais apparaître.
    { athlete_id: "a2", day: "2026-10-02", ...wellnessBlank, fatigue: 1, sommeil: 1, stress: 1, energie: 1, doms: 1, injury_note: "SECRET-A2" },
  ],
  body_weight_logs: [
    { athlete_id: "a1", day: "2026-09-30", kg: 63 },
    { athlete_id: "a1", day: "2026-10-02", kg: "62.4" },
    { athlete_id: "a1", day: "2026-10-03", kg: 61.8 },
    { athlete_id: "a2", day: "2026-10-02", kg: 99 },
  ],
  body_weight_goals: [
    { athlete_id: "a1", reference_kg: 62, target_kg: 60 },
    { athlete_id: "a2", reference_kg: 99, target_kg: 90 },
  ],
};

const base = {
  athlete: { id: "a1", first_name: "Léa", full_name: "Léa Martin" },
  from: "2026-10-01",
  to: "2026-10-28",
  appData: { "asp:goals": { sessionsPerWeek: 4, sleepTarget: 8, sleepBedtime: { h: 22, m: 30 } } },
  injuries: [
    { kind: "blessure", status: "en_cours", zone: "Genou G", date: "2026-09-20", pain_level: 4, title: "tendinite après l'IRM" },
    { kind: "blessure", status: "gueri", zone: "Épaule", date: "2026-01-01", return_date: "2026-02-01" },
  ],
  prog: [{ id: "s1", name: "A", short: "A", recurrence: "weekly", multi_semaine: false,
    blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [
      { id: "e1", exercise_id: "x", exercise_name: "Squat", mode: "classique", sort_order: 0, params: { nb_series: 3 } },
    ] }] }],
  workoutLogs: [{
    scheduled_date: "2026-10-02", session_id: "s1", session_name: "A", status: "completed",
    rpe_score: 8, duration_s: 3600,
    athlete_modifications: { sessionForme: 4, sessionSets: { e1: [{ done: true, kg: 100, reps: 5, rir: 2 }, { done: false, skipped: true }] } },
  }],
  prs: [{ date: "2026-10-02", exercise_ref: "Squat", kg: 110 }],
  activities: [],
  dailies: [],
  competitions: [{ id: "c1", date: "2026-10-10", name: "Hyrox Paris", type: "competition", priority: "A", location: "Paris" }],
  tests: [{ id: "t1", date: "2026-10-12", title: "Squat 1RM", type: "musculation", completed: true, results_structured: { variables: { "1rm": 140 } } }],
  lifeEvents: [{ date_start: "2026-10-20", date_end: "2026-10-22", title: "Partiels" }],
  dayThemes: [{ date: "2026-10-05", label: "Jambes lourdes", intensity: "hard", dominante: "force" }],
} satisfies Omit<SummaryInput, "health">;

async function summaryFromTables() {
  const { db } = fakeDb(tables);
  const health = await readSummaryHealth(db, "a1", base.from, base.to);
  return buildSummary({ ...base, health });
}

describe("GET /athletes/:id/summary — non-régression de la forme", () => {
  it("même sortie qu'avec les clés app_data (golden produit avant la migration)", async () => {
    expect(JSON.parse(JSON.stringify(await summaryFromTables()))).toEqual(golden);
  });

  it("mêmes champs, mêmes types : bien_etre, poids, objectifs", async () => {
    const s = JSON.parse(JSON.stringify(await summaryFromTables()));
    expect(Object.keys(s)).toEqual(Object.keys(golden));
    expect(Object.keys(s.bien_etre[0])).toEqual([
      "date", "score", "fatigue", "sommeil", "stress", "energie", "fraicheur_musculaire", "sommeil_h", "blesse_malade",
    ]);
    expect(Object.keys(s.poids[0])).toEqual(["date", "kg"]);
    expect(Object.keys(s.objectifs)).toEqual(["seances_par_semaine", "sommeil_cible_h", "coucher", "lever", "poids_cible_kg"]);
    expect(s.bien_etre.map((w: { date: string }) => w.date)).toEqual(["2026-10-02", "2026-10-03", "2026-10-05"]);
  });

  it("note absente → null (jamais 0), objectif absent → null", async () => {
    const { db } = fakeDb({ wellness_entries: [{ athlete_id: "a1", day: "2026-10-02", ...wellnessBlank, fatigue: 3 }], body_weight_goals: [{ athlete_id: "a1", reference_kg: 62, target_kg: null }] });
    const s = buildSummary({ ...base, health: await readSummaryHealth(db, "a1", base.from, base.to) });
    expect(s.bien_etre[0]).toMatchObject({ fatigue: 3, sommeil: null, stress: null, energie: null, fraicheur_musculaire: null, score: null, sommeil_h: null });
    expect(s.objectifs.poids_cible_kg).toBeNull();
    expect(s.poids).toEqual([]);
  });

  it("n'expose ni autre athlète ni texte libre", async () => {
    const json = JSON.stringify(await summaryFromTables());
    for (const secret of ["SECRET-A2", "crise", "genou", "IRM"]) expect(json).not.toContain(secret);
  });
});

describe("readSummaryHealth", () => {
  it("ne lit que l'athlète et la période demandés", async () => {
    const { db } = fakeDb(tables);
    const h = await readSummaryHealth(db, "a1", "2026-10-01", "2026-10-28");
    expect(Object.keys(h.wellness)).toEqual(["2026-10-02", "2026-10-03", "2026-10-05"]);
    expect(h.weights).toEqual([{ day: "2026-10-02", kg: "62.4" }, { day: "2026-10-03", kg: 61.8 }]);
    expect(h.targetKg).toBe(60);
  });

  it("une lecture en erreur lève, elle ne renvoie pas un historique vide", async () => {
    for (const table of ["wellness_entries", "body_weight_logs", "body_weight_goals"]) {
      const { db } = fakeDb(tables, { table, op: "select" });
      await expect(readSummaryHealth(db, "a1", "2026-10-01", "2026-10-28")).rejects.toThrow(table);
    }
  });
});
