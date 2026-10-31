/**
 * Traduction des refus de l'Edge Function `ai-program` en phrases lisibles.
 *
 * Ces trois refus ne sont pas des pannes : ils disent à l'utilisateur ce qu'il
 * doit faire. Les afficher tels quels (« consentement_ia_absent ») laisserait
 * croire à un bug, et le coach rouvrirait la fenêtre jusqu'à abandonner.
 */
const MESSAGES: Record<string, string> = {
  consentement_ia_absent:
    "Cet athlète n'a pas accepté le traitement de ses données par l'IA. Il peut l'activer dans son profil, section Confidentialité, sur l'accord qui mentionne l'API Google Gemini.",
  athlete_non_autorise:
    "Tu n'es pas le coach de cet athlète : la génération par IA est réservée à son coach et à lui-même.",
  athlete_absent:
    "Aucun athlète n'est sélectionné. Ouvre la fiche de l'athlète concerné avant de lancer l'IA.",
};

/** Erreur dont le message est déjà rédigé pour l'utilisateur. */
export interface AiProgramError extends Error {
  known?: boolean;
}

export function aiProgramError(code: unknown): AiProgramError {
  const known = typeof code === "string" ? MESSAGES[code] : undefined;
  if (known) return Object.assign(new Error(known), { known: true });
  return new Error(typeof code === "string" && code ? code : "Erreur serveur");
}
