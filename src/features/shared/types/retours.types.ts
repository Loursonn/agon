// Types pour les retours hebdomadaires enrichis

// ── Nutrition ─────────────────────────────────────────────────────────────────
// Stockée dans `app_data` (`asp:nutrition_strategy`, `asp:nutrition_log`), lue
// via `src/api/nutrition.ts`. Les écarts de la stratégie sont en % signés.
import type { NutritionDay, NutritionStrategy } from "@/lib/nutrition";
export type { NutritionDay, NutritionStrategy };

export interface WorkoutExerciseComment {
  id: string;
  workout_log_id: string;
  exercise_id: string | null;
  exercise_name: string;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface PerformedSet {
  set_num: number;
  kg: number | null;
  reps: number | null;
  rir: number | null;
  method: string | null;
  done: boolean;
}

export interface PerformedExercise {
  exercise_id: string;
  exercise_name: string;
  sets: PerformedSet[];
}

export interface PlannedExercise {
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps_range: string | null;
  /** Isométrie : reps_range est une durée (« 30 s ») */
  is_iso?: boolean;
  kg: number | null;
  rir: number | null;
  method: string | null;
}

// ── Type wellness d'une journée ───────────────────────────────────────────────

export interface WellnessDay {
  /** Score recalculé (`wellnessScore`) ; null si une note manque — affiché « — ». */
  score:      number | null;
  fatigue:    number | null;
  sommeil:    number | null;
  stress:     number | null;
  energie:    number | null;
  doms?:      number | null;
  /** Réponse « blessé / malade » du wellness : le commentaire, sinon null. */
  injuryNote?: string | null;
  domsZones?: string[];
  /** Zones notées 1 légère / 2 marquée / 3 intense (wellness depuis le 12/11). */
  domsLevels?: Record<string, 1 | 2 | 3>;
  envie?: number | null;
  pain?: number | null;
  sick?: boolean | null;
  /** Séance de la veille à laquelle les courbatures sont rattachées. */
  domsWorkout?: { id: string; name: string | null } | null;
  domsPoints?: Array<{ id: string; x: number; y: number; side: "front" | "back"; intensity?: number }>;
  coucher?:   { h: number; m: number };
  reveil?:    { h: number; m: number };
  sleepDur?:  number;  // heures
}

// ── Séance énergétique ────────────────────────────────────────────────────────

export interface EnergyStepLog {
  status: "done" | "partial";
  comment: string;
}

export interface EnergySessionDetail {
  id: string;
  session_label: string;
  date: string;
  /** assignment status (planned/completed/missed/skipped) */
  status: string;
  completed: boolean;
  partial: boolean;
  duration_min: number | null;   // energy_sessions.total_duration_s / 60 (planned)
  actual_duration_min: number | null; // athlete-reported actual duration
  distance_m: number | null;     // energy_sessions.total_distance_m
  session_kind: string | null;   // energy_sessions.session_kind
  note: string | null;           // plain-text note (coach or athlete)
  rpe_score: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intervals: any[];              // EnergyStep[] — planned structure
  step_log: Record<string, EnergyStepLog> | null; // per-step completion
  block_logs: Record<string, { done: boolean; note?: string }> | null;
  activity_url: string | null;
  /** Sortie de montre rattachée (posée par la page Retours via `useRunningVolume`) */
  watch_run?: import('@/lib/watchRunMatching').RunMatch | null;
}

// ── Activité libre ────────────────────────────────────────────────────────────

export interface FreeActivityDetail {
  id: string;
  name: string;
  date: string;
  sport?: string;
  sportEmoji?: string;
  duration?: number;  // minutes
  intensity?: number; // 1-5
  note?: string;
}

// ── WeeklyRetourData ──────────────────────────────────────────────────────────

export interface WeeklyRetourData {
  week_number: number;
  start_date: string;
  end_date: string;

