/**
 * Saisons HYROX (décision d'Hugo du 15/11/2026) : une course du 15 août de
 * l'année N au 14 août de N+1 appartient à la « Saison N/N+1 ». Le premier
 * HYROX tombe souvent fin août ou début septembre, le dernier en juin.
 * Pur et testé.
 */

/** Jour de bascule : 15 août. */
export const SEASON_START_MONTH = 8;
export const SEASON_START_DAY = 15;

export interface Season {
  /** « 2026-27 » (clé stockée, `hyrox_season_goals.season`). */
  key: string;
  /** « Saison 26/27 ». */
  label: string;
  /** Premier jour (« 2026-08-15 »). */
  start: string;
  /** Dernier jour (« 2027-08-14 »). */
  end: string;
}

const yy = (y: number) => String(y % 100).padStart(2, "0");

/** Saison d'une année de départ (2026 → Saison 26/27). */
export function seasonStarting(year: number): Season {
  return {
    key: `${year}-${yy(year + 1)}`,
    label: `Saison ${yy(year)}/${yy(year + 1)}`,
    start: `${year}-08-15`,
    end: `${year + 1}-08-14`,
  };
}

/** Saison d'un jour « YYYY-MM-DD » (ou « YYYYMMDD »). `null` si la date est illisible. */
export function seasonOf(day: string): Season | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const afterStart = mo > SEASON_START_MONTH || (mo === SEASON_START_MONTH && d >= SEASON_START_DAY);
  return seasonStarting(afterStart ? y : y - 1);
}

/** Saison depuis sa clé (« 2026-27 »). */
export function seasonFromKey(key: string): Season | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  return yy(y + 1) === m[2] ? seasonStarting(y) : null;
}

/** Courses rangées par saison, la plus récente d'abord (courses triées par date décroissante). */
export function groupBySeason<T extends { date: string }>(items: readonly T[]): Array<{ season: Season; items: T[] }> {
  const by = new Map<string, { season: Season; items: T[] }>();
  for (const it of items) {
    const s = seasonOf(it.date);
    if (!s) continue;
    if (!by.has(s.key)) by.set(s.key, { season: s, items: [] });
    by.get(s.key)!.items.push(it);
  }
  return [...by.values()]
    .sort((a, b) => b.season.key.localeCompare(a.season.key))
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => b.date.localeCompare(a.date)) }));
}
