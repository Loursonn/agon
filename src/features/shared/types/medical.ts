export interface SurgeryEntry {
  zone: string;
  date: string;
  details: string;
}

export interface PastInjuryEntry {
  zone: string;
  date: string;
  type: string;
  details: string;
}

export interface MedicalHistory {
  id: string;
  athlete_id: string;
  conditions: string;
  allergies: string;
  surgeries: SurgeryEntry[];
  past_injuries: PastInjuryEntry[];
  current_treatments: string;
  medical_notes: string;
  created_at: string;
  updated_at: string;
}

export type MedicalHistoryInput = Omit<MedicalHistory, 'id' | 'created_at' | 'updated_at'>;

// ── Antécédents détaillés (medical_entries + medical_attachments) ────────────

export type MedicalEntryKind = 'blessure' | 'operation' | 'pathologie' | 'autre';
export type MedicalEntryStatus = 'gueri' | 'en_cours';

export const MEDICAL_KIND_LABEL: Record<MedicalEntryKind, string> = {
  blessure:   'Blessure',
  operation:  'Opération',
  pathologie: 'Pathologie',
  autre:      'Autre',
};

export const MEDICAL_STATUS_LABEL: Record<MedicalEntryStatus, string> = {
  gueri:    'Guéri',
  en_cours: 'En cours',
};

// ── Détail d'une blessure ───────────────────────────────────────────────────
// Tous ces champs sont facultatifs et ne concernent que `kind = 'blessure'` :
// une opération n'a pas de mécanisme, une pathologie n'a pas de niveau de
// douleur. Une gêne doit pouvoir se déclarer sans en remplir un seul.

export type InjuryType = 'traumatique' | 'chronique_surmenage' | 'recidive';
export type InjuryMechanism = 'contact' | 'sans_contact' | 'chute' | 'geste_repete' | 'inconnu';
export type InjuryContext = 'entrainement' | 'competition' | 'hors_sport';
export type TrainingImpact = 'aucun' | 'adapte' | 'arret_partiel' | 'arret_total';
export type DiagnosedBy = 'personne' | 'medecin' | 'kine' | 'osteo' | 'autre';
export type DeclaredBy = 'athlete' | 'coach' | 'staff';

export const INJURY_TYPE_LABEL: Record<InjuryType, string> = {
  traumatique:         'Traumatique',
  chronique_surmenage: 'Chronique / surmenage',
  recidive:            'Récidive',
};

export const INJURY_MECHANISM_LABEL: Record<InjuryMechanism, string> = {
  contact:      'Contact',
  sans_contact: 'Sans contact',
  chute:        'Chute',
  geste_repete: 'Geste répété',
  inconnu:      'Je ne sais pas',
};

export const INJURY_CONTEXT_LABEL: Record<InjuryContext, string> = {
  entrainement: 'Entraînement',
  competition:  'Compétition',
  hors_sport:   'Hors sport',
};

export const TRAINING_IMPACT_LABEL: Record<TrainingImpact, string> = {
  aucun:         'Je m\'entraîne normalement',
  adapte:        'Je m\'entraîne adapté',
  arret_partiel: 'Arrêt partiel',
  arret_total:   'Arrêt total',
};

export const DIAGNOSED_BY_LABEL: Record<DiagnosedBy, string> = {
  personne: 'Personne pour l\'instant',
  medecin:  'Médecin',
  kine:     'Kiné',
  osteo:    'Ostéo',
  autre:    'Autre',
};

export const DECLARED_BY_LABEL: Record<DeclaredBy, string> = {
  athlete: 'Déclarée par l\'athlète',
  coach:   'Déclarée par le coach',
  staff:   'Saisie par un professionnel du staff',
};

/**
 * Texte affiché en haut de toute déclaration de blessure, mot pour mot le même
 * côté athlète et côté coach. C'est lui qui fait déclarer les gênes qu'on
 * tairait autrement : sans déclaration, pas d'ajustement possible.
 */
export const INJURY_DECLARE_INTRO =
  "Même une petite gêne compte. Une douleur légère ou un mini signal qui revient, c'est une info précieuse : "
  + "on ne change pas forcément tout ton programme, mais on le sait, on le surveille et on peut ajuster avant "
  + "que ça devienne une vraie blessure. Une blessure qu'on ne voit pas, on ne peut pas la gérer.";

export interface MedicalAttachment {
  id: string;
  entry_id: string;
  athlete_id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string;
  file_size: number | null;
  created_at: string;
}

export interface MedicalEntry {
  id: string;
  athlete_id: string;
  kind: MedicalEntryKind;
  title: string;
  zone: string | null;
  date: string | null;
  diagnosis: string | null;
  treatment: string | null;
  status: MedicalEntryStatus;
  notes: string | null;
  /** Détail blessure — null partout ailleurs, et null tant que l'athlète n'a rien précisé. */
  injury_type: InjuryType | null;
  mechanism: InjuryMechanism | null;
  context: InjuryContext | null;
  /** Douleur ressentie, de 0 à 10. */
  pain_level: number | null;
  training_impact: TrainingImpact | null;
  /** Jours d'arrêt déjà posés. */
  days_off: number | null;
  diagnosed_by: DiagnosedBy | null;
  /** Retour prévu ou effectif. */
  return_date: string | null;
  /** Côté d'où vient la déclaration — posé automatiquement à la création. */
  declared_by: DeclaredBy | null;
  /** Auteur de la saisie (null si compte supprimé). */
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  medical_attachments: MedicalAttachment[];
}

export type MedicalEntryInput = Pick<
  MedicalEntry,
  | 'kind' | 'title' | 'zone' | 'date' | 'diagnosis' | 'treatment' | 'status' | 'notes'
  | 'injury_type' | 'mechanism' | 'context' | 'pain_level' | 'training_impact'
  | 'days_off' | 'diagnosed_by' | 'return_date'
>;
