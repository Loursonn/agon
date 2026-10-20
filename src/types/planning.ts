export type BlockType = 'macrocycle' | 'mesocycle' | 'cycle' | 'microcycle';
export type CompetitionType = 'competition' | 'match' | 'stage' | 'off' | 'autre';
export type CompetitionPriority = 'A' | 'B' | 'C';

/** Libellé du niveau d'une compétition : « Importance A », « Importance B »… */
export function priorityLabel(priority: string | null | undefined): string {
  return priority ? `Importance ${priority}` : '';
}

export interface Competition {
  id: string;
  coach_id: string;
  athlete_id: string;
  macrocycle_id?: string | null;
  name: string;
  type: CompetitionType;
  date: string;
  location: string | null;
  notes: string | null;
  priority: CompetitionPriority;
  athlete_comment?: string | null;
  created_at: string;
}

export type CompetitionInsert = Omit<Competition, 'id' | 'created_at' | 'athlete_comment'>;

/** Libellé du jour dans le planning (« Jour de compétition », « Jour de match »…) */
export function competitionDayLabel(type: string | null | undefined): string {
  if (type === 'match') return 'Jour de match';
  if (type === 'stage') return 'Stage';
  if (type === 'off') return 'Récup / Off';
  if (type === 'autre') return 'Événement';
  return 'Jour de compétition';
}

export const COMPETITION_META: Record<CompetitionType, { emoji: string; label: string; color: string }> = {
  competition: { emoji: 'CP', label: 'Compétition', color: '#F5A623' },
  match:       { emoji: 'MT', label: 'Match',        color: '#FF5A33' },
  stage:       { emoji: 'ST', label: 'Stage',        color: '#FFC933' },
  off:         { emoji: 'OF', label: 'Récup / Off',  color: '#66F03C' },
  autre:       { emoji: 'AU', label: 'Autre',         color: '#9194A0' },
};

export const BLOCK_COLORS = [
  '#FFC933', '#5AC8FA', '#66F03C', '#F5A623',
  '#FF5A33', '#FF6B9D', '#A78BFA', '#34D399',
];

// ── Life events ──────────────────────────────────────────────────────────────

export interface LifeEvent {
  id: string;
  athlete_id: string;
  date_start: string;
  date_end: string;
  title: string;
  created_at: string;
}

export type LifeEventInsert = Omit<LifeEvent, 'id' | 'created_at'>;

/** Default durations (in weeks) for each period level */
export const PERIOD_DEFAULTS: Record<BlockType, number> = {
  macrocycle: 52,  // 12 months
  mesocycle:  13,  // 3 months
  cycle:       4,  // 4 weeks
  microcycle:  1,  // 1 week
};
