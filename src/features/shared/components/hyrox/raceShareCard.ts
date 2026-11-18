/**
 * Carte à partager d'une course HYROX (lot 6, maquette validée par Hugo le
 * 16/11/2026) : post 4:5 (1080 × 1350) ou story 9:16 (1080 × 1920), dessinée
 * sur l'appareil, rien n'est envoyé. Chrono, « top X % » de la catégorie,
 * radar des rangs par station, points forts, frein (toujours présent), objectif
 * du jour et source du classement (toujours présente). Nom, place et chrono
 * possible : au choix de l'athlète. Aucune donnée de montre.
 */
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { fmtClock } from "@/lib/seance";
import { topRange, type RaceVerdict } from "@/lib/hyrox/verdict";
import { C, alpha } from "@/lib/theme";
import { fmtGap } from "./raceAnalysisShared";

export type ShareFormat = "post" | "story";

export interface ShareCardInput {
  race: HyroxResult;
  verdict: RaceVerdict;
  format: ShareFormat;
  /** Nom affiché si non nul (case « Afficher mon nom », cochée par défaut, Q2). */
  athleteName: string | null;
  showPlace: boolean;
  showPossible: boolean;
}

/** Dimensions logiques (la maquette, à 50 %) ; l'image est dessinée × 2. */
export const SHARE_SIZE: Record<ShareFormat, { w: number; h: number }> = {
  post: { w: 540, h: 675 },
  story: { w: 540, h: 960 },
};
const SCALE = 2;

/** Couleurs de la carte : tokens de tokens.css (`C` contient des valeurs concrètes, utilisables par le canvas). */
function palette() {
  return {
    bg: C.bg,
    tx: C.tx,
    tx2: C.tx2,
    tx3: C.tx3,
    gold: C.ac,
    green: C.g,
    orange: C.o,
    grid: C.brdL,
    rule: C.brd,
    median: alpha(C.tx2, 0.55),
    fill: alpha(C.ac, 0.18),
  };
}

const DISPLAY = '"Archivo", system-ui, sans-serif';
const UI = '"Geist", system-ui, sans-serif';
const DATA = '"Geist Mono", ui-monospace, monospace';

/** Libellés courts du radar (ordre de `effortProfile`). */
const RADAR_LABEL: Record<string, string> = {
  run: "Course", ski: "SkiErg", sled_push: "Push", sled_pull: "Pull", bbj: "BBJ", row: "Rameur",
  farmers: "Farmers", lunges: "Fentes", wall_balls: "WB", roxzone: "Roxzone",
};

/** Charge les polices avant de dessiner (sinon le canvas prend la police système). */
export async function loadShareFonts(): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load(`700 60px ${DISPLAY}`), fonts.load(`500 15px ${DISPLAY}`),
      fonts.load(`400 15px ${UI}`), fonts.load(`400 20px ${DATA}`),
    ]);
  } catch {
    /* polices système */
  }
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string; fontStretch?: string };

