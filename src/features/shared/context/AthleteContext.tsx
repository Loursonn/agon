import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { Profile } from "@/hooks/useAuth";
import { useAthletePersistedState } from "../hooks/useAthletePersistedState";
import { useAthleteComputations } from "../hooks/useAthleteComputations";
import { useAthleteLogic } from "../hooks/useAthleteLogic";
import { useHabits } from "../hooks/useHabits";
// NOTE: useEnergySessions was rewritten for the energy-refonte (coach library).
// AthleteContext maintains legacy energy state as empty defaults since
// energy_session_config / app_data energy keys were dropped in the DB migration.
import { useFeedbacks } from "../hooks/useFeedbacks";
import { SKEYS } from "@/lib/storage";
import { sSave } from "@/lib/storage";
import type {
  ExosMap, SetsMap, Session, BlockConfig, WellnessData,
  BodyWeight, Goals, Injury, ArchivedBlock, NewBlockOpts,
  VisibilitySettings, SessionLog, FreeSession, NutritionStrategy,
  EnergySession, CoachFeedbacks, AppFeedbackEntry, Habit,
} from "../types/athlete";

// ─── Context shape ──────────────────────────────────────────────────────────

export interface AthleteContextValue {
  // Props
  athleteId: string;
  viewOnly: boolean;
  athleteProfile: Profile | null;
  onEditProfile?: (tab?: "profil" | "nutrition") => void;
  userName?: string;

