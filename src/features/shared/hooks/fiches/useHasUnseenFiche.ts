/**
 * Résolution des fiches d'une séance pour une semaine + état « jamais ouverte ».
 */
import { useMemo } from "react";
import { resolveFicheForWeek } from "../../types/fiches";
import type { FicheAttachment } from "../../types/fiches";
import { useAthleteDocs } from "./useDocs";

/** doc_id résolus (semaine) d'une liste de rattachements, sans doublon. */
export function resolveFicheIds(attachments: FicheAttachment[] | null | undefined, week?: number): string[] {
  return [...new Set((attachments ?? []).map(a => resolveFicheForWeek(a, week)))];
}

/** Vrai si une fiche résolue n'a jamais été ouverte (pastille carte du jour). */
export function useHasUnseenFiche(
  attachments: FicheAttachment[] | null | undefined,
  week: number | undefined,
  athleteId: string | null | undefined,
): boolean {
  const ids = useMemo(() => resolveFicheIds(attachments, week), [attachments, week]);
  const { data: mine } = useAthleteDocs(ids.length ? athleteId : null);
  if (!ids.length || !mine) return false;
  return mine.assigned.some(a => ids.includes(a.doc.id) && !a.seenAt);
}
