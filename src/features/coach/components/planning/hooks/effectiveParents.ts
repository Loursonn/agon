/**
 * effectiveParents — §3
 * Calcule les parents effectifs d'une période (primary + secondary[]).
 * Le 2nd parent est calculé à la volée sans table de jonction :
 * si la période déborde de son parent FK, on cherche les autres
 * périodes du niveau parent dont la plage chevauche l'enfant.
 *
 * Réutilise les données déjà chargées via TimelineData — pas de fetch additionnel.
 */

import type { TimelineData } from "./useTimelineData";

export interface EffectiveParents<T> {
  primary:   T | null;
  secondary: T[];
}

/** Pour un mésocycle : parent = macrocycle */
export function effectiveParentsMeso(
  mesoId: string,
  data: TimelineData | undefined,
): EffectiveParents<TimelineData["macrocycles"][number]> {
  if (!data) return { primary: null, secondary: [] };

  const meso = data.mesocycles.find((m) => m.id === mesoId);
  if (!meso) return { primary: null, secondary: [] };

  const primary = data.macrocycles.find((m) => m.id === meso.macrocycle_id) ?? null;

  const secondary = primary
    ? data.macrocycles.filter(
        (m) =>
          m.id !== primary.id &&
          m.start_date <= meso.end_date &&
          m.end_date   >= meso.start_date,
      )
    : [];

  return { primary, secondary };
}

/** Pour un cycle : parent = mésocycle */
export function effectiveParentsCycle(
  cycleId: string,
  data: TimelineData | undefined,
): EffectiveParents<TimelineData["mesocycles"][number]> {
  if (!data) return { primary: null, secondary: [] };

  const cycle = data.cycles.find((c) => c.id === cycleId);
  if (!cycle) return { primary: null, secondary: [] };

  const primary = cycle.mesocycle_id
    ? (data.mesocycles.find((m) => m.id === cycle.mesocycle_id) ?? null)
    : null;

  const secondary = data.mesocycles.filter(
    (m) =>
      m.id !== cycle.mesocycle_id &&
      m.start_date <= cycle.end_date &&
      m.end_date   >= cycle.start_date,
  );

  return { primary, secondary };
}

/** Pour un microcycle : parent = cycle */
export function effectiveParentsMicro(
  microId: string,
  data: TimelineData | undefined,
): EffectiveParents<TimelineData["cycles"][number]> {
  if (!data) return { primary: null, secondary: [] };

  const micro = data.microcycles.find((m) => m.id === microId);
  if (!micro) return { primary: null, secondary: [] };

  const primary = data.cycles.find((c) => c.id === micro.cycle_id) ?? null;

  const secondary = data.cycles.filter(
    (c) =>
      c.id !== micro.cycle_id &&
      c.start_date <= micro.end_date &&
      c.end_date   >= micro.start_date,
  );

  return { primary, secondary };
}

/**
 * Generic overload — retourne { primary, secondary[] } pour n'importe quelle période.
 * Détecte automatiquement le type selon les données disponibles.
 */
export function effectiveParents(
  period: { id: string; start_date: string; end_date: string },
  kind: "mesocycle" | "cycle" | "microcycle",
  data: TimelineData | undefined,
): EffectiveParents<TimelineData["macrocycles"][number] | TimelineData["mesocycles"][number] | TimelineData["cycles"][number]> {
  if (kind === "mesocycle") return effectiveParentsMeso(period.id, data) as EffectiveParents<TimelineData["macrocycles"][number]>;
  if (kind === "cycle")     return effectiveParentsCycle(period.id, data) as EffectiveParents<TimelineData["mesocycles"][number]>;
  return effectiveParentsMicro(period.id, data) as EffectiveParents<TimelineData["cycles"][number]>;
}
