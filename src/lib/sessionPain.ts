import type { PainLevels } from "@shared/domain/wellness";
import { notedPainLevels, painSummary, painZoneLabel } from "@/lib/painZones";

/**
 * Douleur de séance (demande d'Hugo, 15/11) : en fin de séance, « Une douleur
 * pendant la séance ? » Non / Oui ; si Oui, zones de la carte douleur du
 * wellness, une note 0-10 par zone, commentaire facultatif. Jamais bloquant :
 * sans réponse, rien n'est écrit.
 *
 * Chaque « oui » est une blessure déclarée (décision d'Hugo, 15/11) : la RPC
 * `report_session_pain` crée la blessure ou suit celle déjà en cours sur la
 * même zone (`injury_followups`). Les zones y sont écrites par leur libellé
 * (« Genou », « Cheville / pied »), comme une blessure saisie à la main.
 */
export interface SessionPainAnswer {
  /** null : pas répondu (équivaut à Non). */
  has: boolean | null;
  /** Zones touchées : note 0-10, ou null tant qu'elle n'est pas notée. */
  levels: Record<string, number | null>;
  note: string;
}

export const EMPTY_SESSION_PAIN: SessionPainAnswer = { has: null, levels: {}, note: "" };

/**
 * Ce qu'on enregistre : les zones notées au-dessus de 0 et le commentaire.
 * null quand il n'y a rien à écrire (Non, pas répondu, Oui sans zone notée).
 */
export function sessionPainPayload(a: SessionPainAnswer): { levels: PainLevels; note: string | null } | null {
  if (a.has !== true) return null;
  const levels = Object.fromEntries(Object.entries(notedPainLevels(a.levels)).filter(([, v]) => v > 0));
  if (Object.keys(levels).length === 0) return null;
  return { levels, note: a.note.trim() || null };
}

/** Oui coché mais une zone touchée pas encore notée : on le signale sans bloquer. */
export function sessionPainIncomplete(a: SessionPainAnswer): boolean {
  return a.has === true && Object.values(a.levels).some((v) => v == null);
}

/** « Genou 6/10, lombaires 3/10 » ; null sans douleur. */
export function sessionPainText(levels: PainLevels | null | undefined): string | null {
  return painSummary(levels) || null;
}

/** Zones de la carte (id) → libellés écrits dans la blessure : {"genou": 6} → {"Genou": 6}. */
export function sessionPainByLabel(levels: PainLevels): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(levels)) if (v > 0) out[painZoneLabel(id)] = v;
  return out;
}

/** Ce qu'on lit d'un suivi de blessure pour l'afficher sur la séance. */
export interface SessionPainFollowupLike {
  zone: string | null;
  pain_level: number;
  note: string | null;
  workout_log_id: string | null;
  energy_assignment_id: string | null;
}

export interface SessionPainShown {
  /** Libellé de zone → note 1-10. */
  levels: Record<string, number>;
  note: string | null;
}

export const sessionPainKey = {
  workout: (id: string) => `w:${id}`,
  energy: (id: string) => `e:${id}`,
};

/**
 * Douleurs déclarées en fin de séance, regroupées par séance (clé
 * `sessionPainKey`) : zones et notes, commentaire (le même pour toutes les
 * zones d'une séance). Les suivis dont la séance a été supprimée sont ignorés.
 */
export function sessionPainBySession(followups: readonly SessionPainFollowupLike[]): Map<string, SessionPainShown> {
  const out = new Map<string, SessionPainShown>();
  for (const f of followups) {
    const key = f.workout_log_id ? sessionPainKey.workout(f.workout_log_id)
      : f.energy_assignment_id ? sessionPainKey.energy(f.energy_assignment_id) : null;
    if (!key || !(f.pain_level > 0)) continue;
    const cur = out.get(key) ?? { levels: {}, note: null };
    cur.levels[f.zone?.trim() || "Douleur"] = f.pain_level;
    cur.note = cur.note ?? (f.note?.trim() || null);
    out.set(key, cur);
  }
  return out;
}
