export type ActivityType = "course" | "velo" | "rameur" | "natation" | "autre";

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  course:   "Course",
  velo:     "Vélo",
  rameur:   "Rameur",
  natation: "Natation",
  autre:    "Autre",
};

export interface RunDistanceValue {
  activity: ActivityType;
  /** Saisie brute (virgule acceptée) */
  km: string;
}

/** Distance pré-remplie : distance prévue de la séance (m) si connue */
export function initialRunDistance(plannedDistanceM?: number | null): RunDistanceValue {
  return {
    activity: "course",
    km: plannedDistanceM && plannedDistanceM > 0 ? String(Math.round(plannedDistanceM / 100) / 10) : "",
  };
}

/** km saisis → nombre (null si vide / invalide) */
export function parseKm(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Champs prêts pour useCompleteEnergyAssignment */
export function runDistancePayload(v: RunDistanceValue): { activity_type: ActivityType; distance_km: number | null } {
  return { activity_type: v.activity, distance_km: v.activity === "course" ? parseKm(v.km) : null };
}
