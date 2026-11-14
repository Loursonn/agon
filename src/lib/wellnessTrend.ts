import { addDays, type IsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEMS, wellnessScore, type WellnessHistory, type WellnessItem } from "@shared/domain/wellness";

/** Notes moyennées dans la tendance : les 5 du score + « envie » (hors score). */
export type TrendItem = WellnessItem | "envie";
export const TREND_ITEMS: readonly TrendItem[] = [...WELLNESS_ITEMS, "envie"];

export interface WellnessTrend {
  /** Jours de la fenêtre, du plus ancien à aujourd'hui inclus. */
  days: IsoDay[];
  /** Score /100 de chaque jour, null si pas de saisie complète. */
  scores: (number | null)[];
  /** Moyenne des scores connus, arrondie ; null si aucun. */
  avgScore: number | null;
  /** Moyenne /5 de chaque note sur la fenêtre (1 décimale), null si jamais notée. */
  itemAvgs: Record<TrendItem, number | null>;
  /** Zone de courbatures la plus souvent notée et son nombre de jours. */
  topZone: { id: string; days: number } | null;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Tendance wellness sur les `n` derniers jours (planche AthOrdiAWellness). */
export function wellnessTrend(h: WellnessHistory, today: IsoDay, n: number): WellnessTrend {
  const days = Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
  const entries = days.map((d) => h[d] ?? null);
  const scores = entries.map((e) => wellnessScore(e));
  const known = scores.filter((s): s is number => s != null);
  const a = avg(known);
  const itemAvgs = {} as Record<TrendItem, number | null>;
  for (const k of TREND_ITEMS) {
    const vals = entries
      .map((e) => (e ? (k === "envie" ? e.envie : e.items[k]) : null))
      .filter((v): v is number => v != null);
    const m = avg(vals);
    itemAvgs[k] = m == null ? null : Math.round(m * 10) / 10;
  }
  const zoneDays = new Map<string, number>();
  for (const e of entries) for (const z of Object.keys(e?.domsLevels ?? {})) zoneDays.set(z, (zoneDays.get(z) ?? 0) + 1);
  let topZone: WellnessTrend["topZone"] = null;
  for (const [id, c] of zoneDays) if (!topZone || c > topZone.days) topZone = { id, days: c };
  return { days, scores, avgScore: a == null ? null : Math.round(a), itemAvgs, topZone };
}
