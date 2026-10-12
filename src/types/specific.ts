// ─────────────────────────────────────────────────────────────────────────────
// Types pour la Banque Spécifique : référentiels Sport / Qualité physique,
// format Classique (builder par blocs) et banque de blocs spécifiques.
// Le format WOD réutilise EnergyStep[] (voir @/types/energy).
// ─────────────────────────────────────────────────────────────────────────────

// ── Référentiels ──────────────────────────────────────────────────────────────

export interface SpecificSport {
  id: string;
  name: string;
  slug: string;
  /** Nom d'icône lucide-react (ex. "Flame") */
  icon: string | null;
  /** Couleur hex du sport (badges, rail) */
  color: string | null;
  /** NULL = sport global seedé, sinon custom du coach */
  coach_id: string | null;
  is_default: boolean;
  created_at: string;
}

export interface PhysicalQuality {
  id: string;
  name: string;
  slug: string;
  coach_id: string | null;
  is_default: boolean;
  created_at: string;
}

// ── Format par blocs (mix Classique / WOD) ───────────────────────────────────

export type BlockKind = 'classique' | 'wod';

export interface ClassiqueItem {
  id: string;
  /** Nom affiché : exercice de la banque ou consigne libre */
  name: string;
  /** Lien vers la banque d'exercices (table exercises) — absent = consigne libre */
  exercise_id?: string;
  /** Vidéo de démonstration (exercises.youtube_id) pour la vue athlète */
  youtube_id?: string;
  /** Prescription libre : "4x30m", "5 séries · 8 reps", "3'" */
  prescription?: string;
  rest?: string;
  notes?: string;
}

export interface ClassiqueBlock {
  id: string;
  title: string;
  /** Absent = 'classique' (legacy) */
  kind?: 'classique';
  /** Renseigné si importé depuis specific_blocks */
  sourceBlockId?: string;
  /** Consignes du bloc, affichées à l'athlète sous le titre */
  instructions?: string;
  items: ClassiqueItem[];
}

/** Bloc WOD : intervalles construits avec le builder existant (EnergyStep[]). */
export interface WodBlock {
  id: string;
  title: string;
  kind: 'wod';
  sourceBlockId?: string;
  /** Consignes du bloc, affichées à l'athlète sous le titre */
  instructions?: string;
  steps: import('./energy').EnergyStep[];
}

export type SessionBlock = ClassiqueBlock | WodBlock;

export function isWodBlock(b: SessionBlock): b is WodBlock {
  return b.kind === 'wod';
}

export interface ClassiqueStructure {
  blocks: SessionBlock[];
}

/** 'wod' = legacy intervalles pleine page ; 'classique' = séance par blocs (mix possible) */
export type SessionFormat = 'wod' | 'classique';

// ── Banque de blocs spécifiques (privée par coach) ───────────────────────────

export interface SpecificBlockRow {
  id: string;
  coach_id: string;
  name: string;
  sport_id: string | null;
  quality_id: string | null;
  /** Contenu du bloc sans id/sourceBlockId. kind absent = classique. */
  content: {
    title: string;
    instructions?: string;
    kind?: BlockKind;
    items?: ClassiqueItem[];
    steps?: import('./energy').EnergyStep[];
  };
  created_at: string;
  updated_at: string;
}

export type CreateSpecificBlockInput = Omit<SpecificBlockRow, 'id' | 'created_at' | 'updated_at'>;
