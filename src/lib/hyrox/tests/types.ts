/**
 * Types du moteur « Tests HYROX » (bilan d'entrée et retests).
 * TS pur : aucun import React, aucun accès réseau.
 */

export type Sex = "H" | "F";
export type HyroxCategory = "Open" | "Pro";

/** Source d'une note ou d'une sortie, affichée en petit tag. */
export type MetricSource =
  | "publiée"
  | "calée chrono"
  | "ma méthode"
  | "méthode vitesse critique / Riegel";

export interface AthleteTestProfile {
  sex: Sex;
  category: HyroxCategory;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
}

/** Une paire gauche / droite. */
export interface Sides {
  left?: number | null;
  right?: number | null;
}

/** Un effort de course maximal : durée (s), distance (m), FC moyenne et max (bpm). */
export interface RunEffort {
  duration_s?: number | null;
  distance_m?: number | null;
  hr_avg?: number | null;
  hr_max?: number | null;
}

/** Sled : 3 passages de 12,5 m à 80, 100 et 120 % de la charge de course. */
export interface SledProfileInputs {
  /** Temps (s) sur 12,5 m, dans l'ordre 80 / 100 / 120 %. */
  times_s: [number | null | undefined, number | null | undefined, number | null | undefined];
  /** Charges réellement poussées (kg). Par défaut : 80 / 100 / 120 % de la charge de course. */
  loads_kg?: [number | null | undefined, number | null | undefined, number | null | undefined];
}

/** Semaine 1 : 3 × 50 m à charge de course, temps de chaque tronçon de 12,5 m. */
export type SledWeek1Inputs = Array<Array<number | null | undefined>>;

/**
 * Données brutes de la semaine de bilan (S1 à S5 + semaine 1).
 * Tout est optionnel : un test non fait donne « — », jamais NaN.
 */
export interface HyroxTestInputs {
  // S1 Sauts, 12 min et 1200 m
  broad_jump_cm?: number | null;
  triple_broad_jump_cm?: number | null;
  run_12min?: RunEffort; // distance_m saisie, duration_s = 720
  run_1200m?: RunEffort; // duration_s saisi, distance_m = 1200
  // S2 Force du haut du corps et rameur
  strict_press?: { kg?: number | null; reps?: number | null };
  thruster?: { kg?: number | null; reps?: number | null };
  row_2000m_s?: number | null;
  // S3 Mobilité, 6 min et robustesse
  knee_to_wall_cm?: Sides;
  run_6min?: RunEffort; // distance_m saisie, duration_s = 360
  calf_raise_reps?: Sides;
  single_leg_bridge_reps?: Sides;
  single_leg_sit_to_stand_reps?: Sides;
  single_leg_hop_cm?: Sides;
  // S4 Sleds, SkiErg et suspension
  sled_push?: SledProfileInputs;
  sled_pull?: SledProfileInputs;
  ski_2000m_s?: number | null;
  dead_hang_s?: number | null;
  // S5 BBJ et wall balls
  bbj_80m?: { time_s?: number | null; jumps?: number | null };
  wall_balls_5min?: { per_minute?: Array<number | null | undefined>; total?: number | null; no_reps?: number | null };
  /** Effort ressenti /10 et FC à 1 min, par test (clé libre). */
  rpe?: Record<string, { rpe?: number | null; hr_1min?: number | null }>;
  // Optionnel
  vmax_kmh?: number | null;
  sprint_100m_s?: number | null;
  // Semaine 1 d'entraînement
  week1_sled_push?: SledWeek1Inputs;
  week1_sled_pull?: SledWeek1Inputs;
}

// ── Grilles et paramètres versionnés ─────────────────────────────────────────

export type AxisKey = "cardio" | "seuils" | "ergos" | "force" | "endf" | "puissance" | "grip" | "robustesse";

export type MetricKey =
  | "vma"
  | "cooper"
  | "cs"
  | "cs_vma"
  | "row_2000"
  | "ski_2000"
  | "press_rel"
  | "thruster_rel"
  | "wall_balls"
  | "sled_push_reserve"
  | "sled_pull_reserve"
  | "bbj_80"
  | "broad_jump"
  | "triple_ratio"
  | "hop_height"
  | "dead_hang"
  | "calf_raise"
  | "knee_to_wall"
  | "bridge"
  | "sit_to_stand";

/** Une ligne de grille (table hyrox_test_grids). */
export interface GridRow {
  metric_key: MetricKey;
  axis: AxisKey;
  /** null = les deux sexes. */
  sex: Sex | null;
  /** null = toutes catégories. */
  category: HyroxCategory | null;
  /** 4 bornes -> 5 niveaux. */
  thresholds: [number, number, number, number];
  /** higher : plus haut = mieux ; lower : plus bas = mieux (temps, % de charge max). */
  direction: "higher" | "lower";
  source: MetricSource;
  /** Poids dans la note de l'axe. */
  weight: number;
  notes?: string;
}

