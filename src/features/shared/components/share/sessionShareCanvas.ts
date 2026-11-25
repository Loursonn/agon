/**
 * Dessin de la story « Partage de séance » sur un canvas (1080 × 1920).
 * La mise en page vient de `layoutShareCard` (pure, testée) : ici, on mesure
 * le texte avec les vraies polices et on exécute les opérations de dessin.
 * Rien n'est envoyé : l'image est créée sur le téléphone.
 */
import { C } from "@/lib/theme";
import type { ShareCard } from "@/lib/share/sessionShare";
import {
  CARD_H, CARD_W, GOLD_GRADIENT, GOLD_STOPS, layoutShareCard,
  type DrawOp, type FontSpec, type Measure, type ShareLayout, type SharePalette,
} from "@/lib/share/shareLayout";

const SCALE = 2;
const DISPLAY = '"Archivo", system-ui, sans-serif';
const UI = '"Geist", system-ui, sans-serif';
const DATA = '"Geist Mono", ui-monospace, monospace';

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string; fontStretch?: string };

export function sharePalette(): SharePalette {
  return { bg: C.bg, s1: C.s1, s2: C.s2, tx: C.tx, tx2: C.tx2, brd: C.brd, onAccent: C.ink, gold: C.ac };
}

function cssFont(f: FontSpec): string {
  const fam = f.family === "display" ? DISPLAY : f.family === "data" ? DATA : UI;
  return `${f.italic ? "italic " : ""}${f.weight} ${f.size}px ${fam}`;
}

function applyFont(ctx: Ctx, f: FontSpec) {
  ctx.font = cssFont(f);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${f.spacing ?? 0}px`;
  if ("fontStretch" in ctx) ctx.fontStretch = f.wide ? "expanded" : "normal";
}

/** Polices chargées une fois avant de dessiner (sinon le canvas prend la police système). */
let fontsReady: Promise<void> | null = null;
export function loadSessionShareFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts?.load) return Promise.resolve();
  fontsReady = Promise.all([
    fonts.load(`500 40px ${DISPLAY}`), fonts.load(`700 40px ${DISPLAY}`),
    fonts.load(`400 15px ${UI}`), fonts.load(`500 15px ${UI}`), fonts.load(`italic 400 15px ${UI}`),
    fonts.load(`400 15px ${DATA}`), fonts.load(`500 15px ${DATA}`),
  ]).then(() => undefined, () => undefined);
  return fontsReady;
}

/**
 * Mesure réelle. Si le navigateur ignore `letterSpacing` / `fontStretch`, on
 * corrige à la main (espacement ajouté, largeur × 1,25) pour rester pessimiste :
 * mieux vaut un texte un peu plus petit qu'un texte qui déborde.
 */
function makeMeasure(ctx: Ctx): Measure {
  const cache = new Map<string, number>();
  const nativeSpacing = "letterSpacing" in ctx;
  const nativeStretch = "fontStretch" in ctx;
  return (text, f) => {
    const key = `${cssFont(f)}|${f.spacing ?? 0}|${f.wide ? 1 : 0}|${text}`;
    const hit = cache.get(key);
    if (hit != null) return hit;
    applyFont(ctx, f);
    let w = ctx.measureText(text).width;
    if (!nativeStretch && f.wide) w *= 1.25;
    if (!nativeSpacing && f.spacing) w += f.spacing * Array.from(text).length;
    cache.set(key, w);
    return w;
  };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function goldFill(ctx: Ctx, x: number, y: number, w: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  for (const [at, color] of GOLD_STOPS) g.addColorStop(at, color);
  return g;
}

function drawOp(ctx: Ctx, o: DrawOp) {
  if (o.t === "rect") {
    if (o.w <= 0 || o.h <= 0) return;
    if (o.r > 0) roundRect(ctx, o.x, o.y, o.w, o.h, o.r);
    else { ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); }
    if (o.fill) {
      ctx.fillStyle = o.fill === GOLD_GRADIENT ? goldFill(ctx, o.x, o.y, o.w, o.h) : o.fill;
      ctx.fill();
    }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.lineWidth ?? 1;
      ctx.stroke();
    }
    return;
  }
  if (o.t === "check") {
    const s = o.size / 2;
    ctx.beginPath();
    ctx.moveTo(o.x - s * 0.8, o.y + s * 0.05);
    ctx.lineTo(o.x - s * 0.2, o.y + s * 0.6);
    ctx.lineTo(o.x + s * 0.85, o.y - s * 0.55);
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    return;
  }
  if (!o.text) return;
  applyFont(ctx, o.font);
  ctx.textAlign = o.align;
  ctx.fillStyle = o.color === GOLD_GRADIENT ? C.ac : o.color;
  ctx.fillText(o.text, o.x, o.y);
}

/** Dessine la carte ; renvoie la mise en page retenue (palier, réduction). */
export function drawSessionShare(canvas: HTMLCanvasElement, card: ShareCard): ShareLayout | null {
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) return null;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.textBaseline = "alphabetic";
  const p = sharePalette();
  const layout = layoutShareCard(card, makeMeasure(ctx), p);
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  // Garde-fou : rien ne peut être peint hors du cadre.
  ctx.beginPath();
  ctx.rect(0, 0, CARD_W, CARD_H);
  ctx.clip();
  for (const o of layout.ops) drawOp(ctx, o);
  ctx.restore();
  return layout;
}

export function sessionShareBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), "image/png"); } catch { resolve(null); }
  });
}

/** Nom de fichier lisible : « seance-2026-11-25.png ». */
export function shareFileName(day: string | null | undefined): string {
  const d = /^\d{4}-\d{2}-\d{2}/.exec(day ?? "")?.[0];
  return `seance${d ? `-${d}` : ""}.png`;
}
