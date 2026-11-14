/**
 * Sport d'une séance énergie (`energy_sessions.modality`). Il décide du mode
 * de la montre quand la séance part sur Garmin (course par défaut).
 * Valeurs bornées en base (contrainte `energy_sessions_modality_check`).
 */
export const ENERGY_SPORTS = [
  { value: "course", label: "Course" },
  { value: "velo", label: "Vélo" },
  { value: "natation", label: "Natation" },
  { value: "rameur", label: "Rameur" },
  { value: "autre", label: "Autre cardio" },
] as const;

export type EnergySport = (typeof ENERGY_SPORTS)[number]["value"];

/** Sport enregistré, « course » si absent ou inconnu. */
export function energySportOf(modality: string | null | undefined): EnergySport {
  return ENERGY_SPORTS.some((s) => s.value === modality) ? (modality as EnergySport) : "course";
}
