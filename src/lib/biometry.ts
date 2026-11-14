import type { MeasurementField, MeasurementKey, MeasurementLog } from "@/features/shared/types/measurements";

export interface LatestValue {
  key: MeasurementKey;
  label: string;
  /** null : jamais mesuré (affiché « — »). */
  value: number | null;
  /** Jour de la saisie qui porte la valeur ("YYYY-MM-DD"), null si jamais mesuré. */
  date: string | null;
}

/**
 * Dernière valeur connue de chaque champ, saisie par saisie : une saisie
 * récente qui laisse un champ vide ne l'efface pas (la taille ou la longueur
 * de jambe ne se remesurent pas à chaque fois). Ordre des champs conservé.
 */
export function latestValues(logs: readonly MeasurementLog[], fields: readonly MeasurementField[]): LatestValue[] {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  return fields.map((f) => {
    const hit = sorted.find((l) => isMeasured(l[f.key]));
    return { key: f.key, label: f.label, value: hit ? Number(hit[f.key]) : null, date: hit?.date ?? null };
  });
}

function isMeasured(v: unknown): boolean {
  return v != null && Number.isFinite(Number(v)) && Number(v) > 0;
}
