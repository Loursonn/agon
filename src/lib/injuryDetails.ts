/**
 * Lecture d'une blessure déclarée (`medical_entries`, `kind = 'blessure'`).
 *
 * Le détail est entièrement facultatif : une gêne se déclare avec un titre et
 * rien d'autre. Les fonctions ici ne montrent donc que ce qui a été rempli,
 * jamais de « non précisé » qui ferait du bruit, et traduisent les codes stockés
 * en base en phrases que l'athlète comme le coach lisent sans décoder.
 *
 * Une blessure est « active » dès que `status = 'en_cours'` : c'est le seul
 * critère des badges (header athlète, profil, retours coach).
 */
import {
  DIAGNOSED_BY_LABEL,
  INJURY_CONTEXT_LABEL,
  INJURY_MECHANISM_LABEL,
  INJURY_TYPE_LABEL,
  TRAINING_IMPACT_LABEL,
  type DeclaredBy,
  type DiagnosedBy,
  type InjuryContext,
  type InjuryMechanism,
  type InjuryType,
  type MedicalEntryKind,
  type MedicalEntryStatus,
  type TrainingImpact,
} from "@/features/shared/types/medical";

/**
 * Sous-ensemble d'un `MedicalEntry` suffisant pour juger et résumer. Les champs
 * de détail sont optionnels : les anciennes lignes, saisies avant la migration,
 * ne les ont pas.
 */
export interface InjuryLike {
  kind: MedicalEntryKind;
  status: MedicalEntryStatus;
  title?: string;
  zone?: string | null;
  injury_type?: InjuryType | null;
  mechanism?: InjuryMechanism | null;
  context?: InjuryContext | null;
  pain_level?: number | null;
  training_impact?: TrainingImpact | null;
  days_off?: number | null;
  diagnosed_by?: DiagnosedBy | null;
  return_date?: string | null;
  declared_by?: DeclaredBy | null;
}

// ── Actives ──────────────────────────────────────────────────────────────────

/** Blessure en cours : ni une opération, ni une blessure guérie. */
export function isActiveInjury(e: InjuryLike): boolean {
  return e.kind === "blessure" && e.status === "en_cours";
}

/** Garde les blessures en cours, en conservant le type d'entrée. */
export function activeInjuries<T extends InjuryLike>(entries: T[]): T[] {
  return entries.filter(isActiveInjury);
}

// ── Traductions ──────────────────────────────────────────────────────────────

/** Douleur bornée à l'échelle 0–10, ou null si rien n'a été saisi. */
export function painValue(level: number | null | undefined): number | null {
  if (level == null || !Number.isFinite(level)) return null;
  return Math.round(Math.min(10, Math.max(0, level)));
}

/**
 * « 7/10 » ne dit rien à qui survole une liste : on redit la note en clair.
 * 0 est une valeur légitime — une gêne peut être déclarée sans douleur du jour.
 */
export function painReading(level: number | null | undefined): string | null {
  const v = painValue(level);
  if (v === null) return null;
  if (v === 0) return "aucune douleur";
  if (v <= 2) return "douleur légère";
  if (v <= 4) return "douleur modérée";
  if (v <= 6) return "douleur gênante";
  if (v <= 8) return "douleur forte";
  return "douleur très forte";
}

/** « 1 jour d'arrêt », « 3 jours d'arrêt », « aucun jour d'arrêt ». */
export function daysOffReading(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  const n = Math.round(days);
  if (n === 0) return "aucun jour d'arrêt";
  return `${n} jour${n > 1 ? "s" : ""} d'arrêt`;
}

const MONTHS_FR = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];

/** Date ISO en « 12 mar 2026 », sans passer par `Date` donc sans dérive de fuseau. */
export function fmtInjuryDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS_FR[m - 1];
  return month ? `${d} ${month} ${y}` : null;
}

// ── Affichage ────────────────────────────────────────────────────────────────

export interface InjuryFact {
  l: string;
  v: string;
}

