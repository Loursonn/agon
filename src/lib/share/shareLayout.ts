/**
 * Mise en page de la story « Partage de séance » (540 × 960 logiques, image
 * dessinée × 2 = 1080 × 1920). Pure : la mesure du texte est injectée (canvas
 * réel en production, mesure approchée dans les tests).
 *
 * Garantie : rien ne sort du cadre, quelle que soit la séance (30 exercices,
 * 12 séries, noms très longs, gros chiffres). Ordre de repli quand la place
 * manque :
 *   1. cinq paliers de densité (textes, marges et barres un peu plus petits ;
 *      au 3ᵉ, les séries deviennent un résumé ; au 4ᵉ, les sous-lignes
 *      et le commentaire disparaissent) ;
 *   2. réduction uniforme de tout le contenu, jusqu'à 60 % ;
 *   3. en dernier recours, les dernières lignes de la plus longue section sont
 *      remplacées par « + N autres ».
 * Chaque texte est mesuré : une ligne trop longue rétrécit puis se termine
 * par « … », un titre passe à la ligne (3 lignes au plus).
 */
import type { ProfileBarSpec, ShareCard, ShareRow, ShareSection } from "./sessionShare";

export const CARD_W = 540;
export const CARD_H = 960;
const PAD = 36;
const BAND = 8;

export type FontFamily = "display" | "ui" | "data";

export interface FontSpec {
  family: FontFamily;
  size: number;
  weight: number;
  /** Espacement des lettres, px. */
  spacing?: number;
  /** Archivo largeur 125 %. */
  wide?: boolean;
  italic?: boolean;
}

/** Largeur d'un texte, espacement des lettres compris. */
export type Measure = (text: string, font: FontSpec) => number;

/** Remplissage spécial : dégradé or poli (records). */
export const GOLD_GRADIENT = "gold-gradient";
/** Arrêts du dégradé or poli (maquette « Partage de séance »), diagonale 135°. */
export const GOLD_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, "#8A6A2C"], [0.45, "#E9CF8A"], [0.7, "#C9A14A"], [1, "#9C7A34"],
];

export type DrawOp =
  | { t: "text"; x: number; y: number; text: string; font: FontSpec; color: string; align: "left" | "right" | "center" }
  | { t: "rect"; x: number; y: number; w: number; h: number; r: number; fill?: string; stroke?: string; lineWidth?: number }
  | { t: "check"; x: number; y: number; size: number; color: string };

export interface SharePalette {
  bg: string;
  s1: string;
  s2: string;
  tx: string;
  tx2: string;
  brd: string;
  /** Texte posé sur un aplat vif (obsidienne). */
  onAccent: string;
  gold: string;
}

export interface ShareLayout {
  ops: DrawOp[];
  /** Palier de densité retenu (0 = aéré, 4 = le plus serré). */
  level: number;
  /** Échelle uniforme du contenu (1 = aucune ; > 1 = séance courte agrandie ; < 1 = réduite). */
  scale: number;
  /** Lignes remplacées par « + N autres ». */
  hidden: number;
}

// ── Texte ────────────────────────────────────────────────────────────────────

const ELLIPSIS = "…";

/**
 * Une ligne qui tient dans `maxW` : la police rétrécit jusqu'à `minRatio` de sa
 * taille, puis le texte est coupé avec « … ».
 */
export function fitLine(text: string, font: FontSpec, maxW: number, measure: Measure, minRatio = 0.78): { text: string; font: FontSpec } {
  if (maxW <= 0) return { text: "", font };
  if (measure(text, font) <= maxW) return { text, font };
  const minSize = font.size * minRatio;
  let f = font;
  while (f.size - 0.5 >= minSize) {
    f = { ...f, size: Math.round((f.size - 0.5) * 10) / 10 };
    if (measure(text, f) <= maxW) return { text, font: f };
  }
  return { text: ellipsize(text, f, maxW, measure), font: f };
}

export function ellipsize(text: string, font: FontSpec, maxW: number, measure: Measure): string {
  if (measure(text, font) <= maxW) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const s = chars.slice(0, mid).join("").trimEnd() + ELLIPSIS;
    if (measure(s, font) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo === 0 ? (measure(ELLIPSIS, font) <= maxW ? ELLIPSIS : "") : chars.slice(0, lo).join("").trimEnd() + ELLIPSIS;
}

/** Retour à la ligne par mots (un mot trop long est coupé) ; la dernière ligne finit par « … » si besoin. */
export function wrapText(text: string, font: FontSpec, maxW: number, maxLines: number, measure: Measure): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const pushWord = (w: string) => {
    // Mot plus large que la ligne : coupé en morceaux.
    let rest = w;
    while (measure(rest, font) > maxW && Array.from(rest).length > 1) {
      const chars = Array.from(rest);
      let n = chars.length - 1;
      while (n > 1 && measure(chars.slice(0, n).join(""), font) > maxW) n--;
      lines.push(chars.slice(0, n).join(""));
      rest = chars.slice(n).join("");
    }
    return rest;
  };
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next, font) <= maxW) { line = next; continue; }
    if (line) lines.push(line);
    line = pushWord(w);
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] + " " + lines.slice(maxLines).join(" ");
  kept[maxLines - 1] = ellipsize(last, font, maxW, measure);
  return kept;
}

