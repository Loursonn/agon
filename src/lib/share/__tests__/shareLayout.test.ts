import { describe, expect, it } from "vitest";
import { CARD_H, CARD_W, ellipsize, fitLine, layoutShareCard, opBounds, wrapText, type FontSpec, type Measure, type SharePalette } from "../shareLayout";
import type { ShareCard, ShareRow } from "../sessionShare";

/** Mesure approchée : largeur moyenne d'un caractère selon la police (pessimiste pour la Mono). */
const measure: Measure = (text: string, f: FontSpec) => {
  const n = Array.from(text).length;
  const k = f.family === "data" ? 0.62 : f.family === "display" ? (f.wide ? 0.82 : 0.62) : 0.56;
  return n * f.size * k + (f.spacing ?? 0) * Math.max(0, n - 1);
};

const P: SharePalette = { bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D", tx: "#FFF", tx2: "#B9AE9C", brd: "rgba(1,1,1,.1)", onAccent: "#15120F", gold: "#FFC933" };
const PAD = 36;

function card(over: Partial<ShareCard> = {}): ShareCard {
  return {
    kind: "muscu", done: true, accent: "#FFC933", kicker: "Faite · mar. 25 nov.", who: "Séance de Léa",
    title: "Squat & chaîne postérieure", meta: "Bloc force · semaine 3 / 4",
    stats: [{ value: "19", unit: "/19", label: "Séries" }, { value: "8", unit: "/10", label: "RPE" }],
    sections: [{ type: "rows", rows: [{ title: "Back squat", badge: { text: "A", color: "#FF5A33", shape: "chip" }, pills: [{ text: "120×3" }, { text: "125×3", strong: true }] }] }],
    coach: "Hugo T.", footerRight: "1 record", ...over,
  };
}

/** Tout dans le cadre ; le contenu reste entre l'en-tête et le pied, dans les marges. */
function expectInside(c: ShareCard) {
  const out = layoutShareCard(c, measure, P);
  for (const o of out.ops) {
    const b = opBounds(o, measure);
    expect(b.x0, JSON.stringify(o)).toBeGreaterThanOrEqual(-0.5);
    expect(b.x1, JSON.stringify(o)).toBeLessThanOrEqual(CARD_W + 0.5);
    expect(b.y0, JSON.stringify(o)).toBeGreaterThanOrEqual(-0.5);
    expect(b.y1, JSON.stringify(o)).toBeLessThanOrEqual(CARD_H + 0.5);
    if (o.t === "text") {
      // Aucun texte ne déborde des marges latérales.
      expect(b.x0, o.text).toBeGreaterThanOrEqual(PAD - 0.5);
      expect(b.x1, o.text).toBeLessThanOrEqual(CARD_W - PAD + 0.5);
      // Aucun texte n'est vide de lisibilité.
      expect(o.font.size, o.text).toBeGreaterThanOrEqual(6);
    }
  }
  // Le contenu ne touche pas le pied de carte (« Programmé par… »).
  const footer = out.ops.filter((o) => o.t === "text" && o.y === CARD_H - 32);
  const footTop = Math.min(...footer.map((o) => opBounds(o, measure).y0), CARD_H);
  const body = out.ops.slice(1).filter((o) => !footer.includes(o) && !(o.t === "rect" && o.y === 0));
  for (const o of body) expect(opBounds(o, measure).y1, JSON.stringify(o)).toBeLessThanOrEqual(footTop);
  return out;
}

const pills = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `${100 + i * 2.5}×${8 + (i % 3)}` }));
const row = (i: number, n = 5): ShareRow => ({
  title: `Exercice numéro ${i + 1}`, badge: { text: String.fromCharCode(65 + (i % 26)), color: "#FFC933", shape: "chip" },
  sub: "tempo 3-1-1 · RIR 2", pills: pills(n), pillsSummary: `${n} séries · 100 → 120 kg × 8`,
});

describe("textes", () => {
  it("fitLine réduit puis coupe avec …", () => {
    const f: FontSpec = { family: "ui", size: 20, weight: 400 };
    expect(fitLine("court", f, 500, measure).text).toBe("court");
    const r = fitLine("un texte vraiment beaucoup trop long pour la case", f, 120, measure);
    expect(measure(r.text, r.font)).toBeLessThanOrEqual(120);
    expect(r.text.endsWith("…")).toBe(true);
    expect(ellipsize("abc", f, 0, measure)).toBe("");
  });

  it("wrapText coupe un mot interminable et limite le nombre de lignes", () => {
    const f: FontSpec = { family: "ui", size: 16, weight: 400 };
    const lines = wrapText("Supercalifragilisticexpialidocious ".repeat(6), f, 100, 3, measure);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const l of lines) expect(measure(l, f)).toBeLessThanOrEqual(100.01);
  });
});

