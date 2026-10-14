import { describe, it, expect } from "vitest";
import {
  resolveFicheForWeek, collectProgDocIds, stripFiches, flattenFichesToWeek,
  groupFamilies, titleFromFileName, docFilePath, variantLabel,
} from "../fiches";
import type { Doc, FicheAttachment } from "../fiches";
import { prepareSession } from "@/features/coach/components/programmation/bankUtils";
import type { ProgSession } from "@/features/coach/components/programmation/types";

const att = (doc_id: string, weeks?: Record<number, string>): FicheAttachment => ({ id: "a-" + doc_id, doc_id, weeks });

describe("resolveFicheForWeek", () => {
  it("retourne la fiche par défaut sans variantes", () => {
    expect(resolveFicheForWeek(att("v1"), 3)).toBe("v1");
  });
  it("retourne la variante de la semaine", () => {
    const a = att("v1", { 3: "v2", 4: "v2" });
    expect(resolveFicheForWeek(a, 1)).toBe("v1");
    expect(resolveFicheForWeek(a, 3)).toBe("v2");
  });
  it("accepte les clés JSON en string", () => {
    const a = { id: "x", doc_id: "v1", weeks: JSON.parse('{"2":"v9"}') } as FicheAttachment;
    expect(resolveFicheForWeek(a, 2)).toBe("v9");
  });
  it("semaine inconnue → défaut", () => {
    expect(resolveFicheForWeek(att("v1", { 2: "v2" }), undefined)).toBe("v1");
  });
});

const session = (over: Partial<ProgSession> = {}): ProgSession => ({
  id: "s1", name: "Séance A", short: "A", recurrence: "weekly", multi_semaine: true, nb_semaines: 4,
  fiches: [att("sess")],
  blocs: [
    { id: "b1", name: "Mobilité", series_mode: "libre", timing_mode: "libre", exercices: [], sort_order: 0,
      fiches: [att("mob-v1", { 3: "mob-v2", 4: "mob-v2" })] },
    { id: "b2", name: "Force", series_mode: "libre", timing_mode: "libre", exercices: [], sort_order: 1 },
  ],
  ...over,
});

describe("collectProgDocIds", () => {
  it("collecte séance + blocs + variantes par semaine, sans doublon", () => {
    const ids = collectProgDocIds([session(), session({ id: "s2" })]);
    expect(ids.sort()).toEqual(["mob-v1", "mob-v2", "sess"]);
  });
  it("inclut un override d'occurrence (fiches + blocs aplatis)", () => {
    const override = { fiches: [att("perso")], blocs: [{ fiches: [att("ovr")] }] };
    expect(collectProgDocIds([override]).sort()).toEqual(["ovr", "perso"]);
  });
  it("tolère les données sans fiches", () => {
    expect(collectProgDocIds([{ blocs: [{}] }, {}])).toEqual([]);
  });
});

describe("stripFiches (duplication vers un autre athlète)", () => {
  it("retire les rattachements vers une fiche perso d'un autre athlète", () => {
    const s = session({ fiches: [att("sess"), att("perso-autre")] });
    const { session: out, removed } = stripFiches(s, id => id === "perso-autre");
    expect(removed).toBe(1);
    expect(out.fiches?.map(f => f.doc_id)).toEqual(["sess"]);
    expect(out.blocs[0].fiches).toHaveLength(1);
  });
  it("retire un rattachement dont une variante de semaine est étrangère", () => {
    const s = session();
    const { session: out, removed } = stripFiches(s, id => id === "mob-v2");
    expect(removed).toBe(1);
    expect(out.blocs[0].fiches).toEqual([]);
  });
  it("ne modifie pas l'original", () => {
    const s = session({ fiches: [att("x")] });
    stripFiches(s, () => true);
    expect(s.fiches).toHaveLength(1);
  });
});

describe("flattenFichesToWeek", () => {
  it("résout la variante et supprime weeks", () => {
    expect(flattenFichesToWeek([att("v1", { 3: "v2" })], 3)).toEqual([{ id: "a-v1", doc_id: "v2" }]);
  });
});

describe("banque de séances", () => {
  it("conserve les rattachements (mode toutes semaines)", () => {
    const out = prepareSession(session());
    expect(out.fiches).toEqual(session().fiches);
    expect(out.blocs[0].fiches).toEqual(session().blocs[0].fiches);
  });
  it("aplatit sur la semaine choisie", () => {
    const out = prepareSession(session(), 3);
    expect(out.blocs[0].fiches).toEqual([{ id: "a-mob-v1", doc_id: "mob-v2" }]);
  });
});

const doc = (id: string, over: Partial<Doc> = {}): Doc => ({
  id, coach_id: "c", athlete_id: null, uploaded_by: "c", origin_id: null, variant_label: null, variant_order: 0,
  title: id, description: null, category: "mobilite", tags: [], kind: "pdf", file_path: id + ".pdf",
  file_size: 1, mime_type: "application/pdf", is_self_service: false, archived_at: null,
  created_at: "2026-10-14", updated_at: "2026-10-14", ...over,
});

describe("divers", () => {
  it("groupFamilies range les variantes sous l'origine", () => {
    const fams = groupFamilies([
      doc("o"), doc("v2", { origin_id: "o", variant_order: 2 }), doc("v1", { origin_id: "o", variant_order: 1 }),
    ]);
    expect(fams).toHaveLength(1);
    expect(fams[0].variants.map(v => v.id)).toEqual(["v1", "v2"]);
  });
  it("variantLabel", () => {
    expect(variantLabel(doc("o"))).toBe("Originale");
    expect(variantLabel(doc("v", { origin_id: "o", variant_label: "V2" }))).toBe("V2");
  });
  it("titleFromFileName", () => {
    expect(titleFromFileName("mobilite_hanches-v2.pdf")).toBe("Mobilite hanches v2");
  });
  it("docFilePath banque / athlète", () => {
    expect(docFilePath({ coachId: "c", athleteId: null, docId: "d", ext: "pdf" })).toBe("c/banque/d.pdf");
    expect(docFilePath({ coachId: "c", athleteId: "a", docId: "d", ext: "webp" })).toBe("c/athletes/a/d.webp");
  });
});
