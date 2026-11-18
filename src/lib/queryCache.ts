import type { Query } from "@tanstack/react-query";

/**
 * Durées de cache React Query (base de prod sur le plan gratuit : chaque
 * relecture évitée compte).
 *
 * Contrepartie acceptée (décision du 16/11/2026) : une donnée modifiée par
 * l'autre (coach ↔ athlète) peut mettre jusqu'à quelques minutes à apparaître.
 * Ses propres modifications, elles, s'affichent tout de suite (chaque écriture
 * invalide ses clés), et un rechargement de la page relit tout
 * (`persistenceController` : cache restauré marqué périmé).
 */

/** Données courantes (séances, planning, wellness…). */
export const STALE_MS = 5 * 60_000;

/** Ce qui change rarement : bibliothèque d'exercices, réglages, références. */
export const STALE_SLOW_MS = 30 * 60_000;

/**
 * Retour sur l'onglet / l'app : on ne relit que ce qui a plus de 5 min (avant :
 * tout ce qui avait plus de 30 s, à chaque changement d'onglet).
 */
export const FOCUS_REFETCH_MIN_AGE_MS = 5 * 60_000;

export function refetchOnFocusIfOld(canRefetch: () => boolean, now: () => number = Date.now) {
  return (query: Query): boolean =>
    canRefetch() && (query.state.isInvalidated || now() - query.state.dataUpdatedAt >= FOCUS_REFETCH_MIN_AGE_MS);
}
