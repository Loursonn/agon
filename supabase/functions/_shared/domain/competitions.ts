/**
 * Compétitions annulées (colonne `competitions.cancelled_at`).
 *
 * Une compétition annulée reste visible, barrée, dans les listes et le
 * calendrier. Elle sort de tout ce qui compte ou projette : prochaine
 * compétition, décomptes J-x, frise du planning, jour de compétition de
 * l'accueil athlète, retours, lecture par l'assistant IA du coach.
 *
 * Pur, sans dépendance : importé par `coach-api` et par le front (`@shared`).
 */

export interface CancellableCompetition {
  cancelled_at?: string | null;
}

export function isCancelled(c: CancellableCompetition | null | undefined): boolean {
  return !!c?.cancelled_at;
}

/** Les compétitions maintenues (non annulées), dans le même ordre. */
export function activeCompetitions<T extends CancellableCompetition>(list: readonly T[]): T[] {
  return list.filter((c) => !isCancelled(c));
}

/**
 * « par toi », « par Léa », « par ton coach »… : qui a annulé, vu par `viewerId`.
 * Vide si l'auteur est inconnu (compte supprimé, assistant du coach).
 */
export function cancelledByLabel(
  c: { cancelled_by?: string | null; athlete_id: string },
  viewerId: string | null | undefined,
  athleteFirstName?: string | null,
): string {
  const by = c.cancelled_by;
  if (!by) return "";
  if (viewerId && by === viewerId) return "par toi";
  if (by === c.athlete_id) return athleteFirstName ? `par ${athleteFirstName}` : "par l’athlète";
  if (viewerId === c.athlete_id) return "par ton coach";
  return "par un autre coach";
}

/** Ce qui est rattaché à une compétition, à annoncer avant de la supprimer. */
export interface CompetitionLinks {
  /** Résultats HYROX saisis pour cette course. */
  results: number;
  /** Plans de course HYROX préparés pour cette course. */
  plans: number;
  /** Bilan écrit par l'athlète après la course. */
  hasComment: boolean;
}

/**
 * Avertissement de la confirmation de suppression, une phrase par élément
 * rattaché. Liste vide : rien n'est perdu ni détaché.
 */
export function deleteWarnings(l: CompetitionLinks): string[] {
  const out: string[] = [];
  if (l.results > 0) {
    out.push(l.results > 1
      ? `${l.results} résultats HYROX sont gardés mais ne seront plus rattachés à cette course.`
      : "Le résultat HYROX est gardé mais ne sera plus rattaché à cette course.");
  }
  if (l.plans > 0) {
    out.push(l.plans > 1
      ? `${l.plans} plans de course sont gardés mais ne seront plus rattachés à cette course.`
      : "Le plan de course est gardé mais ne sera plus rattaché à cette course.");
  }
  if (l.hasComment) out.push("Le bilan écrit par l’athlète sera perdu.");
  return out;
}
