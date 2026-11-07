import { formatDistance, formatDuration, providerAttribution } from "@/lib/activityDisplay";
import type { RunMatch } from "@/lib/watchRunMatching";

/**
 * « montre » pour une synchro, « fichier » pour un import : la provenance reste lisible.
 * Garmin exige « Garmin [modèle] » partout où une de ses données est affichée.
 */
function originWord(source: string, device?: string | null): string {
  if (source === "file_import") return "fichier";
  if (source === "manual") return "saisie";
  if (source === "garmin") return providerAttribution(source, device);
  return "montre";
}

/** Mesure de la sortie rattachée : « 10,2 km montre », à défaut « 45 min montre ». */
export function watchRunMeasure(m: RunMatch): string {
  const mesure = m.watchKm != null
    ? formatDistance(m.watchKm * 1000)
    : m.watchDurationS != null ? formatDuration(m.watchDurationS) : null;
  return mesure ? `${mesure} ${originWord(m.activitySource, m.activityDevice)}` : originWord(m.activitySource, m.activityDevice);
}

/** Texte du rattachement côté séance prévue : « Réalisée — 10,2 km montre ». */
export function watchRunText(m: RunMatch): string {
  return `Réalisée — ${watchRunMeasure(m)}`;
}
