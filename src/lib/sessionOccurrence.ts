/**
 * Progression d'une séance par occurrence.
 *
 * Une séance ProgSession fonctionne toujours en « multi-semaines » : la n-ième
 * fois qu'elle est planifiée pour un athlète (workout_logs non « skipped »,
 * ordre chronologique, tous cycles confondus) = occurrence n.
 *
 * Les paramètres d'un exercice sont soit plats (identiques à chaque occurrence),
 * soit un Record { "1": …, "4": … } : une occurrence sans valeur propre reprend
 * la dernière occurrence définie avant elle (une modif vaut jusqu'à la suivante).
 */
import type { Bloc, Exercice, ExerciceParams, ProgSession, VideoRequest } from "@/features/coach/components/programmation/types";

/** True quand les params sont indexés par occurrence (clés numériques). */
export function isWeekRecord(p: unknown): p is Record<string, ExerciceParams> {
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
export function resolveExerciceParams(params: Exercice["params"] | null | undefined, week: number): ExerciceParams | null {
  if (!params || typeof params !== "object") return null;
  if (!isWeekRecord(params)) return params as ExerciceParams;
  return pickWeekValue(params, week) ?? null;
}

/** Demande de retour vidéo active pour une occurrence (null si aucune). */
export function resolveVideoRequest(exercice: Pick<Exercice, "video_request">, week: number): VideoRequest | null {
  const rec = exercice.video_request;
  if (!rec || typeof rec !== "object") return null;
  // Pas de demande avant la première séance où elle a été cochée
  const v = pickWeekValue(rec, week, false);
  return v?.requested ? v : null;
}

/** Écrit la demande de retour vidéo pour une occurrence (vaut pour les suivantes). */
export function setVideoRequest(exercice: Exercice, week: number, value: VideoRequest): Exercice {
  return { ...exercice, video_request: { ...(exercice.video_request ?? {}), [String(week)]: value } };
}

/** Plus grande occurrence ayant des params propres (0 si aucune). */
export function maxDefinedWeek(blocs: Bloc[]): number {
  let max = 0;
  for (const b of blocs) for (const ex of b.exercices) {
    if (!isWeekRecord(ex.params)) continue;
    const keys = weekKeys(ex.params);
    if (keys.length) max = Math.max(max, keys[keys.length - 1]);
  }
  return max;
}

/**
 * Passe une séance en stockage par occurrence sans changer ce qu'elle produit :
 * les params plats deviennent { "1": params } (repris par toutes les occurrences).
 * Nécessaire avant d'éditer une occurrence précise, sinon l'édition réécrirait
 * toutes les occurrences, passées comprises.
 */
export function toMultiWeekSession(session: ProgSession): ProgSession {
  const needs = !session.multi_semaine
    || session.blocs.some((b) => b.exercices.some((ex) => ex.params && !isWeekRecord(ex.params)));
  if (!needs) return session;
  return {
    ...session,
    multi_semaine: true,
    nb_semaines: Math.max(session.nb_semaines ?? 1, maxDefinedWeek(session.blocs), 1),
    blocs: session.blocs.map((b) => ({
      ...b,
      exercices: b.exercices.map((ex) =>
        ex.params && !isWeekRecord(ex.params)
          ? { ...ex, params: { "1": ex.params as ExerciceParams } }
          : ex,
      ),
    })),
  };
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
