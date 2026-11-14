/** Traduit le chemin de l'app athlète où un retour a été envoyé en libellé lisible. */
const EXACT: Record<string, string> = {
  "/athlete": "Aujourd'hui",
  "/athlete/program": "Programme",
  "/athlete/profil": "Profil",
  "/athlete/log": "Séance en cours",
  "/athlete/alim": "Alimentation",
  "/athlete/test": "Tests",
  "/athlete/zones": "Zones",
  "/athlete/review": "Bilan de la semaine",
  "/athlete/montres": "Montres",
  "/athlete/sante": "Santé",
  "/athlete/hyrox": "HYROX",
};

export function feedbackPageLabel(page: string | null | undefined): string | null {
  if (!page) return null;
  const path = page.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (EXACT[path]) return EXACT[path];
  if (path.startsWith("/athlete/program/workout") || path.startsWith("/athlete/program/activity") || path.startsWith("/athlete/specific/")) {
    return "Séance en cours";
  }
  return page;
}
