/**
 * DELETE /fiches/:id (coach-api) : l'assistant retire les fiches qu'il a
 * déposées, et seulement celles-là. Cas d'origine (T-delete-fiches-id-renvoie-404) :
 * fiches de l'assistant republiées puis retouchées dans l'app, refusées en
 * 404 « introuvable » alors qu'elles étaient bien dans la banque.
 */
import { describe, expect, it } from "vitest";
import { API_FICHE_CATEGORIES, ficheDeleteRefusal, isAssistantFiche } from "../coachApiFiches";

const unused = { assignments: 0, variants: 0, comments: 0 };

describe("isAssistantFiche", () => {
  it("reconnaît le marqueur posé par POST /fiches, même sans l'étiquette « claude »", () => {
    expect(isAssistantFiche({ created_via: "api", tags: [] })).toBe(true);
    expect(isAssistantFiche({ created_via: "api", tags: ["test", "cmj"] })).toBe(true);
  });
  it("reconnaît encore l'étiquette « claude » des fiches d'avant le marqueur", () => {
    expect(isAssistantFiche({ created_via: null, tags: ["claude"] })).toBe(true);
  });
  it("une fiche importée par le coach dans l'app n'est pas celle de l'assistant", () => {
    expect(isAssistantFiche({ created_via: null, tags: [] })).toBe(false);
    expect(isAssistantFiche({ created_via: null, tags: null })).toBe(false);
  });
});

describe("ficheDeleteRefusal", () => {
  it("aucune fiche du coach sous cet id : 404", () => {
    expect(ficheDeleteRefusal(null, null)).toMatchObject({ status: 404, code: "fiche_introuvable" });
  });

  it("fiche de l'assistant retouchée dans l'app (étiquette retirée) : supprimable, plus de 404", () => {
    const doc = { created_via: "api", tags: ["test"] };
    expect(ficheDeleteRefusal(doc, null)).toBeNull();
    expect(ficheDeleteRefusal(doc, unused)).toBeNull();
  });

  it("fiche déposée par le coach : 409 explicite, pas 404 (elle existe)", () => {
    expect(ficheDeleteRefusal({ created_via: null, tags: ["dos"] }, null)).toMatchObject({ status: 409, code: "fiche_du_coach" });
  });

  it("fiche donnée à un athlète, déclinée en variantes ou commentée : reste", () => {
    const doc = { created_via: "api", tags: ["claude"] };
    expect(ficheDeleteRefusal(doc, { ...unused, assignments: 1 })).toMatchObject({ status: 409, code: "fiche_utilisee" });
    expect(ficheDeleteRefusal(doc, { ...unused, variants: 2 })).toMatchObject({ status: 409, code: "fiche_utilisee" });
    expect(ficheDeleteRefusal(doc, { ...unused, comments: 1 })).toMatchObject({ status: 409, code: "fiche_utilisee" });
  });
});

describe("catégories de fiche", () => {
  it("POST /fiches accepte « test »", () => {
    expect(API_FICHE_CATEGORIES).toContain("test");
  });
});
