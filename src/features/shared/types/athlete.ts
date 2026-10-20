import type { NutritionStrategy } from "@/lib/nutrition";
import type { MethodAttachment } from "@/types/trainingMethods";

// ─── Block & Session ─────────────────────────────────────────────────────────

export interface WeekConfig {
  kg?: number;
  pdc?: boolean;
  sets?: number;
  repsRange?: string;
  rir?: number;
  method?: string;
  methodParams?: Record<string, unknown>;
  coachNote?: string;
  tempo?: string;
  method_attachment?: MethodAttachment;
  /** Programme en %RM : pourcentage du record athlète (0–200) */
  pct_rm?: number;
  /** Charges individuelles par série (override kg global) */
  setKgs?: number[];
  /** %RM individuels par série (override pct_rm global) */
  setPctRms?: number[];
}

export interface Exercise {
  id: string;
  name: string;
  bloc?: string;
  target?: string;
  exType?: string;
  isFlexibility?: boolean;
  exercise_id?: string;
  weeks: Record<number, WeekConfig>;
  /** Référence canonique pour les 1RM (ex: "Développé couché").
   *  Plusieurs exercices peuvent partager la même ref → même pool de force. */
  rm_ref?: string;
}

export type ExosMap = Record<string, Exercise[]>;

export interface SetRow {
  done?: boolean;
  kg?: number;
  reps?: number;
  rir?: number | null;
  type?: string;
}

export type SetsMap = Record<string, SetRow[]>;

export interface Session {
  id: string;
  name: string;
  short: string;
  day_of_week?: number;
  weekDays?: Record<string, number>;
  recurrence?: "weekly" | "once";
}

export interface BlockConfig {
  blockName?: string;
  objective?: string;
  totalWeeks: number;
  deloadWeek: number;
  startDate?: string | null;
  cycleId?: string;
}

// ─── Wellness & Body ──────────────────────────────────────────────────────────

export interface WellnessData {
  date?: string;
  score?: number;
  fatigue?: number;
  sommeil?: number;
  stress?: number;
  energie?: number;
  doms?: number;
  poids?: number;
  sleepDur?: number;
  coucher?: { h: number; m: number };
  reveil?: { h: number; m: number };
  sleepInterrupt?: boolean;
  sleepInterruptNote?: string;
  domsZones?: string[];
  domsPoints?: DomsPoint[];
  injComment?: string;
}

export interface DomsPoint {
  id: string;
  x: number;
  y: number;
  side: "front" | "back";
  intensity?: number;
}

export interface BodyWeight {
  current: number;
  target: number;
}

// ─── Injuries ────────────────────────────────────────────────────────────────

export interface Injury {
  id: string;
  zones: string[];
  type?: string;
  intensity?: number;
  status: string;
  date_start?: string;
  date_end?: string;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export interface Goals {
  sessionsPerWeek: number;
  sleepTarget: number;           // durée cible en heures
  sleepBedtime?: { h: number; m: number }; // heure de coucher cible
  sleepWakeup?:  { h: number; m: number }; // heure de lever cible
}

// ─── Habit ───────────────────────────────────────────────────────────────────

export interface Habit {
  id: string;
  athlete_id: string;
  name: string;
  icon?: string;
  sort_order?: number;
  is_active?: boolean;
}

// ─── Energy ──────────────────────────────────────────────────────────────────

export interface EnergySession {
  id: string;
  session_key: string;
  session_label: string;
  appareil_types: string[];
  athlete_id?: string;
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export interface CoachFeedbacks {
  [week: number]: { note?: string; rating?: number; date?: string };
}

export interface AppFeedbackEntry {
  id: string;
  date: string;
  rating: number;
  text?: string;
}

// ─── Visibility ──────────────────────────────────────────────────────────────

export interface VisibilitySettings {
  muscu: boolean;
  energy: boolean;
  tests: boolean;
  wellness: boolean;
  nutrition: boolean;
  pr: boolean;
  weight: boolean;
}

// ─── Athlete Modifications (stored in workout_logs.athlete_modifications) ────

export interface BonusSet {
  /** exercice cible (id dans app_data exos) */
  exerciseId: string;
  exerciseName: string;
  sets: SetRow[];
}

export interface CustomExercise {
  /** id temporaire généré côté client */
  tempId: string;
  name: string;
  exerciseId?: string; // id dans la table exercises si choisi depuis la banque
  exType?: string;     // 'muscu' | 'duration' | …
  sets: Array<{ kg?: number; reps?: number; duration_s?: number; rir?: number; done?: boolean }>;
}

export interface SessionSetLog {
  done: boolean;
  skipped?: boolean;
  kg?: number | null;
  reps?: number;
  rir?: number | null;
  note?: string;
}

/**
 * Coach adaptation of a session for ONE specific day (one workout_log).
 * When present, the athlete sees these blocs instead of the shared template,
 * without affecting any other occurrence of the same session.
 * `blocs` holds a flattened single-week ProgSession.blocs snapshot
 * (typed `unknown[]` here to keep this shared types file decoupled from the
 * coach programmation layer; cast to `Bloc[]` at use sites).
 */
export interface CoachSessionOverride {
  blocs: unknown[];          // Bloc[] — flattened to a single week
  note?: string;             // optional coach note for the day
  /** Fiches de la séance pour ce jour (flattened, pas de variante par semaine) */
  fiches?: import("./fiches").FicheAttachment[];
  createdAt: string;         // ISO timestamp
}

export interface AthleteModifications {
  bonusSets?: BonusSet[];
  customExercises?: CustomExercise[];
  // NEW fields for new ProgSession-based sessions:
  sessionSets?: Record<string, SessionSetLog[]>;    // key = Exercice.id
  exerciceComments?: Record<string, string>;         // key = Exercice.id
  sessionComment?: string;
  sessionForme?: number;                             // 1-5 état de forme
  /** Retour vidéo envoyé par l'athlète (hors app), key = Exercice.id */
  videoSent?: Record<string, boolean>;
  /** Coach's per-day adaptation of the session (see CoachSessionOverride). */
  coachOverride?: CoachSessionOverride;
}

// ─── Session Logs ────────────────────────────────────────────────────────────

export interface SessionLog {
  note?: string;
  forme?: number;
  duration?: number;
  date?: string;
}

// ─── Free Session ────────────────────────────────────────────────────────────

export interface FreeSession {
  id: string;
  name: string;
  completed?: boolean;
  date?: string;
  sport?: string;
  sportEmoji?: string;
  duration?: number;
  intensity?: number;
  note?: string;
  /** Distance parcourue en kilomètres (course, vélo, natation…) */
  distance_km?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercises?: any[];
}

// ─── Block History ───────────────────────────────────────────────────────────

export interface ArchivedBlock {
  id?: string;
  archivedAt: string;
  exos: ExosMap;
  sets: SetsMap;
  completedSessions: Record<number, string[]>;
  sessions: Session[];
  blockConfig: BlockConfig;
  goals: Goals;
  wellnessHistory: Record<string, WellnessData>;
  bodyWeight: BodyWeight;
  athleteNotes: Record<string, string>;
}

// ─── New block options (from NewBlockModal) ───────────────────────────────────

export interface NewBlockOpts {
  sessions: Session[];
  restoredExos?: ExosMap;
  exos?: ExosMap;
  config?: boolean;
  blockName?: string;
  objective?: string;
  totalWeeks?: number;
  deloadWeek?: number;
  sessPerWeek?: number;
}

// ─── Re-export external types ─────────────────────────────────────────────────

export type { NutritionStrategy };