  // Persisted data
  exos: ExosMap; setExos: (v: ExosMap | ((p: ExosMap) => ExosMap)) => void;
  exMeta: Record<string, unknown>; setExMeta: (v: Record<string, unknown> | ((p: Record<string, unknown>) => Record<string, unknown>)) => void;
  sets: SetsMap; setSets: (v: SetsMap) => void;
  sessions: Session[]; setSessions: (v: Session[] | ((p: Session[]) => Session[])) => void;
  blockConfig: BlockConfig; setBlockConfig: (v: BlockConfig | ((p: BlockConfig) => BlockConfig)) => void;
  completedSessions: Record<number, string[]>; setCompletedSessions: (v: Record<number, string[]>) => void;
  goals: Goals; setGoals: (v: Goals | ((p: Goals) => Goals)) => void;
  athleteNotes: Record<string, string>; setAthleteNotes: (v: Record<string, string>) => void;
  customMethods: unknown[]; setCustomMethods: (v: unknown[]) => void;
  weightLog: Record<string, number>; setWeightLog: (v: Record<string, number>) => void;
  weightMilestones: Array<{ date: string; kg: number }>; setWeightMilestones: (v: Array<{ date: string; kg: number }>) => void;
  injuries: Injury[]; setInjuries: (v: Injury[]) => void;
  wellness: WellnessData | null; setWellness: (v: WellnessData | null) => void;
  wellnessHistory: Record<string, WellnessData>; setWellnessHistory: (v: Record<string, WellnessData>) => void;
  bodyWeight: BodyWeight; setBodyWeight: (v: BodyWeight) => void;
  blockHistory: ArchivedBlock[]; setBlockHistory: (v: ArchivedBlock[]) => void;
  weekSchedule: Record<string, unknown>; setWeekSchedule: (v: Record<string, unknown>) => void;
  sessionLogs: Record<string, SessionLog>; setSessionLogs: (v: Record<string, SessionLog>) => void;
  freeSessions: FreeSession[]; setFreeSessions: (v: FreeSession[] | ((prev: FreeSession[]) => FreeSession[])) => void;
  nutritionStrategy: NutritionStrategy | null; setNutritionStrategy: (v: NutritionStrategy | null) => void;
  nutritionLog: Record<string, unknown>; setNutritionLog: (v: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => void;
  visibilitySettings: VisibilitySettings; setVisibilitySettings: (v: VisibilitySettings) => Promise<void>;
  testSessions: unknown[]; setTestSessions: (v: unknown[]) => void;
  loaded: boolean; saveStatus: "saved" | "error" | null;
  // Cycle ouvert : exos/sessions/completedSessions sont scopés sur lui
  openCycleId: string | null; setOpenCycleId: (id: string | null) => void;

  // Energy
  energySessions: EnergySession[]; setEnergySessions: (v: EnergySession[]) => void;
  energySessionsLoaded: boolean; setEnergySessionsLoaded: (v: boolean) => void;
  energyWeekPlan: Record<string, unknown>; setEnergyWeekPlan: (v: Record<string, unknown>) => void;
  energyDayPlan: Record<string, unknown>; setEnergyDayPlan: (v: Record<string, unknown>) => void;
  energyEditorKey: string | null; setEnergyEditorKey: (v: string | null) => void;

  // Habits
  habits: Habit[]; setHabits: (v: Habit[]) => void;
  habitLogs: Record<string, string[]>; setHabitLogs: (v: Record<string, string[]>) => void;
  habitEnabled: boolean; habitToggling: boolean; habitToggleErr: string;
  toggleHabitEnabled: () => Promise<void>;

  // Feedbacks
  coachFeedbacks: CoachFeedbacks;
  appFeedbacks: AppFeedbackEntry[];
  addAppFeedback: (entry: AppFeedbackEntry) => Promise<AppFeedbackEntry[]>;

  // Computed
  tw: number; dw: number; allMethods: Record<string, unknown>;
  weeksArr: number[]; isDeload: (w: number) => boolean;
  weeklyTarget: Record<number, number>; currentWeek: number;
  totalTarget: number; streak: number; weekAdherence: number;
  prs: Record<string, unknown>; muscSets: unknown;
  combinedData: unknown[]; totalDone: number;
  wScore: number; wReco: { c: string; label: string; desc: string };

  // Timer
  timerLeft: number; timerDur: number; timerActive: boolean; timerFinished: boolean;
  timerSetDur: (d: number) => void; timerStart: () => void; timerStop: () => void;

  // Modal UI
  showWellness: boolean; setShowWellness: (v: boolean) => void;
  showAppFeedback: boolean; setShowAppFeedback: (v: boolean) => void;

  // Notification state
  weekJustCompleted: number | null; setWeekJustCompleted: (v: number | null) => void;
  milestoneNotif: number | null; setMilestoneNotif: (v: number | null) => void;
  showBilan: boolean; setShowBilan: (v: boolean) => void;
  showNewBlock: boolean; setShowNewBlock: (v: boolean) => void;
  showBlockHistory: boolean; setShowBlockHistory: (v: boolean) => void;
  chatHistory: unknown[]; setChatHistory: (v: unknown[]) => void;
  aiChatOpen: boolean; setAiChatOpen: (v: boolean) => void;
  aW: number; setAW: (v: number) => void;

  // Actions
  completeSession: (sessId: string, week: number, note?: string) => void;
  uncompleteSession: (sessId: string, week: number) => void;
  archiveAndNewBlock: (opts: NewBlockOpts) => void;
  applyAIEdit: (newSessions: ExosMap) => void;
  saveWellness: (data: WellnessData) => void;
  updateSessionDay: (sessId: string, dayIdx: number) => void;
  updateSessionWeekDay: (sessId: string, blockWeek: number, dayIdx: number | null) => void;
  addInjury: (inj: Injury) => void;
  updateInjury: (inj: Injury) => void;
  deleteInjury: (id: string) => void;
  toggleHabitLog: (habitId: string, dateISO: string, logs: Record<string, string[]>, setLogs: (v: Record<string, string[]>) => void) => Promise<void>;
  updSets: (k: string, ns: unknown[]) => void;
}

const AthleteCtx = createContext<AthleteContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAthleteContext(): AthleteContextValue {
  const ctx = useContext(AthleteCtx);
  if (!ctx) throw new Error("useAthleteContext must be used inside AthleteProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────

interface AthleteProviderProps {
  athleteId: string;
  viewOnly?: boolean;
  athleteProfile?: Profile | null;
  onEditProfile?: (tab?: "profil" | "nutrition") => void;
  userName?: string;
  children: React.ReactNode;
}

export function AthleteProvider({ athleteId, viewOnly = false, athleteProfile = null, onEditProfile, userName, children }: AthleteProviderProps) {
  // UI notification state (shared between layout & pages)
  const [weekJustCompleted, setWeekJustCompleted] = useState<number | null>(null);
  const [milestoneNotif, setMilestoneNotif] = useState<number | null>(null);
  const [showBilan, setShowBilan] = useState(false);
  const [showNewBlock, setShowNewBlock] = useState(false);
  const [showBlockHistory, setShowBlockHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<unknown[]>([]);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aW, setAW] = useState(1);

  // Timer state
  const [timerLeft, setTimerLeft] = useState(120);
  const [timerDur, setTimerDur] = useState(120);
  const [timerActive, setTimerActive] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modal UI state
  const [showWellness, setShowWellness] = useState(false);
  const [showAppFeedback, setShowAppFeedback] = useState(false);

  const playDing = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const mk = (freq: number, t0: number, dur: number, vol = 0.4) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = "sine";
        g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.start(t0); o.stop(t0 + dur);
      };
      mk(880, ctx.currentTime, 1.2); mk(1108, ctx.currentTime + 0.25, 1.0, 0.3); mk(1318, ctx.currentTime + 0.5, 0.9, 0.2);
    } catch (_) { /* ignore */ }
  };