describe("layoutShareCard : tout rentre", () => {
  it("séance courte : palier aéré, contenu agrandi sans déborder", () => {
    const out = expectInside(card());
    expect(out.level).toBe(0);
    expect(out.scale).toBeGreaterThan(1);
    expect(out.scale).toBeLessThanOrEqual(1.25);
    expect(out.hidden).toBe(0);
  });

  it("8 exercices de 6 séries : tient sans rien cacher", () => {
    const out = expectInside(card({ sections: [{ type: "rows", label: "Corps de séance", rows: Array.from({ length: 8 }, (_, i) => row(i, 6)) }] }));
    expect(out.hidden).toBe(0);
  });

  it("12 séries sur un même exercice : les pastilles passent sur plusieurs lignes", () => {
    const out = expectInside(card({ sections: [{ type: "rows", rows: [row(0, 12), row(1, 12), row(2, 4)] }] }));
    expect(out.hidden).toBe(0);
    const pillTexts = out.ops.filter((o) => o.t === "text" && /×/.test(o.text));
    const ys = new Set(pillTexts.map((o) => Math.round(o.y)));
    expect(ys.size).toBeGreaterThan(3);
  });

  it("30 exercices de 10 séries : resserré, réduit, puis « + N autres »", () => {
    const out = expectInside(card({ sections: [{ type: "rows", label: "Corps", rows: Array.from({ length: 30 }, (_, i) => row(i, 10)) }] }));
    expect(out.level).toBe(4);
    expect(out.scale).toBeGreaterThanOrEqual(0.6);
    expect(out.ops.some((o) => o.t === "text" && /^\+ \d+ autres$/.test(o.text))).toBe(true);
  });

  it("titre, noms et chiffres démesurés restent dans leurs cases", () => {
    const huge = card({
      title: "Développé couché prise serrée et chaîne postérieure intégrale avec supersets interminables du samedi",
      kicker: "Musculation · mercredi 25 novembre 2026 en fin de journée",
      who: "Séance de Marie-Charlotte-Alexandrine",
      meta: "Bloc force maximale · semaine 12 / 12 · environ 145 minutes de travail",
      stats: [{ value: "123 456 789", unit: " kg", label: "Charge soulevée totale" }, { value: "10", unit: "/10", label: "RPE" }, { value: "99", unit: "/99", label: "Séries" }],
      sections: [{ type: "rows", rows: [{ title: "Soulevé de terre roumain sur déficit avec bandes élastiques et pause", right: "12 × 12 · 245,5 kg", rightSub: "Repos 4 min 30 s", tag: "Record", badge: { text: "B12", color: "#FFC933", shape: "chip" } }] }],
      quote: "Une très longue phrase de commentaire. ".repeat(10),
      coach: "Jean-Baptiste-Emmanuel De La Rochefoucauld T.",
      footerRight: "3 records battus aujourd'hui",
    });
    const out = expectInside(huge);
    const titleLines = out.ops.filter((o) => o.t === "text" && o.font.family === "display");
    expect(titleLines.length).toBeLessThanOrEqual(3);
  });

  it("énergie : profil de 60 barres, étiquettes sans chevauchement, 7 zones", () => {
    const bars = Array.from({ length: 60 }, (_, i) => ({ width: 1, height: (i % 5) / 5 + 0.1, color: "#33B5FF", label: i % 2 ? "3:51" : null }));
    const out = expectInside(card({
      kind: "energie", hero: { value: "142,6", unit: "km", caption: "en 12:03:10" },
      sections: [
        { type: "profile", label: "Allure des reps", right: "obj. 3:55", bars, axis: ["0", "6 h", "12 h"] },
        { type: "zones", label: "Temps dans les zones · FC", zones: Array.from({ length: 7 }, (_, i) => ({ label: `Z${i + 1}`, value: `${i * 17}'`, share: i + 1, color: "#66F03C" })) },
      ],
    }));
    const labels = out.ops.filter((o) => o.t === "text" && o.text === "3:51").map((o) => opBounds(o, measure)).sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < labels.length; i++) expect(labels[i].x0).toBeGreaterThanOrEqual(labels[i - 1].x1);
  });

  it("objectif en tête : pastille J-X, nom et date dans le cadre, contenu décalé", () => {
    const without = layoutShareCard(card(), measure, P);
    const out = expectInside(card({ objective: { countdown: "J-180", name: "HYROX Paris", date: "lun. 24 mai" } }));
    expect(out.ops.some((o) => o.t === "text" && o.text === "J-180")).toBe(true);
    expect(out.ops.some((o) => o.t === "text" && o.text === "HYROX PARIS")).toBe(true);
    const kicker = (l: typeof out) => l.ops.find((o) => o.t === "text" && o.text.startsWith("FAITE"));
    expect(kicker(out)!.y).toBeGreaterThan(kicker(without)!.y);
  });

  it("objectif au nom démesuré, Jour J, séance très longue : tout tient", () => {
    expectInside(card({
      objective: { countdown: "Jour J", name: "Championnats de France élite de cross-country long par équipes ".repeat(3), date: "sam. 6 févr. 2027" },
      sections: [{ type: "rows", label: "Corps", rows: Array.from({ length: 30 }, (_, i) => row(i, 10)) }],
    }));
  });

  it("sans prénom, sans coach, sans sections : rien ne casse", () => {
    expectInside(card({ who: null, coach: null, footerRight: null, sections: [], stats: [], meta: null }));
  });

  it("section vide ignorée, lignes sans badge ni droite", () => {
    expectInside(card({ sections: [{ type: "rows", rows: [] }, { type: "rows", rows: [{ title: "Seul" }] }, { type: "note", label: "Échauf.", text: "8 min de mobilité ".repeat(20) }] }));
  });
});
