import { addDays, type IsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEMS, WELLNESS_ITEM_SHORT, wellnessEntries, type WellnessHistory, type WellnessItem } from "@shared/domain/wellness";

export interface WellnessDrop {
  item: WellnessItem;
  label: string;
  /** Dernière note (sur 5). */
  value: number;
  /** Jour du dernier relevé. */
  day: IsoDay;
}

/** Une note à 2/5 ou moins est « basse ». */
const LOW = 2;
/** Le dernier relevé doit dater d'au plus 3 jours pour être encore à surveiller. */
const MAX_AGE_DAYS = 3;

/**
 * « Wellness en baisse » (À surveiller du staff) : une même note à 2/5 ou moins
 * deux matins de suite, le dernier relevé étant récent. Renvoie la première note
 * concernée, dans l'ordre des notes du wellness, ou null.
 */
export function wellnessDrop(h: WellnessHistory, today: IsoDay): WellnessDrop | null {
  const entries = wellnessEntries(h).filter((e) => !Number.isNaN(Date.parse(e.day)));
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1]!;
  const prev = entries[entries.length - 2]!;
  if (addDays(prev.day, 1) !== last.day) return null;
  if (last.day < addDays(today, -MAX_AGE_DAYS)) return null;
  for (const item of WELLNESS_ITEMS) {
    const a = prev.items[item];
    const b = last.items[item];
    if (a != null && b != null && a <= LOW && b <= LOW) {
      return { item, label: WELLNESS_ITEM_SHORT[item], value: b, day: last.day };
    }
  }
  return null;
}
