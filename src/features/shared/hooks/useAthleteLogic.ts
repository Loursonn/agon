import { useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { todayKey, localISO } from "@/lib/date";
import { checkMilestone } from "@/lib/date";
import { SKEYS } from "@/lib/storage";
import { clearDraft, wellnessDraftKey } from "@/lib/localDraft";
import { supabase } from "@/integrations/supabase/client";
import type {
  ExosMap, SetsMap, Session, BlockConfig, Goals, WellnessData,
  Injury, ArchivedBlock, NewBlockOpts, BodyWeight, VisibilitySettings,
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
  injuries: Injury[];
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
  setWeightLog: (v: Record<string, number>) => void | Promise<boolean>;
  setWeightMilestones: (v: Array<{ date: string; kg: number }>) => void;
  setBodyWeight: (v: BodyWeight) => void;
  setInjuries: (v: Injury[]) => void;
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
    wellnessHistory, bodyWeight, weightLog, weightMilestones, injuries, blockHistory,
    tw, dw, weeksArr, weeklyTarget, loaded,
    setExos, setSets, setSessions, setBlockConfig, setGoals, setCompletedSessions,
    setAthleteNotes, setBlockHistory, setWellness, setWellnessHistory,
    setWeightLog, setWeightMilestones, setBodyWeight, setInjuries,
    setMilestoneNotif, setWeekJustCompleted, setShowBilan, setAW, save,
  } = d;

  // ── Backfill completedSessions → workout_logs on first load ─────────────
  // Sessions marked complete before DB-sync was implemented live only in
  // localStorage. This one-time sync writes them to workout_logs so that
  // the Retours view (which reads only from the DB) can see them.
  const backfillDoneRef = useRef(false);
  useEffect(() => {
    return () => { backfillDoneRef.current = false; };
  }, []);
  useEffect(() => {
    if (!loaded || backfillDoneRef.current || !athleteId || !blockConfig?.startDate) return;
    backfillDoneRef.current = true;

    // On ne sort PAS si completedSessions est vide : l'auto-nettoyage des séances
    // hors-cycle (plus bas) doit pouvoir tourner même sans complétions locales.
    const allEntries = Object.entries(completedSessions) as [string, string[]][];

    const blockStart = new Date(blockConfig.startDate + "T12:00:00");
    const dow0 = blockStart.getDay();
    const blockMonday = new Date(blockStart);
    blockMonday.setDate(blockStart.getDate() + (dow0 === 0 ? -6 : 1 - dow0));

    (async () => {
      // Bornes des cycles réels de l'athlète : on ne matérialise une complétion
      // QUE si sa date tombe dans un cycle existant. Évite que des semaines
      // "faites" stockées en localStorage (completedSessions) recréent des
      // séances validées hors cycle (ex. après avoir raccourci/stoppé un cycle).
      const { data: cyclesRows } = await supabase
        .from("cycles").select("start_date, end_date").eq("athlete_id", athleteId);
      const cycles = cyclesRows ?? [];
      const hasCycles = cycles.length > 0;
      const inAnyCycle = (dateStr: string) =>
        cycles.some((c) => dateStr >= c.start_date && dateStr <= c.end_date);
      const todayStr = localISO();

      // Auto-nettoyage : si des cycles existent, on supprime les séances tombées
      // HORS de tout cycle (phantoms laissés par d'anciens backfills, ex. après
      // avoir stoppé/raccourci un cycle). Sinon, repart proprement.
      //
      // On ne cible QUE la signature d'un phantom de backfill : un log "completed"
      // sans aucune saisie de l'athlète. Auparavant ce nettoyage supprimait TOUT
      // log hors cycle : une séance glissée par le coach sur une date hors cycle
      // disparaissait au chargement suivant, et une séance en cours d'exécution
      // était effacée sous les pieds de l'athlète (ses charges/reps n'étaient
      // alors plus jamais enregistrées).
      if (hasCycles) {
        const { data: allLogs } = await supabase
          .from("workout_logs")
          .select("id, scheduled_date, status, athlete_modifications")
          .eq("athlete_id", athleteId);
        const orphanIds = (allLogs ?? [])
          .filter((l) =>
            !inAnyCycle(l.scheduled_date) &&
            l.status === "completed" &&
            l.athlete_modifications == null
          )
          .map((l) => l.id);
        if (orphanIds.length > 0) {
          await supabase.from("workout_logs").delete().in("id", orphanIds);
        }
      }

      // Auto-réparation : une séance FUTURE ne peut pas être réalisée. On repasse
      // en "planned" tous les logs "completed" dont la date est dans le futur
      // (erreurs de backfills antérieurs, completedSessions par semaine non fiable).
      const { data: futureDone } = await supabase
        .from("workout_logs").select("id")
        .eq("athlete_id", athleteId).eq("status", "completed").gt("scheduled_date", todayStr);
      const futureDoneIds = (futureDone ?? []).map((l) => l.id);
      if (futureDoneIds.length > 0) {
        await supabase.from("workout_logs").update({ status: "planned" }).in("id", futureDoneIds);
      }

      for (const [weekStr, sessIds] of allEntries) {
        const week = Number(weekStr);
        if (!Number.isFinite(week) || week < 1 || sessIds.length === 0) continue;

        const monday = new Date(blockMonday);
        monday.setDate(blockMonday.getDate() + (week - 1) * 7);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const weekStart = localISO(monday);
        const weekEnd   = localISO(sunday);

        for (const sessId of sessIds) {
          const sess = sessions.find(s => s.id === sessId);

          // Date planifiée de la séance dans cette semaine
          const dow = (sess?.weekDays?.[weekStr] ?? sess?.day_of_week) as number | undefined;
          const scheduledDate = dow != null
            ? (() => { const d = new Date(monday); d.setDate(monday.getDate() + dow); return localISO(d); })()
            : weekStart;

          // Hors de tout cycle réel → on ne matérialise pas la complétion
          if (hasCycles && !inAnyCycle(scheduledDate)) continue;
          // Séance future → jamais marquée réalisée par le backfill
          if (scheduledDate > todayStr) continue;

          // Check if a workout_log already exists for this session in this week
          const { data: rows } = await supabase
            .from("workout_logs")
            .select("id, status")
            .eq("session_id", sessId)
            .eq("athlete_id", athleteId)
            .gte("scheduled_date", weekStart)
            .lte("scheduled_date", weekEnd)
            .limit(1);
          const existing = rows?.[0] ?? null;
          if (existing) {
            if (existing.status !== "completed") {
              await supabase.from("workout_logs").update({ status: "completed" }).eq("id", existing.id);
            }
          } else {
            await supabase.from("workout_logs").insert({
              athlete_id:     athleteId,
              session_id:     sessId,
              session_name:   sess?.name ?? "Séance",
              scheduled_date: scheduledDate,
              status:         "completed",
            });
          }
        }
      }
      qc.invalidateQueries({ queryKey: ["cal", athleteId] });
    })();
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Search by session_id + week range — works regardless of which exact day
      // the coach placed the session on (avoids exact-date mismatch bug)
      const { data: rows } = await supabase
        .from("workout_logs")
        .select("id")
        .eq("session_id", sessId)
        .eq("athlete_id", athleteId)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date")
        .limit(1);

      const existing = rows?.[0] ?? null;

      if (existing) {
        await supabase
          .from("workout_logs")
          .update(note != null ? { status, notes: note } : { status })
          .eq("id", existing.id);
      } else if (status === "completed") {
        await supabase
          .from("workout_logs")
          .insert({
            athlete_id:     athleteId,
            session_id:     sessId,
            session_name:   sess?.name ?? "Séance",
            scheduled_date: scheduledDate,
            status:         "completed",
            ...(note != null ? { notes: note } : {}),
          });
      }
      qc.invalidateQueries({ queryKey: ["cal", athleteId] });
    })();
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

  // Renvoie true quand le serveur a confirmé l'écriture du wellness (et du
  // poids saisi) ; le brouillon local du formulaire n'est purgé qu'à ce moment.
  const saveWellness = useCallback((data: WellnessData): Promise<boolean> => {
    const day = todayKey();
    const dataWithDate = { ...data, date: day };
    const writes: Array<void | Promise<boolean>> = [];
    writes.push(setWellness(dataWithDate));
    const wh = { ...wellnessHistory, [day]: dataWithDate };
    writes.push(setWellnessHistory(wh));
    if (data.poids) {
      const key = day;
      const nwl = { ...weightLog, [key]: data.poids };
      writes.push(setWeightLog(nwl));
      const milestone = checkMilestone(nwl, bodyWeight.current);
      if (milestone && milestone > bodyWeight.current) {
        const nm = [...weightMilestones, { date: key, kg: milestone }];
        setWeightMilestones(nm);
        const newBw = { ...bodyWeight, current: milestone };
        setBodyWeight(newBw);
        setMilestoneNotif(milestone);
        setTimeout(() => setMilestoneNotif(null), 3500);
      }
    }
    return Promise.all(writes.map((w) => Promise.resolve(w ?? true))).then((oks) => {
      const ok = oks.every(Boolean);
      if (ok && athleteId) clearDraft(wellnessDraftKey(athleteId, day));
      return ok;
    });
  }, [athleteId, wellnessHistory, weightLog, bodyWeight, weightMilestones, setWellness, setWellnessHistory, setWeightLog, setWeightMilestones, setBodyWeight, setMilestoneNotif]);

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

  const addInjury = useCallback((inj: Injury) => setInjuries([...injuries, inj]), [injuries, setInjuries]);
  const updateInjury = useCallback((inj: Injury) => setInjuries(injuries.map(i => i.id === inj.id ? inj : i)), [injuries, setInjuries]);
  const deleteInjury = useCallback((id: string) => setInjuries(injuries.filter(i => i.id !== id)), [injuries, setInjuries]);

  const toggleHabitLog = useCallback(async (habitId: string, dateISO: string, habitLogs: Record<string, string[]>, setHabitLogs: (v: Record<string, string[]>) => void) => {
    const logs = habitLogs[habitId] || [];
    if (logs.includes(dateISO)) {
      await supabase.from('habit_logs').delete().match({ habit_id: habitId, date: dateISO });
      setHabitLogs({ ...habitLogs, [habitId]: (habitLogs[habitId] || []).filter(d => d !== dateISO) });
    } else {
      await supabase.from('habit_logs').insert({ habit_id: habitId, athlete_id: athleteId, date: dateISO });
      setHabitLogs({ ...habitLogs, [habitId]: [...(habitLogs[habitId] || []), dateISO] });
    }
  }, [athleteId]);

  const updSets = useCallback((k: string, ns: unknown[]) => setSets({ ...sets, [k]: ns as SetsMap[string] }), [sets, setSets]);

  return {
    completeSession, uncompleteSession,
    archiveAndNewBlock, applyAIEdit, saveWellness, updateSessionDay,
    updateSessionWeekDay, addInjury, updateInjury, deleteInjury, toggleHabitLog, updSets,
  };
}