export interface ScoringParams {
  /** Coefficient VMA appliqué à la vitesse du 1200 m. */
  vma_from_1200_factor: number;
  /** Ajustement Cooper : à partir de from_age, bornes abaissées de per_decade_m par décennie au-delà de base_age. */
  cooper_age_adjust: { from_age: number; base_age: number; per_decade_m: number };
  /** Estimation du 1RM : kg × num / (den − reps), valable de 1 à max_reps reps. */
  one_rm: { num: number; den: number; max_reps: number };
  /** Robustesse : plafonds de la note d'axe. */
  robustness_caps: { asymmetry_below: number; asymmetry_cap: number; ktw_below_cm: number; ktw_cap: number; note1_cap: number; ktw_diff_flag_cm: number };
  /** Lecture du ratio thruster / press. */
  thruster_press_expected: [number, number];
  thruster_press_flags: [number, number];
}

export interface RunningParams {
  /** Seuil 1 = VC × f selon E. */
  s1_factor: { below_090: number; from_090_to_093: number; above_093: number };
  s1_e_bounds: [number, number];
  /** Décalage des 6 zones si E ≥ zone_shift_from_e. */
  zone_shift: number;
  zone_shift_from_e: number;
  /** Bornes des 6 zones (× VC) : Z1 bas, Z1/Z2, Z3/Z4, Z4/Z5, Z5/Z6. */
  zone_bounds: { z1_low: number; z1_z2: number; z3_z4: number; z4_z5: number; z5_z6: number };
  /** FC seuil = pente × chr_factor. */
  chr_factor: number;
  /** Zones FC coach (en part de la FC seuil). */
  hr_zone_bounds: [number, number, number, number];
  /** Zones athlète : Zone 1 sous hr_z1_max × FC seuil. */
  hr_z1_max: number;
  /** Matrice de profil : seuil de E et de Vmax (km/h). */
  profile_e: number;
  profile_vmax_kmh: number;
  profile_vmax_intermittent_kmh: number;
  /** Lecture texte de E (seuils vs vitesse). */
  e_reading_cut: number;
  /** Durée tenable : |E−1| minimal. */
  min_abs_e_minus_1: number;
  /** % de VC du tableau durée tenable. */
  pct_vc_table: number[];
}

export interface AxesParams {
  /** Seuils de gain, en part de l'écart de chrono. */
  gain_big: number;
  gain_medium: number;
  /** Note ≤ note_up : +1 cran ; note ≥ note_down : −1 cran. */
  note_up: number;
  note_down: number;
  /** Chrono visé déjà atteint : T > C − target_margin_s -> T = C − shift_s. */
  target_margin_s: number;
  shift_s: number;
  /** Niveau aux stations : ≥ strong = fortes, ≤ weak = faibles. */
  stations_strong: number;
  stations_weak: number;
  /** D′ type pour calculer la VC minimum du chrono visé. */
  standard_dprime_m: number;
  /** Prépa courte : compétition A à moins de N semaines. */
  short_prep_weeks: number;
  /** Âge à partir duquel robustesse en appoint + décharge systématique. */
  older_age: number;
  /** Roxzone : perte réelle si écart de top % ≥ rox_points et ratio > rox_ratio. */
  rox_points: number;
  rox_ratio: number;
}

/** Un jeu complet de paramètres versionnés (une version de grille). */
export interface GridSet {
  version: string;
  rows: GridRow[];
  scoring: ScoringParams;
  running: RunningParams;
  axes: AxesParams;
  rules: WorkAxisRule[];
}

// ── Règles d'axes de travail (table hyrox_work_axes_rules) ───────────────────

export type RuleStep = "sécurité" | "course" | "stations";

export type ConditionValue = number | { H: number; F: number };

export type RuleCondition =
  | { metric: string; op: "<" | "<=" | ">" | ">=" ; value: ConditionValue }
  | { metric: string; op: "<=_metric_minus"; other: string; value: number }
  | { all: RuleCondition[] }
  | { any: RuleCondition[] };

export interface WorkAxisRule {
  id: string;
  step: RuleStep;
  /** Groupe d'affichage (sleds, wall balls…). */
  group: string;
  condition: RuleCondition;
  axis: string;
  means: string;
  rationale: string;
  /** Seuil sans source : à recaler sur nos athlètes. */
  to_recalibrate?: boolean;
  active: boolean;
}
