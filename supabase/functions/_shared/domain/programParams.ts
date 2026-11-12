/**
 * Paramètres d'un exercice du programme de musculation, par occurrence.
 *
 * Les paramètres sont soit plats (identiques à chaque occurrence), soit un
 * Record { "1": …, "4": … } : une occurrence sans valeur propre reprend la
 * dernière occurrence définie avant elle (une modif vaut jusqu'à la suivante).
 *
 * Partagé par l'app (`src/lib/sessionOccurrence.ts`) et les Edge Functions
 * (envoi des séances vers la montre) : un seul calcul.
 */

/** True quand les params sont indexés par occurrence (clés numériques). */
export function isWeekRecord<P>(p: unknown): p is Record<string, P> {
  return !!p && typeof p === "object" && Object.keys(p as object).some((k) => /^\d+$/.test(k));
}

function weekKeys(rec: Record<string, unknown>): number[] {
  return Object.keys(rec)
    .filter((k) => /^\d+$/.test(k) && rec[k] != null)
    .map(Number)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
}

/**
 * Valeur de l'occurrence `week` : la sienne, sinon la dernière définie avant,
 * sinon (si `fallbackToFirst`) la première définie.
 */
export function pickWeekValue<T>(rec: Record<string, T>, week: number, fallbackToFirst = true): T | undefined {
  const own = rec[String(week)];
  if (own != null) return own;
  const keys = weekKeys(rec);
  let best: number | undefined = fallbackToFirst ? keys[0] : undefined;
  for (const k of keys) if (k <= week) best = k;
  return best === undefined ? undefined : rec[String(best)];
}

/** Params d'un exercice pour une occurrence (plats → tels quels). */
export function resolveWeekParams<P extends object>(params: P | Record<string, P> | null | undefined, week: number): P | null {
  if (!params || typeof params !== "object") return null;
  if (!isWeekRecord<P>(params)) return params as P;
  return pickWeekValue(params as Record<string, P>, week) ?? null;
}

/** Rang chronologique (1-based) de chaque log au sein de sa séance. */
export function computeOccurrences(
  logs: Array<{ id: string; session_id: string | null; scheduled_date: string }>,
): Map<string, number> {
  const bySession = new Map<string, typeof logs>();
  for (const l of logs) {
    if (!l.session_id) continue;
    const arr = bySession.get(l.session_id) ?? [];
    arr.push(l);
    bySession.set(l.session_id, arr);
  }
  const out = new Map<string, number>();
  for (const arr of bySession.values()) {
    arr.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.id.localeCompare(b.id));
    arr.forEach((l, i) => out.set(l.id, i + 1));
  }
  return out;
}
