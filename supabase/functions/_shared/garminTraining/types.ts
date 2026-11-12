/**
 * Training API Garmin (V2) : forme des séances envoyées, et forme minimale des
 * séances Agon lues pour les traduire.
 *
 * Les types Agon sont redéclarés ici en structurel (le code partagé n'importe
 * jamais `src/`) : ils sont compatibles avec `src/types/energy.ts`,
 * `src/types/specific.ts` et `programmation/types.ts`.
 */

// ── Garmin ──────────────────────────────────────────────────────────────────

export type GarminSport = "RUNNING" | "CYCLING" | "LAP_SWIMMING" | "STRENGTH_TRAINING" | "CARDIO_TRAINING";

export type GarminIntensity = "REST" | "WARMUP" | "COOLDOWN" | "RECOVERY" | "ACTIVE" | "INTERVAL";

export type GarminDurationType = "TIME" | "DISTANCE" | "CALORIES" | "OPEN" | "REPS" | "FIXED_REST";

export type GarminTargetType = "HEART_RATE" | "PACE" | "SPEED" | "POWER" | "CADENCE" | "OPEN";

export interface GarminWorkoutStep {
  type: "WorkoutStep";
  stepOrder: number;
  intensity: GarminIntensity;
  description: string | null;
  durationType: GarminDurationType;
  durationValue: number | null;
  durationValueType: "METER" | null;
  targetType: GarminTargetType | null;
  targetValue: null;
  targetValueLow: number | null;
  targetValueHigh: number | null;
  targetValueType: null;
  secondaryTargetType: null;
  secondaryTargetValue: null;
  secondaryTargetValueLow: null;
  secondaryTargetValueHigh: null;
  secondaryTargetValueType: null;
  strokeType: null;
  drillType: null;
  equipmentType: null;
  exerciseCategory: string | null;
  exerciseName: string | null;
  weightValue: number | null;
  weightDisplayUnit: "KILOGRAM" | null;
}

export interface GarminRepeatStep {
  type: "WorkoutRepeatStep";
  stepOrder: number;
  repeatType: "REPEAT_UNTIL_STEPS_CMPLT";
  repeatValue: number;
  skipLastRestStep: boolean;
  steps: GarminStep[];
}

export type GarminStep = GarminWorkoutStep | GarminRepeatStep;

export interface GarminSegment {
  segmentOrder: 1;
  sport: GarminSport;
  poolLength: null;
  poolLengthUnit: null;
  steps: GarminStep[];
}

export interface GarminWorkout {
  workoutName: string;
  description: string | null;
  sport: GarminSport;
  poolLength: null;
  poolLengthUnit: null;
  workoutProvider: string;
  workoutSourceId: string;
  isSessionTransitionEnabled: false;
  segments: [GarminSegment];
}

/** Résultat d'une traduction : la séance, ou la raison pour laquelle elle ne part pas. */
export type TranslateResult =
  | { ok: true; workout: GarminWorkout; warnings: string[] }
  | { ok: false; reason: string };

// ── Contexte athlète (tout part d'Agon) ─────────────────────────────────────

export interface AthleteTrainingContext {
  /** Bornes basses des zones FC 2..N (bpm) valides à la date de la séance ; null = aucune. */
  hrZoneBounds: number[] | null;
  /** Références actives (`VMA`, `FCmax`, `FTP`, perso…) avec leur unité. */
  refs: Record<string, { value: number; unit: string | null }>;
}

// ── Agon : énergie / spécifique ─────────────────────────────────────────────

export type AgonTarget =
  | { kind: "none" }
  | { kind: "hr_zone"; zone: number }
  | { kind: "hr_pct"; min: number; max: number }
  | { kind: "hr_bpm"; min: number; max: number }
  | { kind: "pace"; min_s_per_unit?: number; max_s_per_unit?: number; min?: number; max?: number; unit?: string }
  | { kind: "pace_test_pct"; test_metric: string; min: number; max: number }
  | { kind: "power"; min: number; max: number }
  | { kind: "power_test_pct"; test_metric: string; min: number; max: number }
  | { kind: "cadence"; min: number; max: number; unit?: string }
  | { kind: "x_per_y"; x_kind: string; y_kind: string; x_value: number; y_value: number }
  | { kind: "text"; value: string };

export type AgonRole = "warmup" | "work" | "recovery" | "rest" | "cooldown" | "open";

export interface AgonDuration {
  kind: "time" | "distance" | "calories" | "lap_button";
  value?: number;
}

export interface AgonInterval {
  type: "interval";
  role: AgonRole;
  duration: AgonDuration;
  target: AgonTarget;
  equipment?: string;
  notes?: string;
}

export interface AgonExerciseStep {
  type: "exercise";
  role: AgonRole;
  exercise_name: string;
  reps_min?: number;
  reps_max?: number;
  weight_kg?: number;
  weight_unit?: "kg" | "bw" | "pct_rm";
  duration?: AgonDuration;
  target: AgonTarget;
  notes?: string;
}

export interface AgonGroup {
  type: "group";
  role: AgonRole;
  repeat: number;
  children: AgonEnergyStep[];
  rest_between?: AgonInterval;
  departure_every_s?: number;
  instructions?: string;
}

export type AgonEnergyStep = AgonInterval | AgonExerciseStep | AgonGroup;

export interface AgonClassiqueItem {
  name: string;
  prescription?: string;
  rest?: string;
  notes?: string;
}

export type AgonSpecificBlock =
  | { kind?: "classique"; title: string; instructions?: string; items: AgonClassiqueItem[] }
  | { kind: "wod"; title: string; instructions?: string; steps: AgonEnergyStep[] };

export interface AgonEnergySession {
  name: string;
  session_kind: string;
  /** Sport choisi par le coach (`course`, `velo`, `natation`, `rameur`, `autre`) ; null = course. */
  modality: string | null;
  format?: "wod" | "classique" | null;
  intervals: AgonEnergyStep[];
  classique_structure?: { blocks: AgonSpecificBlock[] } | null;
  notes?: string | null;
}

// ── Agon : musculation (paramètres déjà résolus pour l'occurrence) ──────────

export interface ResolvedSet {
  /** Répétitions, ou secondes de maintien si `iso`. */
  reps: number | null;
  repsMax: number | null;
  iso: boolean;
  /** Charge en kg calculée par Agon (kg, %RM × 1RM) ; null = sans charge connue. */
  kg: number | null;
  /** Consigne de charge quand elle n'a pas pu être convertie (« 75 %RM », « Poids du corps »). */
  loadText: string | null;
  rir: number | null;
  tempo: string | null;
}

export interface ResolvedStrengthExercise {
  name: string;
  garmin: { category: string; name: string } | null;
  mode: "classique" | "methode" | "libre";
  libreText?: string | null;
  comment?: string | null;
  methodName?: string | null;
  cluster?: { reps: number[]; restS: number } | null;
  supersetWithNext: boolean;
  sets: ResolvedSet[];
}

export interface ResolvedStrengthBloc {
  name: string;
  category?: string | null;
  instructions?: string | null;
  /** Repos entre séries (s) ; null = libre (bouton Tour). */
  restS: number | null;
  /** Départ toutes les N s (consigne affichée). */
  departS: number | null;
  exercises: ResolvedStrengthExercise[];
}

export interface ResolvedStrengthSession {
  name: string;
  blocs: ResolvedStrengthBloc[];
}
