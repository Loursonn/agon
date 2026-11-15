import { describe, it, expect } from "vitest";
import { foldSearch, groupBankTests } from "@/lib/testBankGroups";

const tests = [
  { id: "1", name: "Squat 1RM", category: "force" },
  { id: "2", name: "Broad jump", category: "explosivite" },
  { id: "3", name: "Flexion de hanche", category: "bilan_articulaire" },
  { id: "4", name: "Assis-debout 1 jambe", category: "bilan_articulaire" },
  { id: "5", name: "Test maison", category: null },
  { id: "6", name: "30m départ arrêté", category: "vitesse" },
  { id: "7", name: "Ancienne catégorie", category: "mobilite" },
  { id: "8", name: "SkiErg 1000 m", category: "hyrox" },
];

describe("groupBankTests", () => {
  it("regroupe par dominante dans l'ordre de la vue mois, puis HYROX, Autres en dernier, noms triés", () => {
    const g = groupBankTests(tests);
    expect(g.map((x) => x.key)).toEqual(["bilan_articulaire", "force", "explosivite", "vitesse", "hyrox", "autres"]);
    expect(g[0].tests.map((t) => t.name)).toEqual(["Assis-debout 1 jambe", "Flexion de hanche"]);
    expect(g[4]).toMatchObject({ label: "HYROX", tests: [{ id: "8" }] });
    expect(g[5]).toMatchObject({ label: "Autres", tests: [{ id: "7" }, { id: "5" }] });
  });

  it("« hyrox » trouve les tests HYROX par leur groupe", () => {
    expect(groupBankTests(tests, "hyrox").flatMap((g) => g.tests.map((t) => t.id))).toEqual(["8"]);
  });

  it("recherche sans accents ni majuscules, sur le nom", () => {
    expect(groupBankTests(tests, "DEPART").flatMap((g) => g.tests.map((t) => t.id))).toEqual(["6"]);
  });

  it("recherche sur le nom de la dominante, plusieurs mots", () => {
    expect(groupBankTests(tests, "explosivite").flatMap((g) => g.tests.map((t) => t.id))).toEqual(["2"]);
    expect(groupBankTests(tests, "bilan hanche").flatMap((g) => g.tests.map((t) => t.id))).toEqual(["3"]);
  });

  it("aucun résultat : aucun groupe", () => {
    expect(groupBankTests(tests, "zzz")).toEqual([]);
  });
});

describe("foldSearch", () => {
  it("retire accents et majuscules", () => {
    expect(foldSearch("  Épaule Élévation ")).toBe("epaule elevation");
  });
});
