import { describe, it, expect } from "vitest";
import {
  archivedWellnessOf,
  averageItem,
  averageScore,
  parseWellnessEntry,
  parseWellnessHistory,
  readItem,
  scoreOfRaw,
  toLegacyEntry,
  wellnessBand,
  wellnessEntries,
  wellnessScore,
} from "../wellness";

/** Saisie telle qu'écrite par `WellnessFlow` (clé compacte, `date` compacte). */
const raw = (o: Record<string, unknown> = {}) => ({
  fatigue: 4, sommeil: 3, stress: 4, energie: 5, doms: 4,
  score: 80, date: "20261107",
  coucher: { h: 23, m: 0 }, reveil: { h: 7, m: 15 }, sleepDur: 8.3,
  domsZones: ["quadri"], domsPoints: [{ id: "p1", x: 10, y: 20, side: "front", intensity: 6 }],
  poids: 72.4, injComment: null, sleepInterrupt: false, sleepInterruptNote: null,
  ...o,
});

describe("readItem", () => {
  it("garde les notes 1-5, écarte le reste", () => {
    expect([1, 3, 5, 4.5, "4"].map(readItem)).toEqual([1, 3, 5, 4.5, 4]);
    for (const v of [0, 6, 9, -1, null, undefined, "", "x", NaN]) expect(readItem(v)).toBeNull();
  });
});

describe("parseWellnessEntry", () => {
  it("lit une saisie réelle", () => {
    const e = parseWellnessEntry(raw(), "20261107")!;
    expect(e.day).toBe("2026-11-07");
    expect(e.items).toEqual({ fatigue: 4, sommeil: 3, stress: 4, energie: 5, doms: 4 });
    expect(e.sleep).toEqual({ bedtime: { h: 23, m: 0 }, wake: { h: 7, m: 15 }, hours: 8.3, interrupted: false, interruptNote: null });
    expect(e.domsZones).toEqual(["quadri"]);
    expect(e.domsPoints).toEqual([{ id: "p1", x: 10, y: 20, side: "front", intensity: 6 }]);
    expect(e.injuryNote).toBeNull();
    expect(e.weightKg).toBe(72.4);
    expect(e.archived).toBe(false);
  });

  it("la clé prime sur le champ date ; sans clé, le champ date suffit", () => {
    expect(parseWellnessEntry(raw({ date: "20261101" }), "2026-11-07")!.day).toBe("2026-11-07");
    expect(parseWellnessEntry(raw())!.day).toBe("2026-11-07");
  });

  it("écarte les valeurs non objet et les clés non datées", () => {
    expect(parseWellnessEntry(3, "1")).toBeNull();
    expect(parseWellnessEntry(raw({ date: undefined }), "4")).toBeNull();
    expect(parseWellnessEntry(null, "20261107")).toBeNull();
  });

  it("note hors échelle (ancienne échelle /10) → null, pas 5", () => {
    const e = parseWellnessEntry({ fatigue: 6, sommeil: 9, stress: 2, energie: 8, doms: 3 }, "20260415")!;
    expect(e.items).toEqual({ fatigue: null, sommeil: null, stress: 2, energie: null, doms: 3 });
    expect(wellnessScore(e)).toBeNull();
  });

  it("« blessé/malade » : le commentaire devient injuryNote", () => {
    expect(parseWellnessEntry(raw({ injComment: "  Genou droit  " }), "20261107")!.injuryNote).toBe("Genou droit");
    expect(parseWellnessEntry(raw({ injComment: "" }), "20261107")!.injuryNote).toBeNull();
  });

  it("une WellnessEntry repasse telle quelle", () => {
    const e = parseWellnessEntry(raw(), "20261107")!;
    expect(parseWellnessEntry(e)).toEqual(e);
  });
});

