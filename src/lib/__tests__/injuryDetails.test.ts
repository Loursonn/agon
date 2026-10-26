import { describe, it, expect } from "vitest";
import {
  activeInjuries,
  daysOffReading,
  EMPTY_INJURY_DETAIL,
  fmtInjuryDate,
  injuryDetailForSave,
  injuryDetailOf,
  injuryFacts,
  injurySummary,
  isActiveInjury,
  painReading,
  painValue,
  type InjuryLike,
} from "@/lib/injuryDetails";

/** Blessure minimale : ce qu'on obtient quand une gêne est déclarée en dix secondes. */
const gene = (over: Partial<InjuryLike> = {}): InjuryLike => ({
  kind: "blessure", status: "en_cours", title: "Gêne genou", ...over,
});

describe("blessures actives", () => {
  it("une blessure en cours est active, une blessure guérie non", () => {
    expect(isActiveInjury(gene())).toBe(true);
    expect(isActiveInjury(gene({ status: "gueri" }))).toBe(false);
  });

  it("une opération ou une pathologie en cours n'est pas une blessure active", () => {
    // Le badge dit « blessure active » : une pathologie chronique en cours ne doit
    // pas l'allumer en permanence.
    expect(isActiveInjury({ kind: "operation", status: "en_cours" })).toBe(false);
    expect(isActiveInjury({ kind: "pathologie", status: "en_cours" })).toBe(false);
    expect(isActiveInjury({ kind: "autre", status: "en_cours" })).toBe(false);
  });

  it("filtre une liste mêlée sans en changer le type", () => {
    const entries = [
      gene({ title: "Cheville" }),
      gene({ title: "Épaule", status: "gueri" }),
      { kind: "operation" as const, status: "en_cours" as const, title: "LCA" },
    ];
    expect(activeInjuries(entries).map((e) => e.title)).toEqual(["Cheville"]);
  });
});

describe("douleur", () => {
  it("borne l'échelle à 0–10 et arrondit", () => {
    expect(painValue(null)).toBe(null);
    expect(painValue(undefined)).toBe(null);
    expect(painValue(NaN)).toBe(null);
    expect(painValue(-3)).toBe(0);
    expect(painValue(42)).toBe(10);
    expect(painValue(6.4)).toBe(6);
  });

  it("se dit en clair, 0 compris", () => {
    // Une gêne peut se déclarer sans douleur du jour : 0 est une vraie réponse,
    // pas une absence de réponse.
    expect(painReading(0)).toBe("aucune douleur");
    expect(painReading(1)).toBe("douleur légère");
    expect(painReading(2)).toBe("douleur légère");
    expect(painReading(4)).toBe("douleur modérée");
    expect(painReading(6)).toBe("douleur gênante");
    expect(painReading(8)).toBe("douleur forte");
    expect(painReading(10)).toBe("douleur très forte");
    expect(painReading(null)).toBe(null);
  });
});

describe("jours d'arrêt", () => {
  it("accorde le pluriel et distingue zéro de rien", () => {
    expect(daysOffReading(null)).toBe(null);
    expect(daysOffReading(0)).toBe("aucun jour d'arrêt");
    expect(daysOffReading(1)).toBe("1 jour d'arrêt");
    expect(daysOffReading(3)).toBe("3 jours d'arrêt");
    expect(daysOffReading(-1)).toBe(null); // valeur impossible, la contrainte SQL l'interdit
  });
});

describe("date de retour", () => {
  it("formate sans dériver avec le fuseau", () => {
    expect(fmtInjuryDate("2026-03-12")).toBe("12 mar 2026");
    expect(fmtInjuryDate("2026-01-01")).toBe("1 jan 2026");
    expect(fmtInjuryDate("2026-12-31")).toBe("31 déc 2026");
  });

  it("ignore ce qui n'est pas une date", () => {
    expect(fmtInjuryDate(null)).toBe(null);
    expect(fmtInjuryDate("")).toBe(null);
    expect(fmtInjuryDate("bientôt")).toBe(null);
    expect(fmtInjuryDate("2026-13-01")).toBe(null); // mois inexistant
  });
});

