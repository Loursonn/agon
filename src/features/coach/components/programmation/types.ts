import type { FicheAttachment } from "@/features/shared/types/fiches"

export type ParamValue<T> =
  | { mode: 'global'; value: T }
  | { mode: 'par_serie'; values: T[] }

export interface ClusterConfig {
  nb_clusters: number
  reps: number[]  // per-cluster reps, e.g. [3,2,1] → "3+2+1"
  recup_sec: number
}

export interface ExerciceParams {
  nb_series: number
  cluster?: ClusterConfig
  reps: ParamValue<number>
  reps_max?: ParamValue<number | null>  // When set, creates a range (reps - reps_max)
  reps_mode: ParamValue<'EC' | 'iso'>
  charge_unit: '%RM' | 'kg' | 'PDC'
  charge: ParamValue<number | null>
  rir: ParamValue<number | null>
  tempo: ParamValue<string>
  manual_rm?: number | null  // Fictive 1RM when no real PR exists
}

export interface Exercice {
  id: string
  exercise_id: string
  exercise_name: string
  mode: 'classique' | 'methode' | 'libre'
  libre_text?: string  // mode 'libre': free-text instruction, no structured params
  methode_id?: string
  applied_to_sets?: number[]  // scope='set' methods: which set numbers (1-indexed) the method applies to
  sort_order: number
  multi_semaine?: boolean  // per-exercise override (only used when session multi_semaine is false)
  comment?: string  // Coach note/instruction for this exercise
  superset_with_next?: boolean  // Linked to the next exercise in the bloc (chain of 2+ = superset; rest after each full round)
  // If multi_semaine active (session OR exercise level): Record<weekNumber, ExerciceParams>; else ExerciceParams
  params: ExerciceParams | Record<string, ExerciceParams>
  /** Retour vidéo demandé, par n° de séance (une valeur vaut jusqu'à la suivante) */
  video_request?: Record<string, VideoRequest>
}

/** Demande de retour vidéo du coach sur un exercice. */
export interface VideoRequest {
  requested: boolean
  /** Consigne optionnelle (ex. « dernière série, vue de profil ») */
  note?: string
}

export const BLOC_CATEGORIES = ['Echauffement', 'Force', 'Hypertrophie', 'Explo/vitesse', 'Mixte', 'Cardio'] as const
export type BlocCategory = typeof BLOC_CATEGORIES[number]

export interface Bloc {
  id: string
  name: string
  color?: string
  category?: BlocCategory
  series_mode: 'libre' | 'fixe'
  series_count?: number
  timing_mode: 'libre' | 'depart' | 'repos'
  timing_depart_min?: number
  timing_depart_sec?: number
  timing_repos_min?: number
  timing_repos_sec?: number
  /** Consignes du bloc, affichées à l'athlète sous le titre */
  instructions?: string
  /** Fiches rattachées au bloc (variante possible par semaine) */
  fiches?: FicheAttachment[]
  // NO multi_semaine here anymore
  exercices: Exercice[]
  sort_order: number
}

export interface ProgSession {
  id: string
  name: string
  short: string
  day_of_week?: number  // 0=Mon...6=Sun
  recurrence: 'weekly' | 'once'
  multi_semaine: boolean
  nb_semaines?: number
  /** Fiches rattachées à la séance (variante possible par semaine) */
  fiches?: FicheAttachment[]
  blocs: Bloc[]
}

export function defaultExerciceParams(nb_series = 4): ExerciceParams {
  return {
    nb_series,
    reps: { mode: 'global', value: 8 },
    reps_mode: { mode: 'global', value: 'EC' },
    charge_unit: 'kg',
    charge: { mode: 'global', value: null },
    rir: { mode: 'global', value: 2 },
    tempo: { mode: 'global', value: '' },
  }
}
