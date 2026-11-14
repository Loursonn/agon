/**
 * « Ressenti / mesuré » (planche CoachOrdiASante) : ce que l'athlète déclare
 * dans son wellness (1-5) face à ce que mesure sa montre, comparé à sa propre
 * moyenne. Pur, testé.
 */
export type Agreement = "ecart" | "coherent";

/**
 * @param felt      note du wellness, 1 (mauvais) à 5 (très bien)
 * @param measured  mesure de la montre du jour
 * @param mean      moyenne habituelle de la même mesure
 * @param higherIsBetter  true pour sommeil / Body Battery, false pour le stress
 */
export function agreement(felt: number, measured: number, mean: number, higherIsBetter: boolean): Agreement {
  if (!mean) return "coherent";
  const rel = ((measured - mean) / Math.abs(mean)) * (higherIsBetter ? 1 : -1);
  // rel > 0 : la mesure est meilleure que d'habitude.
  if (felt >= 4 && rel <= -0.15) return "ecart";
  if (felt <= 2 && rel >= 0.05) return "ecart";
  return "coherent";
}

/** Mots du wellness pour une note 1-5 (« bonne nuit », « en forme »…). */
export const FELT_WORDS: Record<"sommeil" | "energie" | "stress", readonly string[]> = {
  sommeil: ["très mauvaise nuit", "mauvaise nuit", "nuit moyenne", "bonne nuit", "excellente nuit"],
  energie: ["à plat", "fatigué·e", "moyen", "en forme", "plein d’énergie"],
  stress: ["très stressé·e", "stressé·e", "moyen", "détendu·e", "très détendu·e"],
};