// ── Paliers de densité ──────────────────────────────────────────────────────

interface Density {
  gap: number;
  rowTitle: number;
  rowSub: number;
  rowPad: number;
  right: number;
  pill: number;
  pillPadY: number;
  stat: number;
  hero: number;
  profile: number;
  label: number;
  showSub: boolean;
  pills: boolean;
  quote: boolean;
  titleLines: number;
}

const LEVELS: Density[] = [
  { gap: 22, rowTitle: 19, rowSub: 14, rowPad: 11, right: 18.5, pill: 14, pillPadY: 4.5, stat: 36, hero: 78, profile: 150, label: 12.5, showSub: true, pills: true, quote: true, titleLines: 2 },
  { gap: 18, rowTitle: 18, rowSub: 13.5, rowPad: 9, right: 17.5, pill: 13.5, pillPadY: 4, stat: 33, hero: 72, profile: 130, label: 12.5, showSub: true, pills: true, quote: true, titleLines: 2 },
  { gap: 15, rowTitle: 17, rowSub: 13, rowPad: 7.5, right: 16.5, pill: 13, pillPadY: 3.5, stat: 30, hero: 66, profile: 112, label: 12, showSub: true, pills: true, quote: true, titleLines: 2 },
  { gap: 12, rowTitle: 16, rowSub: 12.5, rowPad: 6, right: 15.5, pill: 12.5, pillPadY: 3, stat: 28, hero: 60, profile: 96, label: 12, showSub: true, pills: false, quote: false, titleLines: 1 },
  { gap: 10, rowTitle: 15, rowSub: 12, rowPad: 4.5, right: 14.5, pill: 12, pillPadY: 2.5, stat: 26, hero: 54, profile: 84, label: 11.5, showSub: false, pills: false, quote: false, titleLines: 1 },
];
export const LEVEL_COUNT = LEVELS.length;

const BADGE = 26;
const BADGE_GAP = 12;

const ui = (size: number, weight = 400, italic = false): FontSpec => ({ family: "ui", size, weight, italic });
const data = (size: number, spacing = 0): FontSpec => ({ family: "data", size, weight: 400, spacing });
const caps = (size: number, spacing = 1.8): FontSpec => ({ family: "data", size, weight: 400, spacing });

// ── Contenu ─────────────────────────────────────────────────────────────────

interface Box { ops: DrawOp[]; h: number }

function shift(ops: DrawOp[], dy: number): DrawOp[] {
  return ops.map((o) => ({ ...o, y: o.y + dy }));
}

function heroBox(card: ShareCard, d: Density, w: number, m: Measure, p: SharePalette): Box | null {
  const hero = card.hero;
  if (!hero) return null;
  const ops: DrawOp[] = [];
  let size = d.hero;
  const unit = hero.unit ? ` ${hero.unit}` : "";
  const caption = hero.caption ?? "";
  const capFont = data(14.5, 0.6);
  const capW = caption ? m(caption, capFont) + 16 : 0;
  const width = (s: number) => m(hero.value, data(s)) + (unit ? m(unit, data(s * 0.32)) : 0);
  const sideBySide = width(size) + capW <= w;
  while (width(size) > (sideBySide ? w - capW : w) && size > 28) size -= 1;
  const valueW = m(hero.value, data(size));
  const fitted = fitLine(hero.value, data(size), w, m);
  ops.push({ t: "text", x: 0, y: size * 0.86, text: fitted.text, font: fitted.font, color: p.tx, align: "left" });
  if (unit) ops.push({ t: "text", x: valueW, y: size * 0.86, text: unit, font: data(size * 0.32), color: p.tx2, align: "left" });
  let h = size * 0.92;
  if (caption) {
    const left = width(size) + 16;
    if (sideBySide && left + m(caption, capFont) <= w) {
      ops.push({ t: "text", x: left, y: size * 0.86, text: caption, font: capFont, color: p.tx2, align: "left" });
    } else {
      const c = fitLine(caption, capFont, w, m);
      ops.push({ t: "text", x: 0, y: h + 20, text: c.text, font: c.font, color: p.tx2, align: "left" });
      h += 26;
    }
  }
  return { ops, h };
}