describe("parseWellnessHistory", () => {
  it("clés compactes réelles, clés de semaine parasites écartées, jours croissants", () => {
    const h = parseWellnessHistory({ "20261107": raw(), "20261105": raw({ date: "20261105" }), "1": 3, "4": 2 });
    expect(Object.keys(h)).toEqual(["2026-11-05", "2026-11-07"]);
  });

  it("asp:wh prime sur l'archive ; l'archive comble les trous", () => {
    const h = parseWellnessHistory(
      { "20261107": raw({ fatigue: 5 }) },
      [{ "20261107": raw({ fatigue: 1 }), "20260901": raw({ date: "20260901" }) }],
    );
    expect(h["2026-11-07"].items.fatigue).toBe(5);
    expect(h["2026-11-07"].archived).toBe(false);
    expect(h["2026-09-01"].archived).toBe(true);
  });

  it("un bloc archivé plus récent l'emporte sur un plus ancien", () => {
    const h = parseWellnessHistory({}, [{ "20260901": raw({ doms: 1 }) }, { "20260901": raw({ doms: 2 }) }]);
    expect(h["2026-09-01"].items.doms).toBe(2);
  });

  it("même jour en ISO et en compact : la clé compacte gagne", () => {
    const h = parseWellnessHistory({ "20261107": raw({ stress: 2 }), "2026-11-07": raw({ stress: 5 }) });
    expect(h["2026-11-07"].items.stress).toBe(2);
    const h2 = parseWellnessHistory({ "2026-11-07": raw({ stress: 5 }), "20261107": raw({ stress: 2 }) });
    expect(h2["2026-11-07"].items.stress).toBe(2);
  });

  it("tolère un blob absent ou cassé", () => {
    expect(parseWellnessHistory(null)).toEqual({});
    expect(parseWellnessHistory([1, 2], [null, "x"])).toEqual({});
  });

  it("archivedWellnessOf lit asp:blockHistory brut", () => {
    expect(archivedWellnessOf([{ wellnessHistory: { a: 1 } }, { exos: {} }, null])).toEqual([{ a: 1 }]);
    expect(archivedWellnessOf({})).toEqual([]);
  });

  it("wellnessEntries borne la période (bornes incluses)", () => {
    const h = parseWellnessHistory({ "20261101": raw(), "20261105": raw(), "20261110": raw() });
    expect(wellnessEntries(h, "2026-11-01", "2026-11-05").map((e) => e.day)).toEqual(["2026-11-01", "2026-11-05"]);
  });
});

describe("toLegacyEntry", () => {
  it("aller-retour sans perte", () => {
    const e = parseWellnessEntry(raw({ injComment: "Rhume", sleepInterrupt: true, sleepInterruptNote: "bébé" }), "20261107")!;
    const back = toLegacyEntry(e);
    expect(back).toMatchObject({ date: "20261107", fatigue: 4, score: 80, injComment: "Rhume", poids: 72.4, sleepDur: 8.3 });
    expect(parseWellnessEntry(back, "20261107")).toEqual(e);
  });

  it("le score écrit est celui du calcul, pas celui fourni", () => {
    const e = parseWellnessEntry(raw({ score: 12 }), "20261107")!;
    expect(toLegacyEntry(e).score).toBe(80);
  });
});

describe("score et paliers", () => {
  it("somme / 25 × 100, arrondi", () => {
    expect(scoreOfRaw({ fatigue: 4, sommeil: 3, stress: 4, energie: 5, doms: 4 })).toBe(80);
    expect(scoreOfRaw({ fatigue: 1, sommeil: 1, stress: 1, energie: 1, doms: 1 })).toBe(20);
    expect(scoreOfRaw({ fatigue: 3, sommeil: 3, stress: 3, energie: 3, doms: 2 })).toBe(56);
  });

  it("recalculé : le score stocké n'est pas lu", () => {
    expect(scoreOfRaw({ fatigue: 5, sommeil: 5, stress: 5, energie: 5, doms: 5, score: 0 })).toBe(100);
  });

  it("note manquante → null, jamais 0", () => {
    expect(scoreOfRaw({ fatigue: 5, sommeil: 5, stress: 5, energie: 5 })).toBeNull();
    expect(scoreOfRaw(null)).toBeNull();
    expect(wellnessScore(null)).toBeNull();
  });

  it("5 paliers 80 / 65 / 50 / 35", () => {
    const at = (s: number) => wellnessBand(s)!.label;
    expect([100, 80, 79, 65, 64, 50, 49, 35, 34, 0].map(at)).toEqual([
      "Optimal", "Optimal", "Bon", "Bon", "Modéré", "Modéré", "Fatigué", "Fatigué", "Surmenage", "Surmenage",
    ]);
    expect([80, 65, 50, 35, 0].map((s) => wellnessBand(s)!.tone)).toEqual(["good", "good", "warn", "bad", "bad"]);
    expect(wellnessBand(null)).toBeNull();
  });

  it("moyennes : les absents ne comptent pas", () => {
    expect(averageScore([80, null, 60, undefined])).toBe(70);
    expect(averageScore([null])).toBeNull();
    expect(averageScore([])).toBeNull();
    const es = [{ items: { fatigue: 4, sommeil: 3, stress: null, energie: 5, doms: 4 } }, { items: { fatigue: 3, sommeil: 3, stress: null, energie: 5, doms: 4 } }];
    expect(averageItem(es, "fatigue")).toBe(3.5);
    expect(averageItem(es, "stress")).toBeNull();
  });
});
