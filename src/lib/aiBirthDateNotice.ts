/**
 * Préavis avant de couper l'IA aux comptes sans date de naissance (revue
 * juridique C2, phase 2 — décision d'Hugo du 2026-11-14 : 7 jours de préavis).
 *
 * Jusqu'au `AI_BIRTH_DATE_DEADLINE` inclus, un compte qui a dit oui à l'IA
 * sans date de naissance connue voit le message ci-dessous sur l'écran de
 * saisie de la date. Le lendemain, la migration
 * `supabase/pending/20261114120000_ai_requires_birth_date.sql` rend l'accord
 * IA sans effet tant que la date manque.
 */
import { localIsoDay } from "@shared/domain/dates";

/** Dernier jour pour renseigner sa date de naissance sans perdre l'IA (AAAA-MM-JJ). */
export const AI_BIRTH_DATE_DEADLINE = "2026-11-21";

/** « 21 novembre » : la date limite telle qu'on l'écrit aux athlètes. */
export function aiBirthDateDeadlineLabel(deadline: string = AI_BIRTH_DATE_DEADLINE): string {
  return new Date(deadline + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/**
 * Message de préavis pour un compte sans date de naissance, ou null.
 * Seulement s'il a dit oui à l'IA, et jusqu'à la date limite incluse.
 */
export function aiBirthDateNotice(
  hasAiConsent: boolean,
  today: string = localIsoDay(),
  deadline: string = AI_BIRTH_DATE_DEADLINE,
): string | null {
  if (!hasAiConsent || today > deadline) return null;
  return `Renseigne ta date de naissance d’ici le ${aiBirthDateDeadlineLabel(deadline)} pour garder les analyses de l’IA.`;
}

/**
 * Mention discrète côté coach : l'athlète n'a pas de date de naissance, elle
 * lui sera demandée à sa prochaine connexion. Rien pour un compte pré-créé
 * (non réclamé) : la date est demandée à la création du compte.
 */
export function coachBirthDateHint(
  athlete: { birth_date?: string | null; is_pending?: boolean | null } | null | undefined,
): string | null {
  if (!athlete || athlete.birth_date || athlete.is_pending) return null;
  return "Date de naissance à renseigner par l’athlète : elle lui est demandée à sa prochaine connexion.";
}