describe("détail affiché", () => {
  it("une gêne déclarée sans détail n'affiche rien", () => {
    expect(injuryFacts(gene())).toEqual([]);
  });

  it("n'affiche que ce qui a été rempli", () => {
    const facts = injuryFacts(gene({ pain_level: 7, training_impact: "adapte" }));
    expect(facts).toEqual([
      { l: "Douleur", v: "7/10 — douleur forte" },
      { l: "Impact sur l'entraînement", v: "Je m'entraîne adapté" },
    ]);
  });

  it("ordonne du plus utile au moins urgent", () => {
    const facts = injuryFacts(gene({
      injury_type: "recidive", mechanism: "geste_repete", context: "entrainement",
      pain_level: 4, training_impact: "arret_partiel", days_off: 2,
      diagnosed_by: "kine", return_date: "2026-03-12",
    }));
    expect(facts.map((f) => f.l)).toEqual([
      "Douleur", "Impact sur l'entraînement", "Type", "Mécanisme",
      "Survenue", "Arrêt", "Vu par", "Retour prévu",
    ]);
    expect(facts.map((f) => f.v)).toEqual([
      "4/10 — douleur modérée", "Arrêt partiel", "Récidive", "Geste répété",
      "Entraînement", "2 jours d'arrêt", "Kiné", "12 mar 2026",
    ]);
  });

  it("une douleur à 0 reste affichée", () => {
    expect(injuryFacts(gene({ pain_level: 0 }))).toEqual([
      { l: "Douleur", v: "0/10 — aucune douleur" },
    ]);
  });

  it("le détail ne concerne que les blessures", () => {
    // Les colonnes existent pour toutes les lignes ; une opération mal remplie ne
    // doit pas afficher un mécanisme de blessure.
    const operation: InjuryLike = { kind: "operation", status: "en_cours", pain_level: 5 };
    expect(injuryFacts(operation)).toEqual([]);
  });
});

describe("état du formulaire", () => {
  it("part de rien quand il n'y a rien", () => {
    expect(injuryDetailOf(null)).toEqual(EMPTY_INJURY_DETAIL);
    expect(injuryDetailOf(undefined)).toEqual(EMPTY_INJURY_DETAIL);
    // Copie : éditer le formulaire ne doit pas contaminer la constante.
    expect(injuryDetailOf(null)).not.toBe(EMPTY_INJURY_DETAIL);
  });

  it("reprend une ligne existante et borne la douleur", () => {
    expect(injuryDetailOf({ pain_level: 12, mechanism: "chute", return_date: "" })).toEqual({
      ...EMPTY_INJURY_DETAIL, pain_level: 10, mechanism: "chute", return_date: null,
    });
  });

  it("vide le détail quand ce n'est plus une blessure", () => {
    // Sinon une ligne passée de « blessure » à « opération » garderait un
    // mécanisme que plus aucun écran n'affiche.
    const filled = injuryDetailOf({ pain_level: 5, mechanism: "contact", days_off: 3 });
    expect(injuryDetailForSave("operation", filled)).toEqual(EMPTY_INJURY_DETAIL);
    expect(injuryDetailForSave("blessure", filled)).toMatchObject({
      pain_level: 5, mechanism: "contact", days_off: 3,
    });
  });

  it("n'envoie pas de jours d'arrêt impossibles", () => {
    expect(injuryDetailForSave("blessure", { ...EMPTY_INJURY_DETAIL, days_off: -2 }).days_off).toBe(null);
    expect(injuryDetailForSave("blessure", { ...EMPTY_INJURY_DETAIL, days_off: NaN }).days_off).toBe(null);
    expect(injuryDetailForSave("blessure", { ...EMPTY_INJURY_DETAIL, days_off: 2.6 }).days_off).toBe(3);
    expect(injuryDetailForSave("blessure", { ...EMPTY_INJURY_DETAIL, days_off: 0 }).days_off).toBe(0);
  });
});

describe("résumé en une ligne", () => {
  it("zone, douleur et impact", () => {
    expect(injurySummary(gene({ zone: "Cheville gauche", pain_level: 8, training_impact: "arret_partiel" })))
      .toBe("Cheville gauche · douleur forte · Arrêt partiel");
  });

  it("retombe sur le titre quand la zone manque", () => {
    expect(injurySummary(gene({ zone: null, title: "Tendinite rotulienne" })))
      .toBe("Tendinite rotulienne");
    expect(injurySummary(gene({ zone: "   ", title: "Tendinite rotulienne" })))
      .toBe("Tendinite rotulienne");
  });

  it("reste lisible quand rien n'est renseigné", () => {
    expect(injurySummary({ kind: "blessure", status: "en_cours" })).toBe("Zone non précisée");
  });
});
