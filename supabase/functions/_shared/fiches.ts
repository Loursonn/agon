/**
 * Rattachements de fiches stockés dans le JSON des séances (`asp:prog`,
 * overrides d'occurrence, `energy_sessions.fiches`). Module pur, partagé par
 * l'app et l'Edge Function `coach-api` : les deux calculent la même liste de
 * fiches référencées pour synchroniser `doc_assignments`.
 */

/** Rattachement d'une fiche à une séance, un bloc ou une séance énergie. */
export interface FicheAttachment {
  id: string;                          // id local du rattachement (uuid)
  doc_id: string;                      // fiche (ou variante) par défaut
  weeks?: Record<number, string>;      // semaine → doc_id de la variante ; absent = doc_id partout
}

/** Tous les doc_id d'un rattachement (défaut + variantes par semaine). */
export function attachmentDocIds(att: FicheAttachment): string[] {
  const ids = [att.doc_id, ...Object.values(att.weeks ?? {})];
  return ids.filter(Boolean);
}

/** Ids uniques de plusieurs listes de rattachements. */
export function collectDocIds(lists: (FicheAttachment[] | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const att of list) if (att && typeof att === "object") for (const id of attachmentDocIds(att)) set.add(id);
  }
  return [...set];
}

interface WithFiches {
  fiches?: FicheAttachment[] | null;
}

interface SessionLike extends WithFiches {
  blocs?: WithFiches[] | unknown[];
}

/** doc_id référencés par une liste de séances (niveau séance + blocs). */
export function collectProgDocIds(sessions: SessionLike[]): string[] {
  const lists: (FicheAttachment[] | null | undefined)[] = [];
  for (const s of sessions) {
    lists.push(s.fiches);
    for (const b of (s.blocs ?? []) as WithFiches[]) lists.push(b?.fiches);
  }
  return collectDocIds(lists);
}