function statsBox(card: ShareCard, d: Density, w: number, m: Measure, p: SharePalette): Box | null {
  const stats = card.stats.filter((s) => s.value);
  if (stats.length === 0) return null;
  const gap = 10;
  const n = stats.length;
  const bw = (w - gap * (n - 1)) / n;
  const pad = 14;
  const inner = bw - pad * 2;
  // Même taille de chiffre dans toutes les cases : celle qui tient dans la plus chargée.
  let size = d.stat;
  const width = (s: number, st: (typeof stats)[number]) => m(st.value, data(s)) + (st.unit ? m(st.unit, data(Math.max(12, s * 0.42))) : 0);
  while (size > 16 && stats.some((st) => width(size, st) > inner)) size -= 1;
  const labelFont = caps(11.5, 1.4);
  const h = pad + size * 0.9 + 12 + 12 + pad - 2;
  const ops: DrawOp[] = [];
  stats.forEach((st, i) => {
    const x = i * (bw + gap);
    ops.push({ t: "rect", x, y: 0, w: bw, h, r: 14, fill: p.s1, stroke: p.brd, lineWidth: 1 });
    const v = fitLine(st.value, data(size), inner, m);
    const vw = m(v.text, v.font);
    ops.push({ t: "text", x: x + pad, y: pad + size * 0.82, text: v.text, font: v.font, color: st.color ?? p.tx, align: "left" });
    if (st.unit) {
      const uf = data(Math.max(12, size * 0.42));
      const u = fitLine(st.unit, uf, Math.max(0, inner - vw), m, 1);
      if (u.text) ops.push({ t: "text", x: x + pad + vw, y: pad + size * 0.82, text: u.text, font: u.font, color: p.tx2, align: "left" });
    }
    const l = fitLine(st.label.toLocaleUpperCase("fr-FR"), labelFont, inner, m);
    ops.push({ t: "text", x: x + pad, y: h - pad + 1, text: l.text, font: l.font, color: p.tx2, align: "left" });
  });
  return { ops, h };
}

function sectionHeader(label: string | null | undefined, right: string | null | undefined, accent: string, d: Density, w: number, m: Measure, p: SharePalette): Box | null {
  if (!label && !right) return null;
  const f = caps(d.label, 1.8);
  const ops: DrawOp[] = [];
  const rightW = right ? Math.min(m(right, data(d.label, 0.6)), w * 0.45) : 0;
  if (label) {
    const l = fitLine(label.toLocaleUpperCase("fr-FR"), f, w - rightW - (right ? 12 : 0), m);
    ops.push({ t: "text", x: 0, y: d.label, text: l.text, font: l.font, color: p.tx2, align: "left" });
  }
  if (right) {
    const r = fitLine(right, data(d.label, 0.6), w * 0.45, m);
    ops.push({ t: "text", x: w, y: d.label, text: r.text, font: r.font, color: p.tx2, align: "right" });
  }
  const h = d.label + 8;
  ops.push({ t: "rect", x: 0, y: h, w, h: 1, r: 0, fill: p.brd });
  // Petit trait de la couleur du type sous le début du libellé.
  ops.push({ t: "rect", x: 0, y: h - 0.5, w: 22, h: 2, r: 0, fill: accent });
  return { ops, h: h + 1 };
}

function badgeOps(b: NonNullable<ShareRow["badge"]>, y: number, p: SharePalette): DrawOp[] {
  const c = BADGE / 2;
  switch (b.shape) {
    case "chip": {
      const ops: DrawOp[] = [{ t: "rect", x: 0, y, w: BADGE, h: BADGE, r: 7, fill: b.color }];
      if (b.text) {
        const size = b.text.length > 2 ? 10.5 : 13;
        ops.push({ t: "text", x: c, y: y + c + size * 0.36, text: b.text.slice(0, 3), font: { family: "data", size, weight: 500 }, color: p.onAccent, align: "center" });
      }
      return ops;
    }
    case "dot":
      return [{ t: "rect", x: 7, y: y + 7, w: 12, h: 12, r: 3, fill: b.color }];
    case "ring":
      return [{ t: "rect", x: 7, y: y + 7, w: 12, h: 12, r: 6, stroke: b.color, lineWidth: 1.8 }];
    case "check":
      return [
        { t: "rect", x: 2, y: y + 2, w: BADGE - 4, h: BADGE - 4, r: (BADGE - 4) / 2, fill: b.color },
        { t: "check", x: c, y: y + c, size: 10, color: p.onAccent },
      ];
    case "miss":
      return [{ t: "rect", x: 2, y: y + 2, w: BADGE - 4, h: BADGE - 4, r: (BADGE - 4) / 2, stroke: b.color, lineWidth: 1.5 }];
  }
}

