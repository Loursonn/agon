/**
 * Zoom du graphique de la séance (« Modifier tours », demande d'Hugo du 16/11/2026) :
 * molette, pincement, sélection d'une plage, boutons + / −, glisser la vue d'ensemble.
 * Fenêtres en secondes depuis le départ ; `null` = toute la séance.
 */

export interface TimeWindow {
  startS: number;
  endS: number;
}

/** Plus petite fenêtre : 20 s (on place une limite à la seconde près). */
export const MIN_SPAN_S = 20;

const clampWindow = (startS: number, span: number, full: TimeWindow): TimeWindow | null => {
  const fullSpan = full.endS - full.startS;
  if (span >= fullSpan) return null;
  const s = Math.max(full.startS, Math.min(full.endS - span, startS));
  return { startS: s, endS: s + span };
};

/**
 * Zoom d'un facteur autour d'un instant : `factor` > 1 rapproche, < 1 éloigne.
 * L'instant visé reste sous le curseur / les doigts.
 */
export function zoomAround(current: TimeWindow | null, full: TimeWindow, factor: number, centerS: number, minSpan = MIN_SPAN_S): TimeWindow | null {
  if (!(factor > 0) || !(full.endS > full.startS)) return current;
  const w = current ?? full;
  const span = w.endS - w.startS;
  const next = Math.min(full.endS - full.startS, Math.max(minSpan, span / factor));
  const c = Math.min(w.endS, Math.max(w.startS, centerS));
  const ratio = span > 0 ? (c - w.startS) / span : 0.5;
  return clampWindow(c - ratio * next, next, full);
}

/** Décale la fenêtre de `deltaS` secondes, sans sortir de la séance. */
export function panWindow(current: TimeWindow | null, full: TimeWindow, deltaS: number): TimeWindow | null {
  if (!current) return null;
  return clampWindow(current.startS + deltaS, current.endS - current.startS, full);
}

/** Fenêtre centrée sur `centerS` (glisser la vue d'ensemble). */
export function centerWindow(current: TimeWindow | null, full: TimeWindow, centerS: number): TimeWindow | null {
  if (!current) return null;
  const span = current.endS - current.startS;
  return clampWindow(centerS - span / 2, span, full);
}

/** Plage sélectionnée à la souris (deux instants dans n'importe quel ordre). `null` si trop courte. */
export function windowFromSelection(aS: number, bS: number, full: TimeWindow, minSpan = MIN_SPAN_S): TimeWindow | null {
  const lo = Math.max(full.startS, Math.min(aS, bS));
  const hi = Math.min(full.endS, Math.max(aS, bS));
  if (hi - lo < 2) return null;
  if (hi - lo >= minSpan) return clampWindow(lo, hi - lo, full);
  return clampWindow((lo + hi) / 2 - minSpan / 2, minSpan, full);
}

/** Facteur de zoom d'un cran de molette (deltaY en pixels). */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-Math.max(-300, Math.min(300, deltaY)) * 0.0025);
}

/** « × 4 » : grossissement affiché. */
export function zoomLevel(current: TimeWindow | null, full: TimeWindow): number {
  if (!current) return 1;
  return Math.max(1, Math.round((full.endS - full.startS) / Math.max(1, current.endS - current.startS)));
}
