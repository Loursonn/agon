/**
 * Bloc `details_sante` de `GET /athletes/:id/summary` : douleur et maladie du
 * matin, zones, suivi de blessure, bilan hebdomadaire. Servi seulement sous
 * le texte IA du 15/11/2026 ; jamais de texte libre de l'athlète.
 */
import { describe, expect, it } from "vitest";
import { fakeDb } from "./fakeDb";
import { readSummaryHealth } from "../coachApiHealth";
import { readHealthDetails } from "../coachApiHealthDetails";
import { buildSummary, type SummaryInput } from "../coachApiRead";
import { AI_ASSISTANT_SINCE, AI_HEALTH_DETAILS_SINCE } from "../coachApiOps";

const blank = {
  fatigue: null, sommeil: null, stress: null, energie: null, doms: null,
  bedtime: null, wake: null, sleep_hours: null, sleep_interrupted: null, sleep_interrupt_note: null,
  doms_zones: [], doms_points: [], injury_note: null, weight_kg: null, archived: false,
  envie: null, pain: null, sick: null, doms_levels: {}, pain_levels: {}, doms_workout_id: null, doms_workout_name: null,
};

const tables = {
  wellness_entries: [
    {
      athlete_id: "a1", day: "2026-11-03", ...blank, fatigue: 3, envie: 2, pain: 6, sick: false,
      pain_levels: { genou: 6, "<script>": 3 }, doms_levels: { quadriceps: 2, ischios: 7 },
      injury_note: "SECRET-NOTE-BLESSURE", sleep_interrupt_note: "SECRET-SOMMEIL",
    },
    { athlete_id: "a1", day: "2026-11-04", ...blank, fatigue: 4 },
    { athlete_id: "a1", day: "2026-11-05", ...blank, sick: true },
    { athlete_id: "a2", day: "2026-11-03", ...blank, pain: 9, sick: true },
  ],
  weekly_reviews: [
    {
      athlete_id: "a1", week_start: "2026-11-03", status: "submitted", submitted_at: "2026-11-09T19:00:00Z", light: "orange",
      answers: {
        feel: { note: 4, energie: 2, motivation: 5, vie: 1, nutrition: 9 },
        kept: [{ text: "SECRET-ENGAGEMENT", status: "kept", why: "SECRET-POURQUOI" }, { text: "x", status: "missed" }, { text: "y", status: "???" }],
        worked: "SECRET-MARCHE", stuck: "SECRET-BLOQUE", stuckCause: "vie", change: "SECRET-CHANGE",
        next: ["SECRET-NEXT"], coachNote: "SECRET-COACH",
        pain: { zone: "Genou droit\n`rm`", kind: "douleur", level: 5 },
      },
    },
    // Semaine commencée avant la période : touche encore le 2 novembre.
    { athlete_id: "a1", week_start: "2026-10-27", status: "submitted", submitted_at: "2026-11-02T08:00:00Z", light: "green", answers: { feel: { note: 3 } } },
    // Brouillon : le coach ne le voit pas, l'assistant non plus.
    { athlete_id: "a1", week_start: "2026-11-10", status: "draft", submitted_at: null, light: null, answers: { feel: { note: 1 } } },
    { athlete_id: "a2", week_start: "2026-11-03", status: "submitted", submitted_at: "2026-11-09T19:00:00Z", light: "red", answers: { coachNote: "SECRET-A2" } },
  ],
  weekly_retours: [
    { athlete_id: "a1", coach_id: "c1", week_start: "2026-11-03", comment: "SECRET-RETOUR", athlete_reaction: "fire" },
  ],
  injury_followups: [
    { athlete_id: "a1", day: "2026-11-04", entry_id: "m1", pain_level: 4, workout_log_id: "w1", energy_assignment_id: null, note: "SECRET-SUIVI" },
    { athlete_id: "a1", day: "2026-11-05", entry_id: "m1", pain_level: 3, workout_log_id: null, energy_assignment_id: null, note: null },
    // Entrée médicale qui n'est pas une blessure : ne sort pas.
    { athlete_id: "a1", day: "2026-11-05", entry_id: "m2", pain_level: 8, workout_log_id: null, energy_assignment_id: null, note: null },
    // Hors période.
    { athlete_id: "a1", day: "2026-10-20", entry_id: "m1", pain_level: 7, workout_log_id: null, energy_assignment_id: null, note: null },
  ],
  medical_entries: [
    { id: "m1", athlete_id: "a1", kind: "blessure", zone: "Genou D", title: "SECRET-TITRE", notes: "SECRET-NOTES" },
    { id: "m2", athlete_id: "a1", kind: "suivi", zone: "Dos", title: "SECRET-SUIVI-MED" },
  ],
};

