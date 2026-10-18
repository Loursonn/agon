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
  created_at: string;
  updated_at: string;
  medical_attachments: MedicalAttachment[];
}

export type MedicalEntryInput = Pick<
  MedicalEntry,
  'kind' | 'title' | 'zone' | 'date' | 'diagnosis' | 'treatment' | 'status' | 'notes'
>;
