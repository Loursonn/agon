/**
 * Jours calendaires — UN seul format exposé par la couche données :
 * "YYYY-MM-DD" (jour local de l'athlète).
 *
 * Pur, sans dépendance : importé par le front (`@shared/domain/dates`) et par
 * les Edge Functions. L'ancien stockage (`app_data`) écrit des clés compactes
 * "YYYYMMDD" : c'est ce décalage qui empêchait l'accueil coach, les alertes
 * wellness et l'assistant IA de voir quoi que ce soit (2026-11-07).
 */

export type IsoDay = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT = /^(\d{4})(\d{2})(\d{2})$/;

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "YYYY-MM-DD" ou "YYYYMMDD" → "YYYY-MM-DD" ; tout le reste (clés de semaine "1".."4", texte) → null. */
export function toIsoDay(key: unknown): IsoDay | null {
  if (typeof key !== "string") return null;
  const k = key.trim();
  const m = ISO.exec(k) ?? COMPACT.exec(k);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return valid(y, mo, d) ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function isIsoDay(v: unknown): v is IsoDay {
  return typeof v === "string" && ISO.test(v) && toIsoDay(v) === v;
}

/** "YYYY-MM-DD" → "YYYYMMDD" (écriture dans l'ancien stockage tant qu'il existe). */
export function toCompactDay(day: IsoDay): string {
  return day.replace(/-/g, "");
}

/** Jour local de l'appareil (jamais `toISOString`, qui donne la veille après minuit à Paris). */
export function localIsoDay(d: Date = new Date()): IsoDay {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Décale un jour ISO de n jours (calcul en UTC, indépendant de l'heure d'été). */
export function addDays(day: IsoDay, n: number): IsoDay {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Réindexe un dictionnaire daté en clés ISO ; les clés non datées sont écartées. */
export function byIsoDay<T>(map: Record<string, T> | null | undefined): Record<IsoDay, T> {
  const out: Record<IsoDay, T> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    const day = toIsoDay(k);
    if (day && !(day in out && isIsoDay(k) === false)) out[day] = v;
  }
  return out;
}
