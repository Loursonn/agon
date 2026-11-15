/**
 * Taille de police qui fait tenir un texte sur une ligne dans sa zone
 * (chrono « 1:20:00 » dans l'anneau du minuteur, cible « 10:00–12:30/km »…).
 *
 * La largeur d'un texte est proportionnelle à sa taille de police : on mesure
 * une fois sa largeur à la taille de base, puis on réduit au prorata de la
 * place disponible. En dessous du plancher `min`, on garde `min` et on autorise
 * le retour à la ligne plutôt que de couper ou de déborder.
 */
export interface FitResult {
  /** Taille de police en px, arrondie au demi-pixel inférieur. */
  size: number;
  /** true quand même `min` ne tient pas : le texte doit pouvoir passer à la ligne. */
  wrap: boolean;
}

const ok = (v: number) => Number.isFinite(v) && v > 0;

export function fitFontSize({ base, min, naturalWidth, available }: {
  /** Taille voulue (px). */
  base: number;
  /** Plancher lisible (px). */
  min: number;
  /** Largeur du texte rendu à `base` (px). */
  naturalWidth: number;
  /** Largeur disponible (px). */
  available: number;
}): FitResult {
  const floor = Math.min(min, base);
  // Pas encore mesuré (premier rendu, élément caché) : on garde la taille de base.
  if (!ok(naturalWidth) || !ok(available)) return { size: base, wrap: false };
  if (naturalWidth <= available) return { size: base, wrap: false };
  const size = Math.floor(((base * available) / naturalWidth) * 2) / 2;
  if (size < floor) return { size: floor, wrap: true };
  return { size, wrap: false };
}