function rowBox(row: ShareRow, d: Density, w: number, m: Measure, p: SharePalette, last: boolean): Box {
  const ops: DrawOp[] = [];
  const x0 = row.badge ? BADGE + BADGE_GAP : 0;
  const tx = row.dim ? p.tx2 : p.tx;
  // Colonne de droite : au plus 42 % de la largeur.
  const rightFont = data(d.right);
  const rightSubFont = data(Math.max(11.5, d.right * 0.72));
  const rightW = Math.min(
    w * 0.42,
    Math.max(row.right ? m(row.right, rightFont) : 0, row.rightSub ? m(row.rightSub, rightSubFont) : 0),
  );
  const textW = w - x0 - (rightW > 0 ? rightW + 14 : 0);
  let y = d.rowPad;
  // Titre (+ badge Record à droite du titre).
  const titleFont = ui(d.rowTitle, 500);
  const tagFont = caps(10.5, 1.3);
  const tagW = row.tag ? m(row.tag.toLocaleUpperCase("fr-FR"), tagFont) + 16 : 0;
  const titleLines = wrapText(row.title, titleFont, Math.max(40, textW - (tagW ? tagW + 8 : 0)), d.titleLines, m);
  const lineH = d.rowTitle * 1.22;
  titleLines.forEach((line, i) => {
    ops.push({ t: "text", x: x0, y: y + d.rowTitle * 0.95 + i * lineH, text: line, font: titleFont, color: tx, align: "left" });
  });
  if (row.tag && tagW <= textW) {
    const lw = m(titleLines[0] ?? "", titleFont);
    const tx0 = Math.min(x0 + lw + 8, x0 + textW - tagW);
    const th = 10.5 + 9;
    const ty = y + (d.rowTitle * 1.1 - th) / 2;
    ops.push({ t: "rect", x: tx0, y: ty, w: tagW, h: th, r: th / 2, fill: GOLD_GRADIENT });
    ops.push({ t: "text", x: tx0 + tagW / 2, y: ty + th / 2 + 3.8, text: row.tag.toLocaleUpperCase("fr-FR"), font: tagFont, color: p.onAccent, align: "center" });
  }
  y += lineH * titleLines.length - (lineH - d.rowTitle * 1.1);
  // Sous-ligne.
  if (row.sub && d.showSub) {
    const s = fitLine(row.sub, ui(d.rowSub), textW, m);
    y += 3;
    ops.push({ t: "text", x: x0, y: y + d.rowSub * 0.95, text: s.text, font: s.font, color: p.tx2, align: "left" });
    y += d.rowSub * 1.25;
  }
  // Séries faites : pastilles (sur autant de lignes qu'il faut) ou résumé.
  if (row.pills?.length) {
    y += 7;
    if (d.pills) {
      const pf = data(d.pill);
      const ph = d.pill + d.pillPadY * 2 + 2;
      let px = 0;
      let line = 0;
      for (const pill of row.pills) {
        const t = fitLine(pill.text, pf, textW - 16, m);
        const pw = m(t.text, t.font) + 16;
        if (px > 0 && px + pw > textW) { px = 0; line += 1; }
        const py = y + line * (ph + 6);
        ops.push({ t: "rect", x: x0 + px, y: py, w: pw, h: ph, r: 7, fill: pill.strong ? p.gold : p.s2 });
        ops.push({ t: "text", x: x0 + px + 8, y: py + ph / 2 + d.pill * 0.35, text: t.text, font: t.font, color: pill.strong ? p.onAccent : p.tx, align: "left" });
        px += pw + 6;
      }
      y += (line + 1) * ph + line * 6;
    } else {
      const summary = row.pillsSummary ?? row.pills.map((x) => x.text).join(" · ");
      const lines = wrapText(summary, data(d.pill), textW, 2, m);
      lines.forEach((l, i) => ops.push({ t: "text", x: x0, y: y + d.pill + i * d.pill * 1.35, text: l, font: data(d.pill), color: p.tx2, align: "left" }));
      y += lines.length * d.pill * 1.35;
    }
  }
  // Barre de proportion (segments HYROX).
  if (row.bar) {
    y += 7;
    ops.push({ t: "rect", x: x0, y, w: textW, h: 4, r: 2, fill: p.brd });
    ops.push({ t: "rect", x: x0, y, w: Math.max(4, textW * Math.max(0, Math.min(1, row.bar.value))), h: 4, r: 2, fill: row.bar.color });
    y += 4;
  }
  const textBottom = y;
  // Colonne de droite.
  let rightBottom = d.rowPad;
  if (row.right) {
    const r = fitLine(row.right, rightFont, rightW, m);
    ops.push({ t: "text", x: w, y: d.rowPad + d.rowTitle * 0.95, text: r.text, font: r.font, color: tx, align: "right" });
    rightBottom = d.rowPad + d.rowTitle * 1.1;
  }
  if (row.rightSub) {
    const r = fitLine(row.rightSub, rightSubFont, rightW, m);
    const yy = rightBottom + 3 + rightSubFont.size;
    ops.push({ t: "text", x: w, y: yy, text: r.text, font: r.font, color: row.rightSubColor ?? p.tx2, align: "right" });
    rightBottom = yy + 3;
  }
  if (row.badge) ops.push(...badgeOps(row.badge, d.rowPad + (d.rowTitle * 1.1 - BADGE) / 2, p));
  const h = Math.max(textBottom, rightBottom, d.rowPad + BADGE * (row.badge ? 1 : 0)) + d.rowPad;
  if (!last) ops.push({ t: "rect", x: 0, y: h - 0.5, w, h: 1, r: 0, fill: p.brd });
  return { ops, h };
}

