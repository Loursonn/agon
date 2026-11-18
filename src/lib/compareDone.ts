/**
 * Réalisé face au prévu, case par case (reprogrammation de la séance suivante).
 * « plus » = plus dur que prévu, « moins » = plus facile, « egal » = identique,
 * « neutre » = pas de comparaison possible.
 */
export type Cmp = "egal" | "plus" | "moins" | "neutre"

/** `harderWhenHigher` : vrai pour les reps et les kg ; faux pour le RIR (plus de RIR = plus facile). */
export function compareDone(done: number | null | undefined, planned: number | null | undefined, harderWhenHigher = true): Cmp {
  if (done == null || planned == null) return "neutre"
  if (done === planned) return "egal"
  return (done > planned) === harderWhenHigher ? "plus" : "moins"
}
