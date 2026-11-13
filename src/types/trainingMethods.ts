/**
 * Types pour le système de méthodes d'entraînement paramétrables.
 *
 * SCOPE SET
 * La méthode s'applique à UN set précis parmi les sets classiques d'un exercice.
 * Les autres sets restent en format classique (reps / charge / RIR).
 * Le coach choisit sur quel(s) numéro(s) de set la méthode s'applique lors de
 * l'édition de l'exercice (ex: "appliquer sur le set 3 sur 4").
 *
 * SCOPE EXERCISE
 * La méthode remplace entièrement les sets classiques de l'exercice.
 * Plus de saisie set-by-set standard : tout le pattern est défini par la méthode.
 */

// ─── Weekly protocol ─────────────────────────────────────────────────────────

export interface FullWeekConfig {
  week: number;
  config: MethodConfig;
}

// ─── Set scope ────────────────────────────────────────────────────────────────

export interface SetMethodConfig {
  scope: 'set'
  sub_sets: {
    count: {
      type: 'fixed' | 'range'
      value?: number        // si fixed
      min?: number          // si range
      max?: number          // si range
    }
    reps: {
      type: 'fixed' | 'decreasing' | 'increasing' | 'amrap' | 'custom'
      value?: number        // si fixed
      pattern?: number[]    // si custom, ex: [5,4,3,2,1]
    }
    rest_intra: {
      type: 'free' | 'fixed'
      seconds?: number      // si fixed
    }
  }
  load: {
    type: 'same' | 'free' | 'decreasing_pct' | 'increasing_pct' | 'custom'
    pct_change?: number     // % de variation par sous-série (decreasing/increasing)
    values?: number[]       // valeur individuelle par sous-série si custom
    values_unit?: 'pct'    // si absent = valeur absolue ; 'pct' = % du 1RM auto
    reference?: string      // charge de référence texte libre (ex: "80%", "75kg")
  }
  rir_required: boolean
  weekly_configs?: FullWeekConfig[]
}

// ─── Exercise scope ───────────────────────────────────────────────────────────

export interface ExerciseMethodConfig {
  scope: 'exercise'
  sets: {
    count: number
  }
  reps: {
    type: 'fixed' | 'ascending' | 'descending' | 'custom'
    value?: number          // si fixed
    pattern?: number[]      // si custom, ex: [3,4,5,6,7]
  }
  rest_between: {
    type: 'free' | 'fixed' | 'variable'
    seconds?: number        // si fixed
    min_s?: number          // si variable
    max_s?: number          // si variable
  }
  load: {
    type: 'same' | 'ascending' | 'descending' | 'custom'
    /** Seulement si type = 'custom' et mode = 'pct_1rm'.
     *  Le 1RM est récupéré automatiquement depuis les PR de l'athlète à l'exécution. */
    mode?: 'pct_1rm'
    /** @deprecated — plus utilisé. Le 1RM vient des pr_logs à l'exécution. */
    rm_kg?: number
    /** % du 1RM cible par série (ex: 75) */
    pct_of_1rm?: number
    /** Valeurs explicites par série (type = 'custom' et mode != 'pct_1rm') */
    values?: number[]
    /** 'pct' = les valeurs sont des % du 1RM auto ; absent = valeur absolue */
    values_unit?: 'pct'
    /** Charge de référence en texte libre (ex : "75kg"), affichée dans l'aperçu */
    reference?: string
  }
  tempo?: {
    eccentric_s?: number
    pause_s?: number
    concentric_s?: number
  }
  rir_required: boolean
  weekly_configs?: FullWeekConfig[]
}

// ─── Classic scope ────────────────────────────────────────────────────────────

/**
 * SCOPE CLASSIC
 * Séries classiques avec fourchette de reps (ex: 4×10-12).
 * Format le plus simple — base de tout programme de musculation.
 */