function profileBox(s: Extract<ShareSection, { type: "profile" }>, accent: string, d: Density, w: number, m: Measure, p: SharePalette): Box {
  const ops: DrawOp[] = [];
  const pad = 14;
  const inner = w - pad * 2;
  const head = sectionHeaderInline(s.label, s.right ?? null, d, inner, m, p);
  let y = pad;
  ops.push(...shift(head.ops.map((o) => ({ ...o, x: o.x + pad })), y));
  y += head.h + 10;
  const total = s.bars.reduce((a, b) => a + Math.max(0, b.width), 0) || 1;
  const labelFont = data(11.5);
  const labelSpace = s.bars.some((b) => b.label) ? 18 : 0;
  const H = d.profile;
  let x = pad;
  let lastLabelRight = -Infinity;
  const base = y + labelSpace + H;
  s.bars.forEach((b: ProfileBarSpec) => {
    const bw = (Math.max(0, b.width) / total) * inner;
    const bh = Math.max(6, Math.min(1, Math.max(0, b.height)) * H);
    ops.push({ t: "rect", x: x + 1, y: base - bh, w: Math.max(1, bw - 2), h: bh, r: Math.min(3, bw / 3), fill: b.color });
    if (b.label) {
      const lw = m(b.label, labelFont);
      const cx = x + bw / 2;
      const left = Math.max(pad, Math.min(cx - lw / 2, pad + inner - lw));
      if (left > lastLabelRight + 3) {
        ops.push({ t: "text", x: left, y: base - bh - 6, text: b.label, font: labelFont, color: p.tx, align: "left" });
        lastLabelRight = left + lw;
      }
    }
    x += bw;
  });
  y = base;
  if (s.axis) {
    const af = data(11.5);
    const [a, b, c] = s.axis;
    y += 16;
    ops.push({ t: "text", x: pad, y, text: a, font: af, color: p.tx2, align: "left" });
    ops.push({ t: "text", x: pad + inner / 2, y, text: b, font: af, color: p.tx2, align: "center" });
    ops.push({ t: "text", x: pad + inner, y, text: c, font: af, color: p.tx2, align: "right" });
  }
  const h = y + pad - 2;
  ops.unshift({ t: "rect", x: 0, y: 0, w, h, r: 14, fill: p.s1, stroke: p.brd, lineWidth: 1 });
  void accent;
  return { ops, h };
}

/** Libellé + texte à droite sans filet (dans une carte). */
function sectionHeaderInline(label: string, right: string | null, d: Density, w: number, m: Measure, p: SharePalette): Box {
  const ops: DrawOp[] = [];
  const rf = data(d.label, 0.4);
  const rw = right ? Math.min(m(right, rf), w * 0.45) : 0;
  const l = fitLine(label.toLocaleUpperCase("fr-FR"), caps(d.label, 1.8), w - (rw ? rw + 12 : 0), m);
  ops.push({ t: "text", x: 0, y: d.label, text: l.text, font: l.font, color: p.tx2, align: "left" });
  if (right) {
    const r = fitLine(right, rf, w * 0.45, m);
    ops.push({ t: "text", x: w, y: d.label, text: r.text, font: r.font, color: p.tx2, align: "right" });
  }
  return { ops, h: d.label + 2 };
}

function zonesBox(s: Extract<ShareSection, { type: "zones" }>, d: Density, w: number, m: Measure, p: SharePalette): Box {
  const ops: DrawOp[] = [];
  const head = sectionHeaderInline(s.label, null, d, w, m, p);
  ops.push(...head.ops);
  let y = head.h + 10;
  const zones = s.zones.filter((z) => z.share > 0 || s.zones.length <= 7);
  const total = zones.reduce((a, z) => a + Math.max(0, z.share), 0) || 1;
  const gap = 2;
  const usable = w - gap * Math.max(0, zones.filter((z) => z.share > 0).length - 1);
  let x = 0;
  ops.push({ t: "rect", x: 0, y, w, h: 14, r: 7, fill: p.s2 });
  zones.forEach((z) => {
    if (z.share <= 0) return;
    const zw = (z.share / total) * usable;
    ops.push({ t: "rect", x, y, w: Math.max(1, zw), h: 14, r: 3, fill: z.color });
    x += zw + gap;
  });
  y += 14 + 10;
  const col = w / zones.length;
  const lf = caps(11, 1);
  const vf = data(15.5);
  zones.forEach((z, i) => {
    const cx = i * col;
    const l = fitLine(z.label, lf, col - 4, m);
    ops.push({ t: "text", x: cx, y: y + 11, text: l.text, font: l.font, color: z.color, align: "left" });
    const v = fitLine(z.value, vf, col - 4, m, 0.7);
    ops.push({ t: "text", x: cx, y: y + 11 + 20, text: v.text, font: v.font, color: p.tx, align: "left" });
  });
  return { ops, h: y + 11 + 22 };
}

