/**
 * Carte douleur du wellness (2ᵉ corps, distinct des courbatures, 14/11) :
 * articulations et dos, plus quelques muscles. Même silhouette et même viewBox
 * (120 × 215) que la carte des courbatures (`bodyZones.ts`), zones différentes.
 * Une zone peut se voir de face et de dos (coude, poignet) : mêmes id, un seul
 * choix. Chaque zone reçoit une note 0-10.
 */
import type { PainLevels } from "@shared/domain/wellness";
import type { BodyRect, BodyView } from "@/lib/bodyZones";

export interface PainZone {
  id: string;
  label: string;
  view: BodyView;
  rects: BodyRect[];
}

const r = (x: number, y: number, w: number, h: number): BodyRect => ({ x, y, w, h });
const both = (y: number, w: number, h: number, xl: number): BodyRect[] => [r(xl, y, w, h), r(120 - xl - w, y, w, h)];

export const PAIN_ZONES: PainZone[] = [
  { id: "cou", label: "Cou", view: "face", rects: [r(53, 26, 14, 9)] },
  { id: "epaule", label: "Épaule", view: "face", rects: both(36, 19, 16, 22) },
  { id: "thorax", label: "Thorax / côtes", view: "face", rects: [r(43, 38, 34, 24)] },
  { id: "abdomen", label: "Abdomen", view: "face", rects: [r(46, 65, 28, 18)] },
  { id: "coude", label: "Coude", view: "face", rects: both(80, 14, 10, 13) },
  { id: "poignet_main", label: "Poignet / main", view: "face", rects: both(118, 13, 16, 10) },
  { id: "hanche", label: "Hanche / aine", view: "face", rects: both(86, 19, 12, 39) },
  { id: "cuisse", label: "Cuisse", view: "face", rects: both(101, 17, 44, 41) },
  { id: "genou", label: "Genou", view: "face", rects: both(148, 15, 14, 42) },
  { id: "tibia", label: "Tibia", view: "face", rects: both(165, 13, 28, 43) },
  { id: "cheville_pied", label: "Cheville / pied", view: "face", rects: both(196, 15, 15, 42) },
  { id: "nuque", label: "Nuque", view: "dos", rects: [r(53, 26, 14, 9)] },
  { id: "haut_dos", label: "Haut du dos", view: "dos", rects: [r(42, 37, 36, 26)] },
  { id: "coude", label: "Coude", view: "dos", rects: both(80, 14, 10, 13) },
  { id: "poignet_main", label: "Poignet / main", view: "dos", rects: both(118, 13, 16, 10) },
  { id: "lombaires", label: "Lombaires", view: "dos", rects: [r(45, 66, 30, 22)] },
  { id: "fessier", label: "Fessier", view: "dos", rects: both(91, 19, 20, 40) },
  { id: "ischios", label: "Ischios", view: "dos", rects: both(114, 17, 38, 41) },
  { id: "mollet", label: "Mollet", view: "dos", rects: both(156, 13, 36, 43) },
  { id: "achille", label: "Tendon d'Achille", view: "dos", rects: both(195, 13, 16, 43) },
];

/** Segments de bras sans zone (contour discret) : la silhouette reste lisible entre coude et poignet. */
export const PAIN_SILHOUETTE: BodyRect[] = [...both(55, 12, 23, 15), ...both(92, 11, 24, 11)];

/** Zones uniques, dans l'ordre de la carte (face puis dos). */
const UNIQUE = PAIN_ZONES.filter((z, i) => PAIN_ZONES.findIndex((x) => x.id === z.id) === i);

export function painZoneLabel(id: string): string {
  return UNIQUE.find((z) => z.id === id)?.label ?? id;
}

/** Repères affichés sous l'échelle 0-10 : 1-2 gêne, la douleur commence à 3 (Hugo, 15/11). */
export const PAIN_SCALE_MARKS: Array<{ at: number; label: string }> = [
  { at: 0, label: "aucune" },
  { at: 1, label: "gêne" },
  { at: 3, label: "douleur" },
  { at: 10, label: "insupportable" },
];

/**
 * Mot de chaque note 0-10, le même partout (carte douleur, blessures, fin de
 * séance). Hugo, 15/11 : 1 petite gêne, 2 gêne modérée, 3 douleur légère.
 */
export function painWord(n: number): string {
  if (n <= 0) return "aucune douleur";
  if (n === 1) return "petite gêne";
  if (n === 2) return "gêne modérée";
  if (n === 3) return "douleur légère";
  if (n <= 5) return "douleur modérée";
  if (n <= 7) return "douleur forte";
  if (n <= 9) return "douleur très forte";
  return "douleur insupportable";
}

export interface PainZoneNote {
  id: string;
  label: string;
  /** null : zone touchée, pas encore notée. */
  level: number | null;
}

/** Zones touchées (notées ou pas), dans l'ordre de la carte. */
export function painList(levels: Record<string, number | null> | null | undefined): PainZoneNote[] {
  if (!levels) return [];
  const known = UNIQUE.filter((z) => z.id in levels).map((z) => ({ id: z.id, label: z.label, level: levels[z.id] ?? null }));
  const other = Object.keys(levels).filter((k) => !UNIQUE.some((z) => z.id === k)).map((k) => ({ id: k, label: k, level: levels[k] ?? null }));
  return [...known, ...other];
}

/** Zones notées seulement (celles qu'on enregistre). */
export function notedPainLevels(levels: Record<string, number | null>): PainLevels {
  const out: PainLevels = {};
  for (const [k, v] of Object.entries(levels)) if (typeof v === "number") out[k] = v;
  return out;
}

/** « Genou 6/10, lombaires 3/10 » ; vide si aucune zone. */
export function painSummary(levels: PainLevels | null | undefined): string {
  return painList(levels)
    .filter((z) => z.level != null)
    .map((z, i) => `${i === 0 ? z.label : z.label.toLowerCase()} ${z.level}/10`)
    .join(", ");
}

/**
 * Douleur du matin pour le coach et le staff : « Douleur : genou 6/10,
 * lombaires 3/10 » avec la carte douleur, « Douleur 5/10 » pour une ancienne
 * saisie sans zone, null si pas de réponse.
 */
export function painText(pain: number | null | undefined, levels?: PainLevels | null): string | null {
  const s = painSummary(levels);
  if (s) return `Douleur : ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  return pain != null ? `Douleur ${pain}/10` : null;
}
