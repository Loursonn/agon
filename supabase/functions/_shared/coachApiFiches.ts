/**
 * Fiches déposées par l'assistant IA d'un coach (coach-api POST / DELETE
 * /fiches). Module pur : la décision « l'assistant peut-il retirer cette
 * fiche ? » est testée ici, l'Edge Function ne fait que lire et supprimer.
 */

/** Catégories acceptées par POST /fiches (miroir de docs_category_check, hors questionnaire). */
export const API_FICHE_CATEGORIES = [
  "mobilite", "pacing", "prevention", "recuperation", "nutrition", "education", "test", "questionnaire", "autre",
] as const;

export interface FicheForDelete {
  tags: string[] | null;
  /** 'api' : déposée par coach-api. NULL : fiches d'avant le marqueur, ou créées dans l'app. */
  created_via: string | null;
}

/**
 * Fiche de l'assistant : marquée à la création par coach-api. L'étiquette
 * « claude » reste reconnue pour les fiches d'avant le marqueur, mais elle
 * ne suffit pas à elle seule à les perdre : le coach peut la retirer dans
 * l'app sans que la fiche cesse d'être celle de l'assistant.
 */
export function isAssistantFiche(doc: FicheForDelete): boolean {
  return doc.created_via === "api" || (Array.isArray(doc.tags) && doc.tags.includes("claude"));
}

export interface FicheUsage {
  assignments: number;
  variants: number;
  comments: number;
}

export type DeleteRefusal = { status: number; code: string; message: string };

/**
 * Refus de DELETE /fiches/:id, ou null si la suppression peut se faire.
 * `doc` null : aucune fiche de ce coach sous cet id (404). Une fiche qui
 * existe mais que le coach a déposée lui-même n'est PAS un 404 : l'assistant
 * doit savoir qu'elle est là, et que c'est au coach de la gérer.
 */
export function ficheDeleteRefusal(doc: FicheForDelete | null, usage: FicheUsage | null): DeleteRefusal | null {
  if (!doc) {
    return {
      status: 404,
      code: "fiche_introuvable",
      message: "Aucune fiche de ta banque sous cet id (déjà retirée, ou id d'une autre table : prends l'id renvoyé par POST /fiches).",
    };
  }
  if (!isAssistantFiche(doc)) {
    return {
      status: 409,
      code: "fiche_du_coach",
      message: "Cette fiche a été déposée par le coach dans Agon : seules les fiches déposées par l'assistant se retirent ici. Le coach la supprime depuis Agon (Fiches).",
    };
  }
  if (!usage) return null;
  if (usage.assignments > 0) {
    return {
      status: 409,
      code: "fiche_utilisee",
      message: "Fiche attribuée ou rattachée à une séance : retire-la d'abord (unassign_fiche, detach_fiche), ou annule la proposition qui l'a donnée.",
    };
  }
  if (usage.variants > 0 || usage.comments > 0) {
    return {
      status: 409,
      code: "fiche_utilisee",
      message: "Le coach en a fait des variantes ou elle a des commentaires : elle reste, le coach la gère dans Agon.",
    };
  }
  return null;
}