function noteBox(s: Extract<ShareSection, { type: "note" }>, accent: string, d: Density, w: number, m: Measure, p: SharePalette): Box {
  const pad = 14;
  const lf = caps(d.label, 1.6);
  const label = fitLine(s.label.toLocaleUpperCase("fr-FR"), lf, w * 0.32, m);
  const lw = m(label.text, label.font) + 14;
  const tf = ui(Math.max(13, d.rowSub + 1));
  const lines = wrapText(s.text, tf, w - pad * 2 - lw, d.showSub ? 2 : 1, m);
  const lineH = tf.size * 1.4;
  const h = pad * 2 + Math.max(lines.length * lineH - (lineH - tf.size * 1.1), d.label);
  const ops: DrawOp[] = [
    { t: "rect", x: 0, y: 0, w, h, r: 14, fill: p.s1, stroke: p.brd, lineWidth: 1 },
    { t: "text", x: pad, y: pad + tf.size * 0.92, text: label.text, font: label.font, color: accent, align: "left" },
  ];
  lines.forEach((l, i) => ops.push({ t: "text", x: pad + lw, y: pad + tf.size * 0.92 + i * lineH, text: l, font: tf, color: p.tx2, align: "left" }));
  return { ops, h };
}

function quoteBox(text: string, d: Density, w: number, m: Measure, p: SharePalette): Box {
  const f = ui(15.5, 400, true);
  const lines = wrapText(`« ${text.trim()} »`, f, w, 2, m);
  const lineH = 15.5 * 1.42;
  return {
    ops: lines.map((l, i) => ({ t: "text" as const, x: 0, y: 15.5 * 0.95 + i * lineH, text: l, font: f, color: p.tx, align: "left" as const })),
    h: lines.length * lineH,
  };
}

/** Contenu complet à un palier donné, largeur `w`, origine (0, 0). */
function layoutContent(card: ShareCard, level: number, w: number, m: Measure, p: SharePalette): Box {
  const d = LEVELS[Math.max(0, Math.min(LEVEL_COUNT - 1, level))];
  const boxes: Box[] = [];
  const hero = heroBox(card, d, w, m, p);
  if (hero) boxes.push(hero);
  const stats = statsBox(card, d, w, m, p);
  if (stats) boxes.push(stats);
  for (const s of card.sections) {
    if (s.type === "rows") {
      if (s.rows.length === 0) continue;
      const ops: DrawOp[] = [];
      let y = 0;
      const head = sectionHeader(s.label, s.right, card.accent, d, w, m, p);
      if (head) { ops.push(...head.ops); y += head.h; }
      s.rows.forEach((r, i) => {
        const b = rowBox(r, d, w, m, p, i === s.rows.length - 1);
        ops.push(...shift(b.ops, y));
        y += b.h;
      });
      boxes.push({ ops, h: y });
    } else if (s.type === "note") {
      boxes.push(noteBox(s, card.accent, d, w, m, p));
    } else if (s.type === "profile") {
      if (s.bars.length) boxes.push(profileBox(s, card.accent, d, w, m, p));
    } else if (s.type === "zones") {
      if (s.zones.some((z) => z.share > 0)) boxes.push(zonesBox(s, d, w, m, p));
    }
  }
  if (card.quote?.trim() && d.quote) boxes.push(quoteBox(card.quote, d, w, m, p));
  const ops: DrawOp[] = [];
  let y = 0;
  boxes.forEach((b, i) => {
    if (i > 0) y += d.gap;
    ops.push(...shift(b.ops, y));
    y += b.h;
  });
  return { ops, h: y };
}

// ── En-tête et pied ─────────────────────────────────────────────────────────

/**
 * Bandeau objectif (maquette du 25/11, validée) : pastille « J-180 » de la
 * couleur du type, « OBJECTIF » puis le nom de la compétition, la date à
 * droite, un filet dessous. Nom et date mesurés : rien ne déborde.
 */
function objectiveOps(o: NonNullable<ShareCard["objective"]>, accent: string, w: number, m: Measure, p: SharePalette): { ops: DrawOp[]; bottom: number } {
  const ops: DrawOp[] = [];
  const y0 = BAND + 22;
  const h = 36;
  const pf = data(19, 0);
  const pill = fitLine(o.countdown.toLocaleUpperCase("fr-FR"), { ...pf, weight: 500 }, w * 0.34, m);
  const pillW = m(pill.text, pill.font) + 24;
  ops.push({ t: "rect", x: PAD, y: y0, w: pillW, h, r: 10, fill: accent });
  ops.push({ t: "text", x: PAD + pillW / 2, y: y0 + h / 2 + pill.font.size * 0.36, text: pill.text, font: pill.font, color: p.onAccent, align: "center" });
  const df = caps(13, 1.5);
  const dateText = o.date ? o.date.toLocaleUpperCase("fr-FR") : "";
  const date = dateText ? fitLine(dateText, df, w * 0.3, m) : null;
  const dateW = date ? m(date.text, date.font) : 0;
  if (date) ops.push({ t: "text", x: CARD_W - PAD, y: y0 + h / 2 + 4.5, text: date.text, font: date.font, color: p.tx2, align: "right" });
  const tx0 = PAD + pillW + 14;
  const textW = Math.max(40, w - pillW - 14 - (dateW ? dateW + 14 : 0));
  const lf = caps(11.5, 2);
  ops.push({ t: "text", x: tx0, y: y0 + 13, text: fitLine("OBJECTIF", lf, textW, m).text, font: lf, color: p.tx2, align: "left" });
  const name = fitLine(o.name.toLocaleUpperCase("fr-FR"), caps(16, 1.4), textW, m);
  ops.push({ t: "text", x: tx0, y: y0 + h - 1, text: name.text, font: name.font, color: p.tx, align: "left" });
  const bottom = y0 + h + 14;
  ops.push({ t: "rect", x: PAD, y: bottom, w, h: 1, r: 0, fill: p.brd });
  return { ops, bottom };
}

