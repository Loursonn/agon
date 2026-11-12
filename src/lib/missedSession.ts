/**
 * Séance ratée : prévue, jamais commencée ni notée. Seule une séance de ce
 * genre peut être déplacée vers un autre jour sans risque de perdre une
 * saisie (règle : on ne supprime ni ne déplace une séance réalisée, commencée
 * ou notée). Le cron `mark_missed_workouts` ne marque « missed » qu'une séance
 * passée sans aucune saisie.
 */
export interface MovableSessionFields {
  status: string | null | undefined;
  started_at?: string | null;
  completed_at?: string | null;
  rpe_score?: number | null;
  notes?: string | null;
}

export function isUntouchedSession(s: MovableSessionFields): boolean {
  if (s.status !== "planned" && s.status !== "missed") return false;
  if (s.started_at || s.completed_at) return false;
  if (s.rpe_score != null) return false;
  if (s.notes && s.notes.trim() !== "") return false;
  return true;
}

/** Ratée = prévue un jour passé (ou déjà marquée manquée), jamais touchée. */
export function isMissedSession(s: MovableSessionFields & { scheduled_date: string }, today: string): boolean {
  if (!isUntouchedSession(s)) return false;
  return s.status === "missed" || s.scheduled_date < today;
}
