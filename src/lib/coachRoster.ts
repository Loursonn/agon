/**
 * Ids des athlètes du coach sans le coach lui-même. Un `coach_athlete` qui se
 * coache (profiles.coach_id = lui) figure dans son propre roster : ses mesures
 * et ses tests ne doivent pas remonter dans les blocs « de ses athlètes »
 * (accueil : Records & tests, Tests à venir).
 */
export function athleteIdsExceptSelf(
  athletes: ReadonlyArray<{ id: string }>,
  selfId: string | null | undefined,
): string[] {
  return [...new Set(athletes.map((a) => a.id))].filter((id) => id !== selfId);
}
