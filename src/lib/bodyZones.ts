/**
 * Carte du corps du wellness (planche « Wellness athlète », 12/11) : zones
 * dessinées en rectangles, face et dos, viewBox 120 × 215. Une zone regroupe
 * les deux côtés (toucher un ischio note « Ischios »). Coordonnées copiées de
 * la planche.
 */
import type { DomsLevel, DomsLevels } from "@shared/domain/wellness";

export type BodyView = "face" | "dos";

export interface BodyRect { x: number; y: number; w: number; h: number }

export interface BodyZone {
  id: string;
  label: string;
  view: BodyView;
  rects: BodyRect[];
}

const r = (x: number, y: number, w: number, h: number): BodyRect => ({ x, y, w, h });

export const BODY_ZONES: BodyZone[] = [
  { id: "epaules", label: "Épaules", view: "face", rects: [r(22, 36, 19, 16), r(79, 36, 19, 16)] },
  { id: "pectoraux", label: "Pectoraux", view: "face", rects: [r(42, 38, 17, 19), r(61, 38, 17, 19)] },
  { id: "abdos", label: "Abdos", view: "face", rects: [r(46, 60, 28, 32)] },
  { id: "biceps", label: "Biceps", view: "face", rects: [r(15, 55, 12, 28), r(93, 55, 12, 28)] },
  { id: "avant_bras", label: "Avant-bras", view: "face", rects: [r(11, 87, 11, 30), r(98, 87, 11, 30)] },
  { id: "quadriceps", label: "Quadriceps", view: "face", rects: [r(40, 99, 18, 54), r(62, 99, 18, 54)] },
  { id: "tibias", label: "Tibias", view: "face", rects: [r(42, 160, 14, 44), r(64, 160, 14, 44)] },
  { id: "trapezes", label: "Trapèzes", view: "dos", rects: [r(44, 33, 32, 12)] },
  { id: "epaules_arr", label: "Arrière d'épaule", view: "dos", rects: [r(22, 36, 19, 16), r(79, 36, 19, 16)] },
  { id: "dorsaux", label: "Dorsaux", view: "dos", rects: [r(41, 47, 18, 31), r(61, 47, 18, 31)] },
  { id: "lombaires", label: "Lombaires", view: "dos", rects: [r(46, 80, 28, 14)] },
  { id: "triceps", label: "Triceps", view: "dos", rects: [r(15, 55, 12, 28), r(93, 55, 12, 28)] },
  { id: "avant_bras_arr", label: "Avant-bras (dos)", view: "dos", rects: [r(11, 87, 11, 30), r(98, 87, 11, 30)] },
  { id: "fessiers", label: "Fessiers", view: "dos", rects: [r(40, 97, 19, 22), r(61, 97, 19, 22)] },
  { id: "ischios", label: "Ischios", view: "dos", rects: [r(40, 122, 18, 36), r(62, 122, 18, 36)] },
  { id: "mollets", label: "Mollets", view: "dos", rects: [r(42, 163, 14, 40), r(64, 163, 14, 40)] },
];

/** 1 légère (or), 2 marquée (orange), 3 intense (rouge). */
export const DOMS_LEVEL_COLOR: Record<DomsLevel, string> = { 1: "#FFC933", 2: "#FF9500", 3: "#FF3B1F" };
export const DOMS_LEVEL_LABEL: Record<DomsLevel, string> = { 1: "Légère", 2: "Marquée", 3: "Intense" };

export function bodyZoneLabel(id: string): string {
  return BODY_ZONES.find((z) => z.id === id)?.label ?? id;
}

/** Zones notées, dans l'ordre de la carte (face puis dos). */
export function levelsList(levels: DomsLevels | null | undefined): Array<{ id: string; label: string; level: DomsLevel }> {
  if (!levels) return [];
  return BODY_ZONES.filter((z) => levels[z.id] != null).map((z) => ({ id: z.id, label: z.label, level: levels[z.id] }));
}

/** Touche une zone : non notée → légère ; sinon elle reste (le niveau se choisit en dessous). */
export function touchZone(levels: DomsLevels, id: string): DomsLevels {
  return levels[id] != null ? levels : { ...levels, [id]: 1 };
}

export function setZoneLevel(levels: DomsLevels, id: string, level: DomsLevel | null): DomsLevels {
  const next = { ...levels };
  if (level == null) delete next[id];
  else next[id] = level;
  return next;
}

/** Échelle de douleur 0 → 10, du vert au rouge (planche). */
export const PAIN_COLORS = ["#66F03C", "#8CF03C", "#B8F03C", "#E0EC3A", "#FFC933", "#FFB020", "#FF9500", "#FF7A45", "#FF5A33", "#FF4A28", "#FF3B1F"];