  workouts: {
    id: string;
    session_name: string;
    scheduled_date: string;
    status: 'planned' | 'in_progress' | 'completed' | 'missed' | 'skipped';
    duration_s: number | null;
    notes: string | null;
    rpe_score: number | null;
    wellness_day: number | null;
    exercise_comments: WorkoutExerciseComment[];
    planned_exercises: PlannedExercise[];
    performed_exercises: PerformedExercise[];
    athlete_session_comment: string | null;
    athlete_exercise_comments: Record<string, string>;
    athlete_forme: number | null;
    /** Séance de programmation (asp:prog) */
    session_id: string | null;
    /** Rang de la séance : n-ième fois qu'elle est planifiée (null si inconnu) */
    occurrence: number | null;
    /** Retours vidéo demandés par le coach sur cette séance */
    video_requests: VideoRequestStatus[];
  }[];

  energy_sessions: EnergySessionDetail[];

  test_sessions: {
    id: string;
    title: string;
    type: string;
    date: string;
    completed: boolean;
    results_note: string | null;
    results_structured: Record<string, unknown> | null;
    coach_validated: boolean | null;
  }[];

  competitions: {
    id: string;
    name: string;
    type: string;
    date: string;
    location: string | null;
    athlete_comment: string | null;
    priority: 'A' | 'B' | 'C' | null;
  }[];

  avg_wellness: number | null;
  daily_wellness: Record<string, WellnessDay | null>;
  free_activities: FreeActivityDetail[];
  nutrition_strategy: NutritionStrategy | null;
  nutrition_logs: NutritionDay[];
}

export interface WeekComparisonData {
  current_week: WeeklyRetourData;
  previous_week: WeeklyRetourData | null;
}

// ── Types mensuel ─────────────────────────────────────────────────────────────

export interface DailyData {
  date: string;
  wellness: WellnessDay | null;
  workouts_completed: number;
  has_competition: boolean;
  has_test: boolean;
  free_activity_count?: number;
}

export interface WorkoutDetail {
  id: string;
  session_name: string;
  scheduled_date: string;
  status: 'planned' | 'in_progress' | 'completed' | 'missed' | 'skipped';
  session_type: 'muscu' | 'specific';
  duration_s: number | null;
  notes: string | null;
  rpe_score: number | null;
  wellness_day: number | null;
  planned_exercises: PlannedExercise[];
  performed_exercises: PerformedExercise[];
  exercise_comments: WorkoutExerciseComment[];
  athlete_session_comment: string | null;
  athlete_exercise_comments: Record<string, string>;
  athlete_forme: number | null;
  /** Séance de programmation (asp:prog) */
  session_id: string | null;
  /** Rang de la séance : n-ième fois qu'elle est planifiée (null si inconnu) */
  occurrence: number | null;
  /** Retours vidéo demandés par le coach sur cette séance */
  video_requests: VideoRequestStatus[];
}

/** Retour vidéo demandé sur un exercice + suivi de l'athlète. */
export interface VideoRequestStatus {
  exercise_id: string;
  exercise_name: string;
  note: string | null;
  sent: boolean;
}

export interface TestDetail {
  id: string;
  title: string;
  type: string;
  date: string;
  completed: boolean;
  results_note: string | null;
  results_structured: Record<string, unknown> | null;
  coach_validated: boolean | null;
}

export interface CompetitionDetail {
  id: string;
  name: string;
  type: string;
  date: string;
  location: string | null;
  athlete_comment: string | null;
  priority: 'A' | 'B' | 'C' | null;
}

export interface MonthlyRetourData {
  month: string;          // "yyyy-MM"
  start_date: string;
  end_date: string;
  avg_wellness: number | null;
  workouts_completed: number;
  workouts_total: number;
  workouts_by_type: { muscu: number; specific: number; energy: number };
  tests_completed: number;
  daily_data: Record<string, DailyData>;
  workouts: WorkoutDetail[];
  energy_sessions: EnergySessionDetail[];
  test_sessions: TestDetail[];
  competitions: CompetitionDetail[];
  free_activities: FreeActivityDetail[];
  nutrition_strategy: NutritionStrategy | null;
  nutrition_logs: NutritionDay[];
}
