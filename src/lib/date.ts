/** Utilitaires de date utilisés dans l'app. */

export const todayKey = () => {
  const d = new Date();
  return (
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
};

/**
 * Jour calendaire LOCAL au format "YYYY-MM-DD".
 *
 * Ne jamais utiliser `toISOString().slice(0,10)` pour ça : `toISOString()`
 * convertit en UTC. En France (UTC+1/+2), tout ce qui est saisi entre minuit
 * et 1h/2h du matin retombe sur la veille — l'athlète coche la case du 17 et
 * ça enregistre le 16.
 */
export const localISO = (d?: Date) => {
  const x = d || new Date();
  return (
    String(x.getFullYear()) +
    "-" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(x.getDate()).padStart(2, "0")
  );
};

export const hISO = localISO;

/**
 * `todayKey()` stocke en "YYYYMMDD", le reste de l'app manipule "YYYY-MM-DD".
 * Convertit toute clé compacte à 8 chiffres vers la forme ISO à tirets.
 */
export const normalizeDayKey = (key: string): string =>
  /^\d{8}$/.test(key) ? `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}` : key;

/** Réindexe un dictionnaire daté (wellnessHistory, weightLog…) en clés ISO. */
export const normalizeDayMap = <T>(m: Record<string, T> | null | undefined): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(m ?? {})) out[normalizeDayKey(k)] = v;
  return out;
};

export const hAddDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const calcHabitStreak = (logs: string[]): number => {
  const today = new Date();
  const todayISO = hISO(today);
  const base = logs.includes(todayISO) ? 0 : 1;
  let s = 0;
  for (let i = base; i < 365; i++) {
    if (logs.includes(hISO(hAddDays(today, -i)))) s++;
    else break;
  }
  return s;
};

export const streakMsg = (s: number): string => {
  if (s === 0)  return "Fais-le aujourd'hui au moins";
  if (s === 1)  return "1er jour, garde la cadence";
  if (s <= 2)   return `${s} jours d'affilée`;
  if (s <= 4)   return `${s} jours d'affilée`;
  if (s <= 9)   return `${s} jours d'affilée`;
  if (s <= 29)  return `${s} jours d'affilée`;
  if (s < 365)  return `${s} jours d'affilée`;
  const y = Math.floor(s / 365), day = s % 365;
  return `${y} an${y > 1 ? "s" : ""} et ${day} jours d'affilée !`;
};

export const getHabitWeekDays = () => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => hAddDays(today, i - 6));
};

export const checkMilestone = (
  log: Record<string, number>,
  baseline: number
): number | null => {
  const sorted = Object.entries(log).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (sorted.length < 3) return null;
  const last3 = sorted.slice(-3);
  return last3.every(([, kg]) => kg > baseline)
    ? parseFloat((last3.reduce((s, [, kg]) => s + kg, 0) / 3).toFixed(1))
    : null;
};
