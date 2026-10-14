// ─── Enums ────────────────────────────────────────────────────────────────────

export type RoadmapPhaseStatus = 'planned' | 'in_progress' | 'shipped'
export type RoadmapItemStatus  = 'idea' | 'backlog' | 'planned' | 'in_progress' | 'shipped'
export type RoadmapCategory    = 'coach' | 'athlete' | 'planning' | 'nutrition' | 'infra' | 'ux'
export type RoadmapPriority    = 'P0' | 'P1' | 'P2' | 'P3'

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface RoadmapPhase {
  id:          string
  name:        string
  description: string | null
  quarter:     string           // ex: "Q3 2026"
  status:      RoadmapPhaseStatus
  sort_order:  number
  created_by:  string | null
  created_at:  string
  updated_at:  string
}

export interface RoadmapItem {
  id:          string
  phase_id:    string | null
  title:       string
  description: string | null
  category:    RoadmapCategory
  priority:    RoadmapPriority
  status:      RoadmapItemStatus
  sort_order:  number
  created_by:  string | null
  created_at:  string
  updated_at:  string
  // Client-side join
  vote_count?: number
  user_voted?: boolean
}

// ─── Labels / colors ──────────────────────────────────────────────────────────

export const PHASE_STATUS_LABEL: Record<RoadmapPhaseStatus, string> = {
  planned:     'Planifiée',
  in_progress: 'En cours',
  shipped:     'Livrée',
}

export const ITEM_STATUS_LABEL: Record<RoadmapItemStatus, string> = {
  idea:        'Idée',
  backlog:     'Backlog',
  planned:     'Planifié',
  in_progress: 'En cours',
  shipped:     'Livré',
}

export const ITEM_STATUS_COLOR: Record<RoadmapItemStatus, string> = {
  idea:        '#7D7468',
  backlog:     '#60a5fa',
  planned:     '#facc15',
  in_progress: '#f97316',
  shipped:     '#22c55e',
}

export const CATEGORY_LABEL: Record<RoadmapCategory, string> = {
  coach:     'Coach',
  athlete:   'Athlète',
  planning:  'Planning',
  nutrition: 'Nutrition',
  infra:     'Infra',
  ux:        'UX',
}

export const CATEGORY_COLOR: Record<RoadmapCategory, string> = {
  coach:     '#FFC933',
  athlete:   '#22c55e',
  planning:  '#3b82f6',
  nutrition: '#f97316',
  infra:     '#6b7280',
  ux:        '#ec4899',
}

export const PRIORITY_LABEL: Record<RoadmapPriority, string> = {
  P0: 'P0 – Critique',
  P1: 'P1 – Haute',
  P2: 'P2 – Normale',
  P3: 'P3 – Basse',
}

export const PRIORITY_COLOR: Record<RoadmapPriority, string> = {
  P0: '#ef4444',
  P1: '#f97316',
  P2: '#facc15',
  P3: '#6b7280',
}

export const PHASE_STATUS_COLOR: Record<RoadmapPhaseStatus, string> = {
  planned:     '#6b7280',
  in_progress: '#f97316',
  shipped:     '#22c55e',
}