function headerOps(card: ShareCard, m: Measure, p: SharePalette): Box {
  const w = CARD_W - PAD * 2;
  const ops: DrawOp[] = [{ t: "rect", x: 0, y: 0, w: CARD_W, h: BAND, r: 0, fill: card.accent }];
  const kf = caps(13, 2.2);
  let kickerY = BAND + 40;
  if (card.objective) {
    const o = objectiveOps(card.objective, card.accent, w, m, p);
    ops.push(...o.ops);
    kickerY = o.bottom + 34;
  }
  const whoText = card.who?.toLocaleUpperCase("fr-FR") ?? "";
  const whoW = whoText ? Math.min(m(whoText, kf), w * 0.42) : 0;
  const k = fitLine(card.kicker.toLocaleUpperCase("fr-FR"), kf, w - (whoW ? whoW + 14 : 0), m);
  ops.push({ t: "text", x: PAD, y: kickerY, text: k.text, font: k.font, color: card.accent, align: "left" });
  if (whoText) {
    const wf = fitLine(whoText, kf, w * 0.42, m);
    ops.push({ t: "text", x: CARD_W - PAD, y: kickerY, text: wf.text, font: wf.font, color: p.tx2, align: "right" });
  }
  // Titre : la plus grande taille qui tient sur 3 lignes au plus.
  const title = card.title.toLocaleUpperCase("fr-FR");
  let size = 40;
  let lines: string[] = [];
  const tf = (s: number): FontSpec => ({ family: "display", size: s, weight: 500, wide: true, spacing: s * 0.03 });
  for (; size >= 24; size -= 2) {
    lines = wrapText(title, tf(size), w, 99, m);
    if (lines.length <= (size >= 34 ? 2 : 3)) break;
  }
  if (size < 24) size = 24;
  lines = wrapText(title, tf(size), w, 3, m);
  const lineH = size * 1.08;
  let y = kickerY + 18;
  lines.forEach((l, i) => ops.push({ t: "text", x: PAD, y: y + size * 0.9 + i * lineH, text: l, font: tf(size), color: p.tx, align: "left" }));
  y += size * 0.9 + (lines.length - 1) * lineH + 6;
  if (card.meta) {
    const mf = data(14.5, 0.6);
    const mt = fitLine(card.meta, mf, w, m);
    y += 22;
    ops.push({ t: "text", x: PAD, y, text: mt.text, font: mt.font, color: p.tx2, align: "left" });
  }
  return { ops, h: y + 6 };
}

const FOOTER_BASE = CARD_H - 32;

function footerOps(card: ShareCard, m: Measure, p: SharePalette): Box {
  const w = CARD_W - PAD * 2;
  const ops: DrawOp[] = [];
  const f = caps(13, 1.6);
  const rightText = card.footerRight?.toLocaleUpperCase("fr-FR") ?? "";
  const rightW = rightText ? Math.min(m(rightText, f), w * 0.4) : 0;
  if (card.coach) {
    const avail = w - (rightW ? rightW + 16 : 0);
    const prefix = "PROGRAMMÉ PAR ";
    const name = card.coach.toLocaleUpperCase("fr-FR");
    const full = fitLine(prefix + name, f, avail, m);
    // Deux couleurs : préfixe discret, nom du coach en blanc.
    const pw = m(prefix, full.font);
    if (full.text === prefix + name) {
      ops.push({ t: "text", x: PAD, y: FOOTER_BASE, text: prefix, font: full.font, color: p.tx2, align: "left" });
      ops.push({ t: "text", x: PAD + pw, y: FOOTER_BASE, text: name, font: full.font, color: p.tx, align: "left" });
    } else {
      ops.push({ t: "text", x: PAD, y: FOOTER_BASE, text: full.text, font: full.font, color: p.tx2, align: "left" });
    }
  }
  if (rightText) {
    const r = fitLine(rightText, f, w * 0.4, m);
    ops.push({ t: "text", x: CARD_W - PAD, y: FOOTER_BASE, text: r.text, font: r.font, color: p.tx2, align: "right" });
  }
  return { ops, h: 13 };
}

// ── Assemblage ──────────────────────────────────────────────────────────────

