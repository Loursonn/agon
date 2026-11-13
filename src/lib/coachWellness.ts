/**
 * Wellness coach (planches CoachWellnessGlobal / CoachWellness, P26) :
 * ressenti des 7 derniers jours face à l'habitude (28 jours d'avant),
 * grille des 6 questions sur 28 jours, courbatures par zone sur 7 jours.
 * Pur, testé. Une mesure absente reste null (affichée « — »).
 */
import { addDays, type IsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEMS, wellnessScore, type WellnessHistory, type WellnessItem } from "@shared/domain/wellness";
import { bodyZoneLabel } from "./bodyZones";

export type GridItem = WellnessItem | "envie";
export const GRID_ITEMS: readonly GridItem[] = [...WELLNESS_ITEMS, "envie"];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function itemValue(h: WellnessHistory, day: IsoDay, item: GridItem): number | null {
  const e = h[day];
  if (!e) return null;
  return item === "envie" ? e.envie : e.items[item] ?? null;
}

function scoreOf(h: WellnessHistory, day: IsoDay): number | null {
  return wellnessScore(h[day] ?? null);
}

function window(today: IsoDay, n: number, endOffset = 0): IsoDay[] {
  return Array.from({ length: n }, (_, i) => addDays(today, -(endOffset + n - 1 - i)));
}

export interface FeltSummary {
  /** Score moyen /100 sur 7 jours. */
  score7: number | null;
  /** Habitude : score moyen des 28 jours d'avant. */
  scoreHabit: number | null;
  envie7: number | null;
  envieHabit: number | null;
  /** Jours sur 7 avec envie ≤ 2. */
  envieLowDays: number;
  /** Item le plus bas en moyenne sur 7 j (hors envie). */
  lowestItem: { item: WellnessItem; mean: number } | null;
}

export function feltSummary(h: WellnessHistory, today: IsoDay): FeltSummary {
  const last7 = window(today, 7);
  const before = window(today, 28, 7);
  const nums = (days: IsoDay[], f: (d: IsoDay) => number | null) => days.map(f).filter((v): v is number => v != null);
  const envie7 = nums(last7, (d) => itemValue(h, d, "envie"));
  let lowest: FeltSummary["lowestItem"] = null;
  for (const it of WELLNESS_ITEMS) {
    const m = mean(nums(last7, (d) => itemValue(h, d, it)));
    if (m != null && (lowest == null || m < lowest.mean)) lowest = { item: it, mean: m };
  }
  return {
    score7: mean(nums(last7, (d) => scoreOf(h, d))),
    scoreHabit: mean(nums(before, (d) => scoreOf(h, d))),
    envie7: mean(envie7),
    envieHabit: mean(nums(before, (d) => itemValue(h, d, "envie"))),
    envieLowDays: envie7.filter((v) => v <= 2).length,
    lowestItem: lowest,
  };
}

export interface GridCell {
  day: IsoDay;
  value: number | null;
  /** Écart à l'habitude de l'item (moyenne ± écart-type des 28 jours affichés), null si pas assez de saisies. */
  z: number | null;
}

export interface GridRow {
  item: GridItem;
  cells: GridCell[];
  mean: number | null;
}

/** Grille des 6 questions sur `n` jours (jusqu'à `today` compris). */
export function itemGrid(h: WellnessHistory, today: IsoDay, n = 28): GridRow[] {
  const days = window(today, n);
  return GRID_ITEMS.map((item) => {
    const vals = days.map((d) => itemValue(h, d, item));
    const present = vals.filter((v): v is number => v != null);
    const m = mean(present);
    const s = sd(present);
    const sdUsed = s == null ? null : Math.max(s, 0.5);
    return {
      item,
      mean: m,
      cells: days.map((day, i) => ({
        day,
        value: vals[i],
        z: vals[i] != null && m != null && sdUsed != null && present.length >= 7 ? (vals[i]! - m) / sdUsed : null,
      })),
    };
  });
}

export interface DomsZoneSummary {
  id: string;
  label: string;
  /** Jours sur la fenêtre où la zone est notée. */
  days: number;
  maxLevel: 1 | 2 | 3;
  /** Séances de la veille rattachées (noms, sans doublon). */
  workouts: string[];
  dates: IsoDay[];
}

/** Courbatures par zone sur `n` jours, la plus fréquente d'abord. */
export function domsByZone(h: WellnessHistory, today: IsoDay, n = 7): DomsZoneSummary[] {
  const map = new Map<string, DomsZoneSummary>();
  for (const day of window(today, n)) {
    const e = h[day];
    if (!e) continue;
    const levels = e.domsLevels ?? {};
    for (const [id, lvl] of Object.entries(levels)) {
      if (lvl == null) continue;
      const cur = map.get(id) ?? { id, label: bodyZoneLabel(id), days: 0, maxLevel: 1 as 1 | 2 | 3, workouts: [], dates: [] };
      cur.days += 1;
      cur.maxLevel = Math.max(cur.maxLevel, lvl) as 1 | 2 | 3;
      cur.dates.push(day);
      const w = e.domsWorkout?.name;
      if (w && !cur.workouts.includes(w)) cur.workouts.push(w);
      map.set(id, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.days - a.days || b.maxLevel - a.maxLevel || a.label.localeCompare(b.label));
}

/** Niveau le plus haut noté par zone sur la fenêtre (pour la carte du corps). */
export function domsMaxLevels(zones: readonly DomsZoneSummary[]): Record<string, 1 | 2 | 3> {
  return Object.fromEntries(zones.map((z) => [z.id, z.maxLevel]));
}

export interface DomsByWorkout {
  name: string;
  /** Zones notées le lendemain, niveau max. */
  zones: Array<{ id: string; label: string; level: 1 | 2 | 3 }>;
  dates: IsoDay[];
}

/** Courbatures rattachées à la séance de la veille, sur `n` jours, la plus récente d'abord. */
export function domsByWorkout(h: WellnessHistory, today: IsoDay, n = 28): DomsByWorkout[] {
  const map = new Map<string, DomsByWorkout>();
  for (const day of window(today, n)) {
    const e = h[day];
    const name = e?.domsWorkout?.name;
    if (!e || !name) continue;
    const cur = map.get(name) ?? { name, zones: [], dates: [] };
    cur.dates.push(day);
    for (const [id, lvl] of Object.entries(e.domsLevels ?? {})) {
      if (lvl == null) continue;
      const z = cur.zones.find((x) => x.id === id);
      if (z) z.level = Math.max(z.level, lvl) as 1 | 2 | 3;
      else cur.zones.push({ id, label: bodyZoneLabel(id), level: lvl as 1 | 2 | 3 });
    }
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.dates[b.dates.length - 1].localeCompare(a.dates[a.dates.length - 1]));
}