  // timerLeft intentionnellement exclu — on veut démarrer l'intervalle uniquement quand timerActive change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!timerActive || timerLeft <= 0) return;
    const tid = setInterval(() => setTimerLeft(l => l - 1), 1000);
    timerRef.current = tid;
    return () => clearInterval(tid);
  }, [timerActive]);

  useEffect(() => {
    if (timerActive && timerLeft <= 0) { setTimerActive(false); setTimerFinished(true); playDing(); }
  }, [timerActive, timerLeft]);

  const timerSetDur = (d: number) => { setTimerDur(d); setTimerLeft(d); setTimerActive(false); setTimerFinished(false); };
  const timerStart = () => { setTimerLeft(timerDur); setTimerActive(true); setTimerFinished(false); };
  const timerStop = () => { if (timerRef.current) clearInterval(timerRef.current); setTimerActive(false); setTimerFinished(false); setTimerLeft(timerDur); };

  const save = (k: string, v: unknown) => sSave(k, v, athleteId);

  const persisted = useAthletePersistedState(athleteId);
  const computations = useAthleteComputations({ ...persisted });
  // Legacy energy state — tables (energy_session_config, app_data energy keys) were
  // dropped in the energy-refonte DB migration. Provide empty defaults so old
  // consumers (ProgPage, ProgrammationPage, RetoursPage, DashboardPage) don't crash.
  const [energySessions, setEnergySessions] = useState<EnergySession[]>([]);
  const [energySessionsLoaded, setEnergySessionsLoaded] = useState(true);
  const [energyWeekPlan, setEnergyWeekPlan] = useState<Record<string, unknown>>({});
  const [energyDayPlan, setEnergyDayPlan] = useState<Record<string, unknown>>({});
  const [energyEditorKey, setEnergyEditorKey] = useState<string | null>(null);
  const energy = {
    energySessions, setEnergySessions,
    energySessionsLoaded, setEnergySessionsLoaded,
    energyWeekPlan, setEnergyWeekPlan,
    energyDayPlan, setEnergyDayPlan,
    energyEditorKey, setEnergyEditorKey,
  };
  const habits = useHabits(athleteId);
  const feedbacks = useFeedbacks(athleteId);

  const logic = useAthleteLogic({
    athleteId, ...persisted, ...computations, loaded: persisted.loaded,
    setMilestoneNotif, setWeekJustCompleted, setShowBilan, setAW, save,
  });

  const value: AthleteContextValue = {
    athleteId, viewOnly, athleteProfile, onEditProfile, userName,
    ...persisted,
    timerLeft, timerDur, timerActive, timerFinished, timerSetDur, timerStart, timerStop,
    showWellness, setShowWellness, showAppFeedback, setShowAppFeedback,
    ...energy,
    habits: habits.habits, setHabits: habits.setHabits,
    habitLogs: habits.habitLogs, setHabitLogs: habits.setHabitLogs,
    habitEnabled: habits.habitEnabled, habitToggling: habits.habitToggling,
    habitToggleErr: habits.habitToggleErr, toggleHabitEnabled: habits.toggleHabitEnabled,
    coachFeedbacks: feedbacks.coachFeedbacks,
    appFeedbacks: feedbacks.appFeedbacks,
    addAppFeedback: feedbacks.addAppFeedback,
    ...computations,
    weekJustCompleted, setWeekJustCompleted, milestoneNotif, setMilestoneNotif,
    showBilan, setShowBilan,
    showNewBlock, setShowNewBlock, showBlockHistory, setShowBlockHistory,
    chatHistory, setChatHistory,
    aiChatOpen, setAiChatOpen, aW, setAW,
    ...logic,
    completeSession: (sessId: string, week: number, note?: string) => { timerStop(); logic.completeSession(sessId, week, note); },
  };

  return <AthleteCtx.Provider value={value}>{children}</AthleteCtx.Provider>;
}
