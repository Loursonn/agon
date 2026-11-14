/**
 * Saisie du poids à la main (wellness du matin) : l'athlète tape une virgule
 * (« 72,4 »), le stockage garde un nombre (72.4). Le point est accepté aussi
 * (clavier anglais), et affiché en virgule.
 */

/** Ce qui s'affiche dans le champ : chiffres, une seule virgule, une décimale au plus. */
export function cleanWeightText(raw: string): string {
  const s = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const i = s.indexOf(",");
  if (i < 0) return s.slice(0, 3);
  const int = s.slice(0, i).slice(0, 3);
  const dec = s.slice(i + 1).replace(/,/g, "").slice(0, 1);
  return `${int},${dec}`;
}

/** Texte du champ → kg (nombre), ou null si vide / illisible / hors 20-400 kg. */
export function parseWeightText(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 20 || n > 400) return null;
  return Math.round(n * 10) / 10;
}

/** kg (nombre ou ancien texte à point) → texte du champ, avec virgule. */
export function weightToText(v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  return cleanWeightText(String(v));
}