function text(ctx: Ctx, s: string, x: number, y: number, o: { font: string; color: string; align?: CanvasTextAlign; spacing?: number; wide?: boolean }) {
  ctx.font = o.font;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${o.spacing ?? 0}px`;
  if ("fontStretch" in ctx) ctx.fontStretch = o.wide ? "expanded" : "normal";
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

/** Retour à la ligne simple (mots). */
function wrap(ctx: Ctx, s: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function radar(ctx: Ctx, verdict: RaceVerdict, cx: number, cy: number, r: number, labelSize: number, p: ReturnType<typeof palette>) {
  const axes = verdict.axes;
  const n = axes.length;
  if (n < 3) return;
  const pt = (i: number, v: number): [number, number] => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return [cx + (r * v * Math.cos(a)) / 100, cy + (r * v * Math.sin(a)) / 100];
  };
  const path = (vals: Array<number | null>) => {
    ctx.beginPath();
    let started = false;
    vals.forEach((v, i) => {
      if (v == null) return;
      const [x, y] = pt(i, v);
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    });
    ctx.closePath();
  };
  ctx.lineWidth = 1;
  ctx.strokeStyle = p.grid;
  for (const v of [100, 75, 25]) { path(axes.map(() => v)); ctx.stroke(); }
  axes.forEach((_, i) => { const [x, y] = pt(i, 100); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); });
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = p.median;
  ctx.lineWidth = 1.2;
  path(axes.map(() => 50));
  ctx.stroke();
  ctx.setLineDash([]);
  path(axes.map((a) => a.rankValue));
  ctx.fillStyle = p.fill;
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 116);
    const align: CanvasTextAlign = Math.abs(x - cx) < 4 ? "center" : x > cx ? "left" : "right";
    text(ctx, RADAR_LABEL[a.key] ?? a.label, x, y + labelSize / 3, { font: `400 ${labelSize}px ${UI}`, color: p.tx2, align });
  });
}

function eventLine(race: HyroxResult): string {
  const [y, m, d] = race.date.split("-");
  return `${race.event_name.toUpperCase()} · ${d}.${m}.${y}`;
}

function objectiveText(v: RaceVerdict): string | null {
  const o = v.objective;
  if (!o) return null;
  return o.deltaS === 0 ? "pile dans l'objectif" : o.deltaS < 0 ? `battu de ${fmtGap(o.deltaS)}` : `manqué de ${fmtGap(o.deltaS)}`;
}

function sourceText(v: RaceVerdict): string {
  const l = v.level;
  if (!l) return "Pas de classement de catégorie pour cette course.";
  const n = l.sampleSize != null ? `${l.sampleSize.toLocaleString("fr-FR")} courses ` : "";
  return `Rang sur ${n}${l.categoryLabel}${l.source ? `, ${l.source}` : ""}. Pointillés : la médiane.`;
}

function footer(ctx: Ctx, v: RaceVerdict, w: number, h: number, padX: number, bottom: number, size: number, p: ReturnType<typeof palette>) {
  const y = h - bottom;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, y - 3 * size);
  ctx.lineTo(w - padX, y - 3 * size);
  ctx.stroke();
  const brandW = text(ctx, "analysé par Agon", w - padX, y, { font: `400 ${size}px ${DATA}`, color: p.tx3, align: "right" });
  ctx.font = `400 ${size}px ${UI}`;
  const lines = wrap(ctx, sourceText(v), w - 2 * padX - brandW - 12);
  const lh = size * 1.4;
  lines.forEach((l, i) => text(ctx, l, padX, y - (lines.length - 1 - i) * lh, { font: `400 ${size}px ${UI}`, color: p.tx3 }));
}

function drawPost(ctx: Ctx, input: ShareCardInput, p: ReturnType<typeof palette>) {
  const { race, verdict: v } = input;
  const { w, h } = SHARE_SIZE.post;
  const pad = 34;
  ctx.textBaseline = "alphabetic";
  text(ctx, "AGON", pad, 32 + 15, { font: `500 15px ${DISPLAY}`, color: p.tx, spacing: 4.2, wide: true });
  text(ctx, eventLine(race), w - pad, 32 + 13, { font: `400 11px ${DATA}`, color: p.tx2, align: "right", spacing: 0.9 });

  const who = [input.athleteName, v.categoryLabel].filter(Boolean).join(" · ");
  text(ctx, who, pad, 92, { font: `400 15px ${UI}`, color: p.tx2 });
  text(ctx, fmtClock(race.total_s), pad - 3, 162, { font: `400 72px ${DATA}`, color: p.tx, spacing: -1.4 });
  if (input.showPlace && v.place) {
    text(ctx, "PLACE", w - pad, 132, { font: `400 10px ${DATA}`, color: p.tx3, align: "right", spacing: 1.6 });
    const ofW = text(ctx, ` / ${v.place.of.toLocaleString("fr-FR")}`, w - pad, 160, { font: `400 14px ${DATA}`, color: p.tx3, align: "right" });
    text(ctx, `${v.place.rank}ᵉ`, w - pad - ofW, 160, { font: `400 20px ${DATA}`, color: p.tx, align: "right" });
  }

  let y = 196;
  if (v.level) {
    const topW = text(ctx, `TOP ${v.level.topPct} %`, pad, y + 52, { font: `700 60px ${DISPLAY}`, color: p.gold, wide: true });
    const [a, ...rest] = `des ${v.level.categoryLabel}`.split(" ");
    text(ctx, `${a} ${rest.slice(0, -1).join(" ")}`.trim(), pad + topW + 12, y + 30, { font: `400 15px ${UI}`, color: p.tx });
    text(ctx, rest.slice(-1).join(""), pad + topW + 12, y + 49, { font: `400 15px ${UI}`, color: p.tx });
    y += 74;
  }

  // Radar à gauche, lecture à droite.
  const hasRadar = v.axes.some((a) => a.rankValue != null);
  if (hasRadar) radar(ctx, v, pad + 125, y + 120, 92, 10.5, p);
  const colX = hasRadar ? pad + 280 : pad;
  let cy = y + 30;
  const block = (label: string, color: string, value: string, sub: string | null) => {
    text(ctx, label.toUpperCase(), colX, cy, { font: `400 10px ${DATA}`, color, spacing: 1.6 });
    text(ctx, value, colX, cy + 21, { font: `400 14px ${UI}`, color: p.tx });
    if (sub) text(ctx, sub, colX, cy + 39, { font: `400 12px ${DATA}`, color });
    cy += sub ? 62 : 46;
  };
  const pr = v.profile;
  if (pr?.strengths.length) block(pr.strengths.length > 1 ? "Points forts" : "Point fort", p.green, pr.strengths.map((a) => a.label).join(", "), topRange(pr.strengths));
  if (pr?.brakes.length) block("Frein", p.orange, pr.brakes[0].label, `top ${pr.brakes[0].topPct} %`);
  const obj = objectiveText(v);
  if (obj && v.objective) {
    text(ctx, "OBJECTIF DU JOUR", colX, cy, { font: `400 10px ${DATA}`, color: p.tx3, spacing: 1.6 });
    text(ctx, obj, colX, cy + 21, { font: `400 14px ${DATA}`, color: v.objective.deltaS <= 0 ? p.green : p.orange });
    cy += 46;
  }
  if (input.showPossible && v.margin) {
    text(ctx, "POSSIBLE", colX, cy, { font: `400 10px ${DATA}`, color: p.tx3, spacing: 1.6 });
    text(ctx, `${fmtClock(v.margin.possibleS)} (−${fmtGap(v.margin.gainS)})`, colX, cy + 21, { font: `400 14px ${DATA}`, color: p.tx });
  }
  footer(ctx, v, w, h, pad, 26, 10, p);
}

function drawStory(ctx: Ctx, input: ShareCardInput, p: ReturnType<typeof palette>) {
  const { race, verdict: v } = input;
  const { w, h } = SHARE_SIZE.story;
  const pad = 40;
  text(ctx, "AGON", pad, 72 + 17, { font: `500 17px ${DISPLAY}`, color: p.tx, spacing: 4.8, wide: true });
  text(ctx, eventLine(race), w - pad, 72 + 14, { font: `400 12px ${DATA}`, color: p.tx2, align: "right", spacing: 1 });

  let y = 150;
  const who = [input.athleteName, v.categoryLabel].filter(Boolean).join(" · ");
  text(ctx, who, pad, y, { font: `400 17px ${UI}`, color: p.tx2 });
  text(ctx, fmtClock(race.total_s), pad - 4, y + 90, { font: `400 92px ${DATA}`, color: p.tx, spacing: -1.8 });
  y += 120;
  const parts: Array<{ s: string; c: string }> = [];
  if (input.showPlace && v.place) parts.push({ s: `${v.place.rank}ᵉ sur ${v.place.of.toLocaleString("fr-FR")}`, c: p.tx2 });
  const obj = objectiveText(v);
  if (obj && v.objective) {
    if (parts.length) parts.push({ s: " · ", c: p.tx2 });
    parts.push({ s: "objectif du jour ", c: p.tx2 }, { s: obj, c: v.objective.deltaS <= 0 ? p.green : p.orange });
  }
  let x = pad;
  for (const part of parts) x += text(ctx, part.s, x, y, { font: `400 15px ${DATA}`, color: part.c });
  y += 24;

  if (v.level) {
    text(ctx, `TOP ${v.level.topPct} %`, pad, y + 80, { font: `700 84px ${DISPLAY}`, color: p.gold, wide: true });
    text(ctx, `des ${v.level.categoryLabel}`, pad, y + 112, { font: `400 18px ${UI}`, color: p.tx });
    y += 130;
  }
  if (v.axes.some((a) => a.rankValue != null)) {
    radar(ctx, v, w / 2, y + 165, 130, 13, p);
    y += 335;
  }

  const pr = v.profile;
  const colW = (w - 2 * pad - 16) / 2;
  const col = (cx: number, label: string, color: string, value: string) => {
    text(ctx, label.toUpperCase(), cx, y, { font: `400 11px ${DATA}`, color, spacing: 1.8 });
    ctx.font = `400 16px ${UI}`;
    wrap(ctx, value, colW).slice(0, 2).forEach((l, i) => text(ctx, l, cx, y + 24 + i * 21, { font: `400 16px ${UI}`, color: p.tx }));
  };
  if (pr?.strengths.length) col(pad, `${pr.strengths.length > 1 ? "Points forts" : "Point fort"} · ${topRange(pr.strengths)}`, p.green, pr.strengths.map((a) => a.label).join(", "));
  if (pr?.brakes.length) col(pad + colW + 16, `Frein · top ${pr.brakes[0].topPct} %`, p.orange, pr.brakes[0].label);
  if (input.showPossible && v.margin) {
    // Sous le frein (une ligne), pour ne pas toucher le pied de carte.
    const px = pr ? pad + colW + 16 : pad;
    const py = pr ? y + 56 : y;
    text(ctx, "POSSIBLE", px, py, { font: `400 11px ${DATA}`, color: p.tx3, spacing: 1.8 });
    text(ctx, `${fmtClock(v.margin.possibleS)} (−${fmtGap(v.margin.gainS)})`, px, py + 24, { font: `400 16px ${DATA}`, color: p.tx });
  }
  footer(ctx, v, w, h, pad, 60, 11, p);
}

/** Dessine la carte sur le canvas (taille réelle : 1080 × 1350 ou 1080 × 1920). */
export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput): HTMLCanvasElement {
  const { w, h } = SHARE_SIZE[input.format];
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) return canvas;
  const p = palette();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  if (input.format === "post") drawPost(ctx, input, p); else drawStory(ctx, input, p);
  return canvas;
}

/** Image PNG de la carte. */
export function shareCardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
