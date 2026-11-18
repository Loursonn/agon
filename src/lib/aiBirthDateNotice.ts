/**
 * Date de naissance manquante : mention côté coach.
 *
 * Le préavis athlète « d'ici le 21 novembre pour garder l'IA » a été retiré le
 * 2026-11-17 : Hugo a annulé la coupure de l'IA aux comptes sans date de
 * naissance (migration `supabase/pending/20261114120000_ai_requires_birth_date.sql`
 * non appliquée). La date reste demandée à tous les comptes (BirthDateGate).
 */

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
