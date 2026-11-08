import { useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { todayKey, localISO } from "@/lib/date";
import { checkMilestone } from "@/lib/date";
import { SKEYS, isKeyLoadFailed } from "@/lib/storage";
import { clearDraft, wellnessDraftKey } from "@/lib/localDraft";
import { invalidateWellness, wellnessKeys } from "@/api/wellness";
import { notifyQueued, queueIsDurable, submitWrite } from "@/lib/offline/writes";
import {
  completeWorkout, invalidateWorkouts, listWorkoutLogs, planWorkout, reopenWorkout, setWorkoutNote,
} from "@/api/workouts";
import { parseWellnessEntry, toLegacyEntry, type WellnessEntry } from "@shared/domain/wellness";
import { toCompactDay } from "@shared/domain/dates";
import { setHabitDone } from "@/api/habits";
import { recordWeightMilestone } from "@/api/profile";
import { toast } from "sonner";
import type {
  ExosMap, SetsMap, Session, BlockConfig, Goals, WellnessData,
  ArchivedBlock, NewBlockOpts, BodyWeight, VisibilitySettings,
} from "../types/athlete";

interface LogicDeps {
  athleteId: string;
  exos: ExosMap;
  sets: SetsMap;
  sessions: Session[];
  blockConfig: BlockConfig;
  goals: Goals;
  completedSessions: Record<number, string[]>;
  wellnessHistory: Record<string, WellnessData>;
  bodyWeight: BodyWeight;
  weightLog: Record<string, number>;
  weightMilestones: Array<{ date: string; kg: number }>;
  blockHistory: ArchivedBlock[];
  tw: number;
  dw: number;
  weeksArr: number[];
  weeklyTarget: Record<number, number>;
  loaded: boolean;
  // setters
  setExos: (v: ExosMap | ((p: ExosMap) => ExosMap)) => void;
  setSets: (v: SetsMap) => void;
  setSessions: (v: Session[] | ((p: Session[]) => Session[])) => void;
  setBlockConfig: (v: BlockConfig | ((p: BlockConfig) => BlockConfig)) => void;
  setGoals: (v: Goals | ((p: Goals) => Goals)) => void;
  setCompletedSessions: (v: Record<number, string[]>) => void;
  setAthleteNotes: (v: Record<string, string>) => void;
  setBlockHistory: (v: ArchivedBlock[]) => void;
  setWellness: (v: WellnessData | null) => void | Promise<boolean>;
  setWellnessHistory: (v: Record<string, WellnessData>) => void | Promise<boolean>;
  /** Mettent à jour l'état en mémoire sans écrire en base (useAthletePersistedState). */
  _setWellnessRaw: (v: WellnessData | null) => void;
  _setWellnessHistoryRaw: (v: Record<string, WellnessData> | ((p: Record<string, WellnessData>) => Record<string, WellnessData>)) => void;
  _setWeightLogRaw: (v: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  _setWeightMilestonesRaw: (v: Array<{ date: string; kg: number }>) => void;
  _setBodyWeightRaw: (v: BodyWeight) => void;
  setWeightLog: (v: Record<string, number>) => void | Promise<boolean>;
  setWeightMilestones: (v: Array<{ date: string; kg: number }>) => void;
  setBodyWeight: (v: BodyWeight) => void;
  setVisibilitySettings: (v: VisibilitySettings) => Promise<void>;
  setMilestoneNotif: (v: number | null) => void;
  setWeekJustCompleted: (v: number | null) => void;
  setShowBilan: (v: boolean) => void;
  setAW: (v: number) => void;
  save: (k: string, v: unknown) => Promise<void>;
}

export function useAthleteLogic(d: LogicDeps) {
  const qc = useQueryClient();
  const {
    athleteId, exos, sets, sessions, blockConfig, goals, completedSessions,
    wellnessHistory, bodyWeight, weightLog, weightMilestones, blockHistory,
    tw, dw, weeksArr, weeklyTarget, loaded,
    setExos, setSets, setSessions, setBlockConfig, setGoals, setCompletedSessions,
    setAthleteNotes, setBlockHistory, setWellness, setWellnessHistory,
    setWeightLog, setWeightMilestones, setBodyWeight,
    setMilestoneNotif, setWeekJustCompleted, setShowBilan, setAW, save,
    _setWellnessRaw, _setWellnessHistoryRaw, _setWeightLogRaw, _setWeightMilestonesRaw, _setBodyWeightRaw,
  } = d;

  // L'ancien rattrapage `asp:completed` → `workout_logs` (et ses nettoyages)
  // a été supprimé le 2026-11-07 : il datait de l'époque où les séances
  // validées vivaient dans le navigateur, tournait à chaque ouverture — y
  // compris en vue coach et staff — et pouvait repasser en « réalisée » une
  // séance que l'athlète avait réouverte. `workout_logs` est la seule source.

  // Calcule la date exacte planifiée pour une séance dans une semaine donnée
  const sessionScheduledDate = useCallback((sessId: string, week: number): string | null => {
    if (!blockConfig?.startDate) return null;
    const sess = sessions.find(s => s.id === sessId);
    const dow = (sess?.weekDays?.[String(week)] ?? sess?.day_of_week) as number | undefined;
    if (dow == null) return null;
    const d0 = new Date(blockConfig.startDate + "T12:00:00");
    const weekDow = d0.getDay();
    // Snap to Monday of block start week, then add (week-1)*7 + dow
    d0.setDate(d0.getDate() + (weekDow === 0 ? -6 : 1 - weekDow) + (week - 1) * 7 + dow);
    return localISO(d0);
  }, [blockConfig?.startDate, sessions]);

  const syncWorkoutLogStatus = useCallback((sessId: string, week: number, status: "completed" | "planned", note?: string) => {
    if (!athleteId || !blockConfig?.startDate) return;
    const sess = sessions.find(s => s.id === sessId);

    // Compute the Monday–Sunday of the target week (block-relative)
    const blockStart = new Date(blockConfig.startDate + "T12:00:00");
    const dow0 = blockStart.getDay();
    const monday = new Date(blockStart);
    monday.setDate(blockStart.getDate() + (dow0 === 0 ? -6 : 1 - dow0) + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekStart = localISO(monday);
    const weekEnd   = localISO(sunday);

    // Fallback scheduled_date (used only when inserting a new log)
    const scheduledDate = sessionScheduledDate(sessId, week) ?? weekStart;

    (async () => {
      // Séance de la semaine, quel que soit le jour où le coach l'a placée.
      const [existing] = await listWorkoutLogs({
        athleteIds: [athleteId], sessionId: sessId, from: weekStart, to: weekEnd, limit: 1, withMods: false,
      });
      let logId = existing?.id ?? null;
      if (status === "completed") {
        if (!logId) {
          logId = (await planWorkout({
            athleteId, coachId: null, sessionId: sessId,
            sessionName: sess?.name ?? "Séance", date: scheduledDate, weekNumber: week,
          })).id;
        }
        await completeWorkout({ logId });
      } else if (logId) {
        await reopenWorkout(logId);
      }
      if (logId && note != null) await setWorkoutNote(logId, note);
      await invalidateWorkouts(qc, { athleteId, logId: logId ?? undefined });
    })().catch((e) => console.error("[syncWorkoutLogStatus]", e));
  }, [sessionScheduledDate, sessions, athleteId, blockConfig?.startDate, qc]);

  const completeSession = useCallback((sessId: string, week: number, note?: string) => {
    const prev = completedSessions[week] || [];
    if (prev.includes(sessId)) return;
    const newW = [...prev, sessId];
    const newC = { ...completedSessions, [week]: newW };
    setCompletedSessions(newC);
    if (newW.length >= (weeklyTarget[week] || goals.sessionsPerWeek)) {
      setWeekJustCompleted(week);
      setTimeout(() => { setWeekJustCompleted(null); if (week >= tw) setShowBilan(true); else setAW(week + 1); }, 2800);
    }
    syncWorkoutLogStatus(sessId, week, "completed", note);
  }, [completedSessions, weeklyTarget, goals.sessionsPerWeek, tw, setCompletedSessions, setWeekJustCompleted, setShowBilan, setAW, syncWorkoutLogStatus]);

  const uncompleteSession = useCallback((sessId: string, week: number) => {
    setCompletedSessions({ ...completedSessions, [week]: (completedSessions[week] || []).filter(s => s !== sessId) });
    syncWorkoutLogStatus(sessId, week, "planned");
  }, [completedSessions, setCompletedSessions, syncWorkoutLogStatus]);

  const archiveAndNewBlock = useCallback((opts: NewBlockOpts) => {
    const hasData = Object.values(exos).flat().length > 0 || Object.values(completedSessions).flat().length > 0;
    if (hasData) {
      const archived: ArchivedBlock = {
        id: "blk_" + Date.now(), archivedAt: new Date().toISOString(),
        exos, sets, completedSessions, sessions, blockConfig, goals,
        wellnessHistory, bodyWeight, athleteNotes: {},
      };
      setBlockHistory([...blockHistory, archived]);
    }
    setSessions(opts.sessions || []);
    if (opts.restoredExos) { setExos(opts.restoredExos); }
    else if (!opts.exos) { const ne: ExosMap = {}; (opts.sessions || []).forEach(s => { ne[s.id] = []; }); setExos(ne); }
    else { const ne = { ...exos }; (opts.sessions || []).forEach(s => { if (!ne[s.id]) ne[s.id] = []; }); setExos(ne); }
    const newBc = opts.config ? { ...blockConfig } : { totalWeeks: 6, deloadWeek: 0 };
    (newBc as BlockConfig).blockName = opts.blockName || "";
    (newBc as BlockConfig).objective = opts.objective || "";
    (newBc as BlockConfig).totalWeeks = opts.totalWeeks || 6;
    (newBc as BlockConfig).deloadWeek = opts.deloadWeek || 0;
    (newBc as BlockConfig).startDate = new Date().toISOString().slice(0, 10);
    setBlockConfig(newBc as BlockConfig);
    setGoals(g => ({ ...g, sessionsPerWeek: opts.sessPerWeek || g.sessionsPerWeek }));
    setSets({});
    setCompletedSessions({} as Record<number, string[]>);
    setAthleteNotes({});
    setWellness(null); save(SKEYS.wellness, null).catch(() => {});
    setWellnessHistory({}); save(SKEYS.wellnessHistory, {}).catch(() => {});
    setAW(1); setShowBilan(false);
  }, [exos, sets, completedSessions, sessions, blockConfig, goals, wellnessHistory, bodyWeight, blockHistory, setBlockHistory, setSessions, setExos, setBlockConfig, setGoals, setSets, setCompletedSessions, setAthleteNotes, setWellness, setWellnessHistory, setAW, setShowBilan, save]);

  const applyAIEdit = useCallback((newSessions: ExosMap) => {
    const merged = { ...exos };
    Object.entries(newSessions).forEach(([sid, exList]) => { merged[sid] = exList; });
    setExos(merged);
  }, [exos, setExos]);

  // Renvoie true quand l'écriture du wellness (et du poids saisi) est faite
  // OU gardée sur le téléphone sans réseau (file `src/lib/offline/writes.ts`,
  // envoi au retour du réseau) ; le brouillon local du formulaire n'est purgé
  // qu'à ce moment. false = refusée : message à l'athlète.
  const saveWellness = useCallback((data: WellnessData): Promise<boolean> => {
    const day = todayKey();
    const iso = localISO();
    let queued = false;
    const showEntry = (saved: WellnessEntry) => {
      const legacy = { ...toLegacyEntry(saved), date: toCompactDay(saved.day) } as unknown as WellnessData;
      _setWellnessRaw(legacy);
      _setWellnessHistoryRaw((prev) => ({ ...prev, [toCompactDay(saved.day)]: legacy }));
    };
    // Le jour seul, côté serveur (RPC `wellness_set_day`) : un autre appareil
    // ou le coach ne voit plus sa saisie effacée par une réécriture du blob.
    const wellnessWrite: Promise<boolean> = submitWrite("wellness.day", { athleteId, day: iso, form: data })
      .then((r) => {
        if (r.status === "sent") {
          showEntry(r.result as WellnessEntry);
          void invalidateWellness(qc, athleteId);
          return true;
        }
        queued = true;
        const entry = parseWellnessEntry(data, iso);
        if (entry) {
          showEntry({ ...entry, archived: false });
          qc.setQueryData(wellnessKeys.today(athleteId, iso), { ...entry, archived: false });
        }
        return true;
      })
      .catch((e) => {
        console.error("[saveWellness]", e);
        toast.error("Wellness non enregistré : réessaie dans un instant.");
        return false;
      });
    const writes: Array<void | Promise<boolean>> = [wellnessWrite];
    if (data.poids) {
      // Une seule pesée, côté serveur (RPC `weight_set_day`) : le journal n'est
      // plus réécrit en entier depuis l'état de l'appareil.
      const kg = data.poids;
      writes.push(submitWrite("weight.day", { athleteId, day: iso, kg }).then(async (r) => {
        if (r.status === "queued") {
          // Gardée sur le téléphone : affichée tout de suite, le palier sera
          // vérifié à la prochaine pesée faite avec du réseau.
          queued = true;
          _setWeightLogRaw((prev) => ({ ...prev, [toCompactDay(iso)]: kg }));
          return true;
        }
        const log = r.result as Record<string, number>;
        _setWeightLogRaw(log);
        // Poids de référence ou paliers non chargés (réseau) : bodyWeight vaut
        // le défaut 0, tout serait un « palier ». On attend une vraie lecture.
        const refUnknown = isKeyLoadFailed(SKEYS.bw, athleteId) || isKeyLoadFailed(SKEYS.weightMilestones, athleteId);
        const milestone = refUnknown ? null : checkMilestone(log, bodyWeight.current);
        if (milestone && milestone > bodyWeight.current) {
          const bw = await recordWeightMilestone(athleteId, iso, milestone);
          _setWeightMilestonesRaw([...weightMilestones, { date: toCompactDay(iso), kg: milestone }]);
          _setBodyWeightRaw(bw);
          setMilestoneNotif(milestone);
          setTimeout(() => setMilestoneNotif(null), 3500);
        }
        return true;
      }).catch((e) => {
        console.error("[saveWeight]", e);
        toast.error("Pesée non enregistrée : réessaie dans un instant.");
        return false;
      }));
    }
    return Promise.all(writes.map((w) => Promise.resolve(w ?? true))).then((oks) => {
      const ok = oks.every(Boolean);
      // Gardée en file sans IndexedDB (perdue au rechargement) : brouillon gardé.
      if (ok && athleteId && (!queued || queueIsDurable())) clearDraft(wellnessDraftKey(athleteId, day));
      if (queued) notifyQueued();
      return ok;
    });
  }, [athleteId, qc, bodyWeight, weightMilestones, _setWellnessRaw, _setWellnessHistoryRaw, _setWeightLogRaw, _setWeightMilestonesRaw, _setBodyWeightRaw, setMilestoneNotif]);

  const updateSessionDay = useCallback((sessId: string, dayIdx: number) => {
    setSessions(prev => prev.map(s => s.id === sessId ? { ...s, day_of_week: dayIdx } : s));
  }, [setSessions]);

  const updateSessionWeekDay = useCallback((sessId: string, blockWeek: number, dayIdx: number | null) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessId) return s;
      const wd = { ...(s.weekDays || {}) };
      if (dayIdx === null) wd[String(blockWeek)] = -1; else wd[String(blockWeek)] = dayIdx;
      return { ...s, weekDays: wd };
    }));
  }, [setSessions]);


  const toggleHabitLog = useCallback(async (habitId: string, dateISO: string, habitLogs: Record<string, string[]>, setHabitLogs: (v: Record<string, string[]>) => void) => {
    const logs = habitLogs[habitId] || [];
    try {
      const next = await setHabitDone(athleteId, habitId, dateISO, !logs.includes(dateISO), logs);
      setHabitLogs({ ...habitLogs, [habitId]: next });
    } catch (e) {
      console.error("[toggleHabitLog]", e);
      toast.error("Habitude non enregistrée — vérifie ta connexion");
    }
  }, [athleteId]);

  const updSets = useCallback((k: string, ns: unknown[]) => setSets({ ...sets, [k]: ns as SetsMap[string] }), [sets, setSets]);

  return {
    completeSession, uncompleteSession,
    archiveAndNewBlock, applyAIEdit, saveWellness, updateSessionDay,
    updateSessionWeekDay, toggleHabitLog, updSets,
  };
}
