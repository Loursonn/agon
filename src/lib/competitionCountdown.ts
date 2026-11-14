/**
 * Compte à rebours d'une compétition : « J-12 », « Jour J », « Passée ».
 * Jours calendaires (midi local des deux côtés : pas de dérive au changement d'heure).
 * Dates au format "YYYY-MM-DD".
 */
export function competitionCountdown(date: string, today: string): string {
  const days = Math.round((Date.parse(date + "T12:00:00") - Date.parse(today + "T12:00:00")) / 86_400_000);
  if (days === 0) return "Jour J";
  return days > 0 ? `J-${days}` : "Passée";
}
