/**
 * Catégories HYROX : solo / duo / relais, open / pro, hommes / femmes / mixte.
 *
 * - La catégorie de référence d'une course combine son format ET sa division :
 *   « Doubles » + « Men » se compare aux doubles hommes, pas au solo.
 * - En duo, les stations sont partagées entre les deux partenaires, et en
 *   relais chacun ne fait qu'une partie : leurs temps de station ne se
 *   comparent pas à un solo. Le chrono, lui, se compare par le rang : même
 *   position dans l'autre catégorie → chrono équivalent.
 *
 * Décisions d'Hugo du 15/11/2026 (sélecteur de catégorie + équivalences,
 * courbes séparées par format dans l'Évolution). Pur et testé.
 */
import { REFERENCE_DIVISION, type HyroxDivision, type HyroxResult } from "@/features/shared/types/hyrox";

export type RaceFormat = "solo" | "duo" | "relais";
export type CategorySex = "men" | "women" | "mixed";

/** Catégories de référence disponibles (données pyrox S7-S9). */
export const REFERENCE_CATEGORIES = [
  "men", "men_pro", "women", "women_pro",
  "doubles_men", "doubles_men_pro", "doubles_women", "doubles_women_pro", "doubles_mixed",
  "relay_men", "relay_women", "relay_mixed",
] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ReferenceCategory, string> = {
  men: "Hommes open", men_pro: "Hommes pro", women: "Femmes open", women_pro: "Femmes pro",
  doubles_men: "Duo hommes", doubles_men_pro: "Duo hommes pro", doubles_women: "Duo femmes",
  doubles_women_pro: "Duo femmes pro", doubles_mixed: "Duo mixte",
  relay_men: "Relais hommes", relay_women: "Relais femmes", relay_mixed: "Relais mixte",
};

export const RACE_FORMAT_LABEL: Record<RaceFormat, string> = { solo: "Solo", duo: "Duo", relais: "Relais" };

export function categoryFormat(cat: string): RaceFormat {
  if (cat.startsWith("doubles_")) return "duo";
  if (cat.startsWith("relay_")) return "relais";
  return "solo";
}

export function categorySex(cat: string): CategorySex {
  if (cat.endsWith("mixed")) return "mixed";
  return /(^|_)women/.test(cat) ? "women" : "men";
}

const isPro = (cat: string) => cat.endsWith("_pro");

/**
 * Catégorie de référence d'une course : la division, corrigée par le format
 * saisi (« Doubles » + « Men » → doubles hommes ; « Solo » + « Doubles
 * hommes » → hommes). Les simulations se comparent au solo.
 */
export function raceCategory(r: Pick<HyroxResult, "division" | "format">): ReferenceCategory {
  const base = REFERENCE_DIVISION(r.division as HyroxDivision);
  const sex = categorySex(base);
  const pro = isPro(base);
  const want: RaceFormat = r.format === "doubles" ? "duo" : r.format === "relay" ? "relais" : "solo";
  if (categoryFormat(base) === want) return base as ReferenceCategory;
  if (want === "duo") return (sex === "mixed" ? "doubles_mixed" : `doubles_${sex}${pro ? "_pro" : ""}`) as ReferenceCategory;
  if (want === "relais") return (sex === "mixed" ? "relay_mixed" : `relay_${sex}`) as ReferenceCategory;
  // Solo : une catégorie mixte n'existe pas en solo, on garde les hommes faute de mieux.
  return (sex === "women" ? (pro ? "women_pro" : "women") : (pro ? "men_pro" : "men")) as ReferenceCategory;
}

/** Format d'une course (pour séparer les courbes de l'Évolution). */
export const raceFormat = (r: Pick<HyroxResult, "division" | "format">): RaceFormat => categoryFormat(raceCategory(r));

/** Les temps de station de deux catégories se comparent-ils ? (même format seulement) */
export const stationsComparable = (a: string, b: string) => categoryFormat(a) === categoryFormat(b);

/** Avertissement à afficher quand on compare des stations entre formats différents. */
export function crossFormatNote(from: string, to: string): string | null {
  if (stationsComparable(from, to)) return null;
  return "Stations non comparables entre solo, duo et relais : en duo les stations sont partagées, en relais chacun n'en fait qu'une partie. Seuls le chrono (au même rang) et les runs se comparent.";
}

/** Catégories proposées pour comparer : la sienne d'abord, puis même sexe, mixte, et les autres. */
export function categoryOptions(own: ReferenceCategory): ReferenceCategory[] {
  const sex = categorySex(own);
  const rank = (c: ReferenceCategory) => (c === own ? 0 : categorySex(c) === sex ? 1 : categorySex(c) === "mixed" ? 2 : 3);
  return [...REFERENCE_CATEGORIES].sort((a, b) => rank(a) - rank(b) || REFERENCE_CATEGORIES.indexOf(a) - REFERENCE_CATEGORIES.indexOf(b));
}