function scaleOps(ops: DrawOp[], s: number, ox: number, oy: number): DrawOp[] {
  return ops.map((o) => {
    if (o.t === "text") return { ...o, x: ox + o.x * s, y: oy + o.y * s, font: { ...o.font, size: o.font.size * s, spacing: (o.font.spacing ?? 0) * s } };
    if (o.t === "rect") return { ...o, x: ox + o.x * s, y: oy + o.y * s, w: o.w * s, h: o.h * s, r: o.r * s, lineWidth: o.lineWidth };
    return { ...o, x: ox + o.x * s, y: oy + o.y * s, size: o.size * s };
  });
}

/** Retire les dernières lignes de la plus longue section (≥ 3 lignes), remplacées par « + N autres ». */
function truncateOnce(card: ShareCard): { card: ShareCard; removed: number } | null {
  let best = -1;
  let bestLen = 2;
  card.sections.forEach((s, i) => {
    if (s.type === "rows") {
      const real = s.rows.filter((r) => !r.title.startsWith("+ ")).length;
      if (real > bestLen) { best = i; bestLen = real; }
    }
  });
  if (best < 0) return null;
  const s = card.sections[best] as Extract<ShareSection, { type: "rows" }>;
  const more = s.rows[s.rows.length - 1]?.title.startsWith("+ ") ? s.rows[s.rows.length - 1] : null;
  const already = more ? Number(/\d+/.exec(more.title)?.[0] ?? 0) : 0;
  const real = more ? s.rows.slice(0, -1) : s.rows;
  const kept = real.slice(0, -1);
  const n = already + 1;
  const rows: ShareRow[] = [...kept, { title: `+ ${n} ${n > 1 ? "autres" : "autre"}`, dim: true }];
  const sections = card.sections.slice();
  sections[best] = { ...s, rows };
  return { card: { ...card, sections }, removed: 1 };
}

/** Met en page toute la carte : tout tient dans 540 × 960. */
export function layoutShareCard(card: ShareCard, m: Measure, p: SharePalette): ShareLayout {
  const head = headerOps(card, m, p);
  const foot = footerOps(card, m, p);
  const top = head.h + 24;
  const bottom = FOOTER_BASE - 13 - 24;
  const avail = Math.max(40, bottom - top);
  const w = CARD_W - PAD * 2;
  const bg: DrawOp = { t: "rect", x: 0, y: 0, w: CARD_W, h: CARD_H, r: 0, fill: p.bg };
  const finish = (content: Box, level: number, scale: number, hidden: number): ShareLayout => ({
    ops: [bg, ...head.ops, ...scaleOps(content.ops, scale, PAD, top), ...foot.ops],
    level,
    scale,
    hidden,
  });

  for (let l = 0; l < LEVEL_COUNT; l++) {
    const c = layoutContent(card, l, w, m, p);
    if (c.h > avail) continue;
    // Séance courte : le contenu grandit (jusqu'à × 1,25) au lieu de laisser un trou sous la liste.
    // Mise en page refaite à la largeur réduite : les textes restent mesurés, rien ne déborde.
    if (l === 0 && c.h < avail * 0.85) {
      for (const s of [1.25, 1.2, 1.15, 1.1]) {
        const big = layoutContent(card, 0, w / s, m, p);
        if (big.h * s <= avail * 0.92) return finish(big, 0, s, 0);
      }
    }
    return finish(c, l, 1, 0);
  }
  const last = LEVEL_COUNT - 1;
  for (let s = 0.95; s >= 0.6 - 1e-9; s -= 0.05) {
    const c = layoutContent(card, last, w / s, m, p);
    if (c.h * s <= avail) return finish(c, last, s, 0);
  }
  // Dernier recours : « + N autres ».
  let cur = card;
  let hidden = 0;
  for (let guard = 0; guard < 400; guard++) {
    const t = truncateOnce(cur);
    if (!t) break;
    cur = t.card;
    hidden += t.removed;
    const c = layoutContent(cur, last, w / 0.6, m, p);
    if (c.h * 0.6 <= avail) return finish(c, last, 0.6, hidden);
  }
  // Impossible de faire tenir (cas absurde) : on garde l'en-tête et le pied, le contenu est coupé net.
  const c = layoutContent(cur, last, w / 0.6, m, p);
  const kept = c.ops.filter((o) => (o.t === "rect" ? o.y + o.h : o.y) * 0.6 <= avail);
  return finish({ ops: kept, h: avail / 0.6 }, last, 0.6, hidden);
}

/** Boîte occupée par une instruction (tests : tout doit rester dans le cadre). */
export function opBounds(o: DrawOp, m: Measure): { x0: number; y0: number; x1: number; y1: number } {
  if (o.t === "rect") return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
  if (o.t === "check") return { x0: o.x - o.size / 2, y0: o.y - o.size / 2, x1: o.x + o.size / 2, y1: o.y + o.size / 2 };
  const tw = m(o.text, o.font);
  const x0 = o.align === "left" ? o.x : o.align === "right" ? o.x - tw : o.x - tw / 2;
  return { x0, y0: o.y - o.font.size * 0.9, x1: x0 + tw, y1: o.y + o.font.size * 0.25 };
}
