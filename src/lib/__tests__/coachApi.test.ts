import { describe, expect, it } from "vitest";
import { dayThemeText, describeOp, energyStepLines, namesFrom, paramsText } from "@/lib/coachApiDraftText";
import { DAY_THEME_DOMINANTES, DAY_THEME_INTENSITIES, DAY_THEME_INTENSITY_COLOR, DAY_THEME_DEFAULT_COLOR } from "@/lib/dayTheme";
import { BLOC_CATEGORIES } from "@/features/coach/components/programmation/types";
import {
  BLOC_CATEGORIES as API_BLOC_CATEGORIES,
  DAY_DEFAULT_COLOR,
  DAY_DOMINANTES,
  DAY_INTENSITIES,
  DAY_INTENSITY_COLOR,
} from "@shared/coachApiOps.ts";
import { energyTotals, type EnergyStepShape } from "@shared/coachApiEnergy.ts";
import { computeTotals, expandIntervals } from "@/lib/energy";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
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

describe("listes recopiées côté serveur", () => {
  // Le module partagé tourne aussi dans Deno et ne peut pas importer src/ :
  // si l'app ajoute une valeur, ce test rappelle de la reporter.
  it("thème du jour : mêmes intensités, dominantes et couleurs", () => {
    expect([...DAY_INTENSITIES]).toEqual([...DAY_THEME_INTENSITIES]);
    expect([...DAY_DOMINANTES]).toEqual([...DAY_THEME_DOMINANTES]);
    expect(DAY_INTENSITY_COLOR).toEqual(DAY_THEME_INTENSITY_COLOR);
    expect(DAY_DEFAULT_COLOR).toBe(DAY_THEME_DEFAULT_COLOR);
  });

  it("catégories de bloc identiques à l'éditeur", () => {
    expect([...API_BLOC_CATEGORIES]).toEqual([...BLOC_CATEGORIES]);
  });
});

describe("description d'une semaine", () => {
  it("nomme une séance créée par la proposition elle-même", () => {
    const created = { ...prog[0], id: "new-1", name: "Force haut 2" };
    const names = namesFrom(prog, [{ op: "create_session", session: created }]);
    expect(describeOp({ op: "place_session", date: "2026-11-03", session_id: "new-1" }, names))
      .toBe("Placer Force haut 2 le 2026-11-03");
  });

  it("résume le thème du jour comme le calendrier", () => {
    expect(dayThemeText({ label: "Jambes lourdes", intensity: "hard", dominante: "force" })).toBe("Hard · Force — Jambes lourdes");
    expect(dayThemeText({ label: "", intensity: null, dominante: "aerobie" })).toBe("Aérobie");
  });

  it("écrit les étapes d'une séance énergétique, groupes indentés", () => {
    const steps: EnergyStepShape[] = [
      { type: "interval", id: "1", role: "warmup", duration: { kind: "time", value: 600 }, target: { kind: "hr_zone", zone: 2 } },
      { type: "group", id: "2", role: "work", repeat: 6, children: [
        { type: "interval", id: "3", role: "work", duration: { kind: "distance", value: 400 }, target: { kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 100 } },
        { type: "interval", id: "4", role: "recovery", duration: { kind: "time", value: 60 }, target: { kind: "none" } },
      ] },
    ];
    expect(energyStepLines(steps)).toEqual([
      "Échauffement 10' @ Zone 2",
      "6 ×",
      "  Effort 400 m @ 95–100% VMA",
      "  Récup 1'",
    ]);
  });
});

describe("totaux d'une séance énergétique côté serveur", () => {
  it("égaux à ceux de l'éditeur", () => {
    const steps: EnergyStepShape[] = [
      { type: "interval", id: "1", role: "warmup", duration: { kind: "time", value: 600 }, target: { kind: "hr_zone", zone: 2 } },
      { type: "group", id: "2", role: "work", repeat: 6, rest_between: { type: "interval", id: "r", role: "rest", duration: { kind: "time", value: 90 }, target: { kind: "none" } }, children: [
        { type: "interval", id: "3", role: "work", duration: { kind: "distance", value: 400 }, target: { kind: "pace", unit: "min_per_km", min_s_per_unit: 200, max_s_per_unit: 210 } },
        { type: "interval", id: "4", role: "recovery", duration: { kind: "distance", value: 200 }, target: { kind: "hr_zone", zone: 1 } },
        { type: "group", id: "5", role: "work", repeat: 2, children: [
          { type: "interval", id: "6", role: "work", duration: { kind: "calories", value: 15 }, target: { kind: "none" } },
        ] },
      ] },
      { type: "interval", id: "7", role: "cooldown", duration: { kind: "lap_button" }, target: { kind: "none" } },
    ];
    const root: EnergyGroup = { type: "group", id: "root", role: "open", repeat: 1, children: steps as unknown as EnergyStep[] };
    const app = computeTotals(expandIntervals(root));
    expect(energyTotals(steps)).toEqual({ durationS: app.durationS, distanceM: app.distanceM });
  });
});


describe("description d'une planification", () => {
  const names = namesFrom([], []);

  it("dit les périodes, les suppressions et ce qui reste", () => {
    expect(describeOp({
      op: "create_cycle",
      row: { id: "c", mesocycle_id: null, name: "Force 1", start_date: "2026-11-02", end_date: "2026-11-29", objective: null },
      weeks: [1, 2, 3, 4].map((n) => ({ id: `w${n}`, cycle_id: "c", week_number: n, start_date: "", end_date: "", is_deload: n === 4 })),
    }, names)).toBe("Créer le cycle Force 1 du 2 nov. au 29 nov., 4 semaines, décharge semaine 4");
    expect(describeOp({ op: "delete_cycle", id: "c", name: "Force 1" }, names)).toContain("le réalisé reste");
    expect(describeOp({ op: "update_test", id: "t", title: "VMA", patch: { date: "2026-11-27" } }, names))
      .toBe("Modifier le test VMA : date « 2026-11-27 »");
    expect(describeOp({ op: "create_competition", row: { id: "k", name: "Hyrox Paris", date: "2027-03-20", type: "competition", priority: "A", location: null } }, names))
      .toBe("Ajouter la compétition Hyrox Paris le 2027-03-20 (priorité A)");
  });
});