/**
 * Détail d'une blessure, dans l'ordre d'intérêt du coach : d'abord ce qui change
 * la séance de demain (douleur, impact), ensuite ce qui explique (type,
 * mécanisme, contexte), enfin le suivi (arrêt, avis médical, retour).
 * Les champs vides sont absents : rien d'inventé, rien de « non précisé ».
 */
export function injuryFacts(e: InjuryLike): InjuryFact[] {
  if (e.kind !== "blessure") return [];
  const out: InjuryFact[] = [];
  const push = (l: string, v: string | null | undefined) => { if (v) out.push({ l, v }); };

  const pain = painValue(e.pain_level);
  push("Douleur", pain === null ? null : `${pain}/10 — ${painReading(pain)}`);
  push("Impact sur l'entraînement", e.training_impact ? TRAINING_IMPACT_LABEL[e.training_impact] : null);
  push("Type", e.injury_type ? INJURY_TYPE_LABEL[e.injury_type] : null);
  push("Mécanisme", e.mechanism ? INJURY_MECHANISM_LABEL[e.mechanism] : null);
  push("Survenue", e.context ? INJURY_CONTEXT_LABEL[e.context] : null);
  push("Arrêt", daysOffReading(e.days_off));
  push("Vu par", e.diagnosed_by ? DIAGNOSED_BY_LABEL[e.diagnosed_by] : null);
  push("Retour prévu", fmtInjuryDate(e.return_date));

  return out;
}

/**
 * Résumé d'une blessure en une ligne, pour les bandeaux et les badges :
 * « Cheville gauche · douleur forte · Arrêt partiel ».
 */
export function injurySummary(e: InjuryLike): string {
  const parts = [
    e.zone?.trim() || e.title?.trim() || "Zone non précisée",
    painReading(e.pain_level),
    e.training_impact ? TRAINING_IMPACT_LABEL[e.training_impact] : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

// ── Saisie ───────────────────────────────────────────────────────────────────

/** Les seuls champs que le formulaire de détail pilote. */
export interface InjuryDetail {
  injury_type: InjuryType | null;
  mechanism: InjuryMechanism | null;
  context: InjuryContext | null;
  pain_level: number | null;
  training_impact: TrainingImpact | null;
  days_off: number | null;
  diagnosed_by: DiagnosedBy | null;
  return_date: string | null;
}

export const EMPTY_INJURY_DETAIL: InjuryDetail = {
  injury_type: null, mechanism: null, context: null, pain_level: null,
  training_impact: null, days_off: null, diagnosed_by: null, return_date: null,
};

/** Détail d'une ligne existante, ou tout à null : le formulaire part d'un état connu. */
export function injuryDetailOf(e: Partial<InjuryDetail> | null | undefined): InjuryDetail {
  if (!e) return { ...EMPTY_INJURY_DETAIL };
  return {
    injury_type: e.injury_type ?? null,
    mechanism: e.mechanism ?? null,
    context: e.context ?? null,
    pain_level: painValue(e.pain_level),
    training_impact: e.training_impact ?? null,
    days_off: e.days_off ?? null,
    diagnosed_by: e.diagnosed_by ?? null,
    return_date: e.return_date || null,
  };
}

/**
 * Détail à enregistrer. Hors blessure, tout repart à null : passer une ligne de
 * « blessure » à « opération » ne doit pas laisser derrière lui un mécanisme de
 * blessure que plus aucun écran n'affiche.
 */
export function injuryDetailForSave(kind: MedicalEntryKind, d: InjuryDetail): InjuryDetail {
  if (kind !== "blessure") return { ...EMPTY_INJURY_DETAIL };
  return {
    ...injuryDetailOf(d),
    // Un arrêt négatif est refusé par la contrainte SQL : autant ne rien envoyer.
    days_off: d.days_off != null && Number.isFinite(d.days_off) && d.days_off >= 0
      ? Math.round(d.days_off)
      : null,
  };
}