export interface ClassicMethodConfig {
  scope: 'classic'
  sets: { count: number }
  reps: {
    type: 'fixed' | 'range' | 'amrap'
    value?: number    // si fixed
    min?: number      // si range
    max?: number      // si range
  }
  rest_between: {
    type: 'free' | 'fixed' | 'variable'
    seconds?: number
    min_s?: number
    max_s?: number
  }
  load: {
    type: 'same' | 'ascending' | 'descending' | 'custom'
    pct_change?: number
    values?: number[]
    values_unit?: 'pct'  // si absent = valeur absolue ; 'pct' = % du 1RM auto
    reference?: string   // ex: "80%", "75kg", "RPE 8" — texte libre
  }
  rir_required: boolean
  weekly_configs?: FullWeekConfig[]
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type MethodConfig = SetMethodConfig | ExerciseMethodConfig | ClassicMethodConfig

// ─── Entité BDD ───────────────────────────────────────────────────────────────

/** Catégorie libre — saisie par le coach, pas d'enum fixe */
export type MethodCategory = string
export type MethodScope    = 'set' | 'exercise' | 'classic'

export interface TrainingMethod {
  id: string
  name: string
  description?: string
  scope: MethodScope
  category: MethodCategory
  config: MethodConfig
  is_official: boolean
  created_by?: string
  tags: string[]
  created_at: string
  updated_at: string
}

// ─── Attachment exercice ──────────────────────────────────────────────────────

/**
 * Données stockées sur l'exercice (dans le JSONB de la séance)
 * quand une méthode est attachée.
 */
export interface MethodAttachment {
  method_id: string
  scope: MethodScope
  /** Seulement pour scope='set' : numéros de sets concernés (1-indexed).
   *  ex: [3] = uniquement le 3e set | [3,4] = les deux derniers sets sur 4 */
  applied_to_sets?: number[]
  /** Overrides éventuels de config pour cet exercice précis */
  config_override?: Partial<MethodConfig>
  /** Config complète stockée au moment de l'attachment — permet de générer les
   *  rows sous-séries côté athlète sans re-fetcher la méthode depuis Supabase. */
  config?: MethodConfig
  /** Charge de référence capturée depuis la config au moment de l'attachment.
   *  Permet d'afficher le calcul (ex: "80%" + kg exercice = poids cible) sans
   *  re-fetcher la méthode. Format texte libre : "80%", "75kg", "RPE 8"… */
  reference?: string
  /** Texte de prescription généré au moment de l'attachment (ex: "4 × 10-12 | récup 90s | charge identique").
   *  Affiché côté coach et athlète sans re-fetcher la méthode. */
  prescription?: string
  /** Nom de la méthode capturé au moment de l'attachment. */
  method_name?: string
}

// ─── Form values (MethodBuilder) ─────────────────────────────────────────────

export interface MethodFormValues {
  // Étape 1
  name: string
  description: string
  scope: MethodScope
  category: string
  tags: string[]

  // Étape 2 — Set scope
  set_sub_sets_count_type: 'fixed' | 'range'
  set_sub_sets_count_value: number
  set_sub_sets_count_min: number
  set_sub_sets_count_max: number
  set_reps_type: 'fixed' | 'decreasing' | 'increasing' | 'amrap' | 'custom'
  set_reps_value: number
  set_reps_pattern: string   // "5,4,3,2,1" stringifié
  set_rest_intra_type: 'free' | 'fixed'
  set_rest_intra_seconds: number
  set_load_type: 'same' | 'free' | 'decreasing_pct' | 'increasing_pct' | 'custom'
  set_load_pct_change: number
  set_load_custom_values: string   // "90,85,92.5" — une valeur par sous-série
  set_load_values_unit: 'kg' | 'pct'
  set_load_reference: string       // texte libre : "80%", "75kg", "RPE 8"…
  set_rir_required: boolean

  // Étape 2 — Exercise scope
  ex_sets_count: number
  ex_reps_type: 'fixed' | 'ascending' | 'descending' | 'custom'
  ex_reps_value: number
  ex_reps_pattern: string    // "3,4,5,6,7" stringifié
  ex_rest_type: 'free' | 'fixed' | 'variable'
  ex_rest_seconds: number
  ex_rest_min_s: number
  ex_rest_max_s: number
  ex_load_type: 'same' | 'ascending' | 'descending' | 'custom'
  ex_load_1rm_mode: boolean   // true = % du 1RM auto ; false = valeurs par série
  ex_load_values: string      // valeurs par série (comma-separated), ex: "80,85,90"
  ex_load_values_unit: 'kg' | 'pct'
  ex_load_pct_1rm: number     // % du 1RM cible (1RM auto-récupéré depuis les PR)
  ex_tempo_enabled: boolean
  ex_tempo_eccentric: number
  ex_tempo_pause: number
  ex_tempo_concentric: number
  ex_rir_required: boolean

  // Étape 2 — Classic scope
  cl_sets_count: number
  cl_reps_type: 'fixed' | 'range' | 'amrap'
  cl_reps_value: number
  cl_reps_min: number
  cl_reps_max: number
  cl_rest_type: 'free' | 'fixed' | 'variable'
  cl_rest_seconds: number
  cl_rest_min_s: number
  cl_rest_max_s: number
  cl_load_type: 'same' | 'ascending' | 'descending' | 'custom'
  cl_load_pct_change: number
  cl_load_custom_values: string
  cl_load_values_unit: 'kg' | 'pct'
  cl_load_reference: string
  cl_rir_required: boolean
}