const base = {
  athlete: { id: "a1", first_name: "Léa", full_name: "Léa Démo" },
  from: "2026-11-02",
  to: "2026-11-08",
  appData: {},
  prog: [],
  workoutLogs: [],
  prs: [],
  activities: [],
  dailies: [],
} satisfies Omit<SummaryInput, "health">;

async function summary(withDetails: boolean) {
  const { db } = fakeDb(tables);
  const health = await readSummaryHealth(db, "a1", base.from, base.to);
  const healthDetails = withDetails ? await readHealthDetails(db, "a1", base.from, base.to) : null;
  return JSON.parse(JSON.stringify(buildSummary({ ...base, health, healthDetails })));
}

describe("details_sante", () => {
  it("absent sous l'ancien texte : le résumé ne change pas", async () => {
    const without = await summary(false);
    expect(without).not.toHaveProperty("details_sante");
    const withIt = await summary(true);
    const { details_sante: _, ...rest } = withIt;
    expect(rest).toEqual(without);
  });

  it("matin : envie, douleur, zones bornées, malade ; jours vides omis", async () => {
    const d = (await summary(true)).details_sante;
    expect(d.matin).toEqual([
      {
        date: "2026-11-03", envie: 2, douleur: 6, malade: false,
        douleur_zones: { genou: 6 },
        courbatures_zones: { quadriceps: 2 },
      },
      { date: "2026-11-05", envie: null, douleur: null, douleur_zones: null, courbatures_zones: null, malade: true },
    ]);
  });

  it("bilan hebdo : notes, statuts, cause, douleur ; semaine touchant la période ; brouillon exclu", async () => {
    const d = (await summary(true)).details_sante;
    expect(d.bilans_hebdo.map((b: { semaine_du: string }) => b.semaine_du)).toEqual(["2026-10-27", "2026-11-03"]);
    expect(d.bilans_hebdo[1]).toEqual({
      semaine_du: "2026-11-03",
      envoye_le: "2026-11-09",
      feu: "orange",
      notes: { semaine: 4, energie: 2, motivation: 5, charge_de_vie: 1, nutrition: null },
      engagements: ["tenu", "pas_tenu", null],
      blocage: "vie",
      douleur: { zone: "Genou droit rm", type: "douleur", niveau: 5 },
      retour_coach: true,
      reaction_au_retour: "feu",
    });
    expect(d.bilans_hebdo[0]).toMatchObject({ feu: "vert", douleur: null, retour_coach: false, reaction_au_retour: null });
  });

  it("suivi de blessure : zone de la blessure, après séance, période et type d'entrée respectés", async () => {
    const d = (await summary(true)).details_sante;
    expect(d.suivi_blessures).toEqual([
      { date: "2026-11-04", zone: "Genou D", douleur: 4, apres_seance: true },
      { date: "2026-11-05", zone: "Genou D", douleur: 3, apres_seance: false },
    ]);
  });

  it("aucun texte libre, aucun autre athlète", async () => {
    const json = JSON.stringify(await summary(true));
    expect(json).not.toMatch(/SECRET/);
    expect(json).not.toContain("<script>");
  });
});

describe("versions de l'accord IA", () => {
  it("les détails santé viennent après le texte qui nomme l'assistant", () => {
    expect(AI_HEALTH_DETAILS_SINCE > AI_ASSISTANT_SINCE).toBe(true);
  });
});
