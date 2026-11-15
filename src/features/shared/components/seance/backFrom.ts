/**
 * Retour d'une fiche séance ouverte depuis une autre page (liste des sorties du
 * volume de course…) : la page d'origine passe `state.back` au lien, la fiche y
 * revient au lieu du planning par défaut.
 */
export function backFrom(state: unknown): { to: string; label: string } | null {
  const back = (state as { back?: { to?: unknown; label?: unknown } } | null)?.back;
  if (!back || typeof back.to !== "string" || typeof back.label !== "string") return null;
  // Chemin interne uniquement : jamais une adresse extérieure.
  if (!back.to.startsWith("/") || back.to.startsWith("//")) return null;
  return { to: back.to, label: back.label };
}
