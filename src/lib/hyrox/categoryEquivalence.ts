/**
 * Équivalences de chrono entre catégories HYROX : même position (top x %)
 * dans toute la catégorie → chrono équivalent. Pur et testé.
 */
import { POSITION_BRACKET, percentile, timeAtPercentile, type RefLookup } from "./calc";
import { CATEGORY_LABEL, REFERENCE_CATEGORIES, categorySex, type ReferenceCategory } from "./categories";

/**
 * Chrono équivalent dans une autre catégorie : même position (top x %) dans
 * toute la catégorie. `null` sans références.
 */
export function equivalentTotal(totalS: number, from: string, to: string, refs: RefLookup): { pct: number; timeS: number } | null {
  const a = refs(from, "total", POSITION_BRACKET);
  const b = refs(to, "total", POSITION_BRACKET);
  if (!a || !b) return null;
  const pct = percentile(totalS, a);
  if (pct == null) return null;
  const timeS = timeAtPercentile(b, pct);
  return timeS == null ? null : { pct, timeS };
}

/** Carte d'équivalences : le chrono traduit dans les catégories du même sexe et mixtes. */
export function equivalences(totalS: number, own: ReferenceCategory, refs: RefLookup): Array<{ category: ReferenceCategory; label: string; timeS: number; pct: number }> {
  const sex = categorySex(own);
  return REFERENCE_CATEGORIES
    .filter((c) => c !== own && (categorySex(c) === sex || categorySex(c) === "mixed"))
    .map((c) => {
      const e = equivalentTotal(totalS, own, c, refs);
      return e ? { category: c, label: CATEGORY_LABEL[c], timeS: e.timeS, pct: e.pct } : null;
    })
    .filter((x): x is { category: ReferenceCategory; label: string; timeS: number; pct: number } => x != null);
}
