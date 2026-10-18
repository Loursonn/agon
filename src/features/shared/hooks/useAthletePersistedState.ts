import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { SKEYS, sLoad, sLoadResult, sSave, cycleKey, sSaveCycle } from "@/lib/storage";
import { DEF_SESSIONS, DEF_BLOCK_CONFIG } from "@/lib/exercises";
import { getNutritionStrategy } from "@/lib/nutrition";
import { todayKey } from "@/lib/date";
import type {
  ExosMap, SetsMap, Session, BlockConfig, WellnessData,
  BodyWeight, Goals, Injury, ArchivedBlock,
  VisibilitySettings, SessionLog, FreeSession, NutritionStrategy,
} from "../types/athlete";
import { supabase } from "@/integrations/supabase/client";

const DEF_VISIBILITY: VisibilitySettings = {
  muscu: true, energy: true, tests: true, wellness: true,
  nutrition: true, pr: true, weight: true,
};

/** Cycle ouvert par défaut : celui qui couvre aujourd'hui, sinon le plus récent. */
async function determineActiveCycleId(athleteId: string): Promise<string | null> {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const { data } = await supabase
    .from("cycles")
    .select("id, start_date, end_date")
    .eq("athlete_id", athleteId)
    .order("start_date", { ascending: false });
  const rows = (data ?? []) as { id: string; start_date: string; end_date: string }[];
  if (rows.length === 0) return null;
  const covering = rows.find((c) => c.start_date <= today && today <= c.end_date);
  return (covering ?? rows[0]).id;
}

export function useAthletePersistedState(athleteId: string) {
  const load = useCallback(<T>(k: string, fb: T) => sLoad<T>(k, fb, athleteId), [athleteId]);
  const save = useCallback((k: string, v: unknown) => sSave(k, v, athleteId), [athleteId]);

  // Cycle actuellement ouvert. exos/sessions/completed sont scopés sur lui.
  // null = aucun cycle en base (back-compat : on retombe sur les clés globales).
  const [openCycleId, setOpenCycleIdState] = useState<string | null>(null);
  const openCycleRef = useRef<string | null>(null);
  // Résout la clé de stockage selon le cycle ouvert (scopée) ou legacy (globale).
  const keyFor = useCallback(
    (base: string) => (openCycleRef.current ? cycleKey(base, openCycleRef.current) : base),
    [],
  );
  // Écrit la clé scopée + un miroir sur la clé legacy (consommée par les vues coach).
  const saveBoth = useCallback((base: string, val: unknown) => {
    const k = keyFor(base);
    const p = sSave(k, val, athleteId);
    if (k !== base) sSave(base, val, athleteId).catch(() => {});
    return p;
  }, [keyFor, athleteId]);

  const [exos, setExosRaw] = useState<ExosMap>({});
  const [exMeta, setExMetaRaw] = useState<Record<string, unknown>>({});
  const [sets, setSetsRaw] = useState<SetsMap>({});
  const [sessions, setSessionsRaw] = useState<Session[]>(DEF_SESSIONS as Session[]);
  const [blockConfig, setBlockConfigRaw] = useState<BlockConfig>(DEF_BLOCK_CONFIG as BlockConfig);
  const [completedSessions, setCompletedSessionsRaw] = useState<Record<number, string[]>>({});
  const [goals, setGoalsRaw] = useState<Goals>({ sessionsPerWeek: 6, sleepTarget: 8 });
  const [athleteNotes, setAthleteNotesRaw] = useState<Record<string, string>>({});
  const [customMethods, setCustomMethodsRaw] = useState<unknown[]>([]);
  const [weightLog, setWeightLogRaw] = useState<Record<string, number>>({});
  const [weightMilestones, setWeightMilestonesRaw] = useState<Array<{ date: string; kg: number }>>([]);
  const [injuries, setInjuriesRaw] = useState<Injury[]>([]);
  const [wellness, setWellnessRaw] = useState<WellnessData | null>(null);
  const [wellnessHistory, setWellnessHistoryRaw] = useState<Record<string, WellnessData>>({});
  const [bodyWeight, setBodyWeightRaw] = useState<BodyWeight>({ current: 0, target: 0 });
  const [blockHistory, setBlockHistoryRaw] = useState<ArchivedBlock[]>([]);
  const [weekSchedule, setWeekScheduleRaw] = useState<Record<string, unknown>>({});
  const [sessionLogs, setSessionLogsRaw] = useState<Record<string, SessionLog>>({});
  const [freeSessions, setFreeSessionsRaw] = useState<FreeSession[]>([]);
  const [nutritionStrategy, setNutritionStrategy] = useState<NutritionStrategy | null>(null);
  const [nutritionLog, setNutritionLogRaw] = useState<Record<string, unknown>>({});
  const [visibilitySettings, setVisibilityRaw] = useState<VisibilitySettings>(DEF_VISIBILITY);
  const [testSessions, setTestSessionsRaw] = useState<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "error" | null>(null);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // exos / sessions / completedSessions ne sont PLUS chargés ici : ils sont
      // scopés par cycle (voir l'effet dédié plus bas). Tout le reste est global.
      const [m, s, w, wh, bw, g, an, cm, wl, wmil, inj, bc, bh, ws, ns, nl, sl, fs] =
        await Promise.all([
          load<Record<string, unknown>>(SKEYS.exMeta, {}),
          load<SetsMap>(SKEYS.sets, {}),
          load<WellnessData | null>(SKEYS.wellness, null),
          load<Record<string, WellnessData>>(SKEYS.wellnessHistory, {}),
          load<BodyWeight>(SKEYS.bw, { current: 0, target: 0 }),
          load<Goals>(SKEYS.goals, { sessionsPerWeek: 6, sleepTarget: 8 }),
          load<Record<string, string>>(SKEYS.anotes, {}),
          load<unknown[]>(SKEYS.custMethods, []),
          load<Record<string, number>>(SKEYS.weightLog, {}),
          load<Array<{ date: string; kg: number }>>(SKEYS.weightMilestones, []),
          load<Injury[]>(SKEYS.injuries, []),
          load<BlockConfig>(SKEYS.blockConfig, DEF_BLOCK_CONFIG as BlockConfig),
          load<ArchivedBlock[]>(SKEYS.blockHistory, []),
          load<Record<string, unknown>>(SKEYS.weekSchedule, {}),
          getNutritionStrategy(athleteId).catch(() => null),
          load<Record<string, unknown>>("asp:nutrition_log", {}),
          load<Record<string, SessionLog>>(SKEYS.sessionLogs, {}),
          load<FreeSession[]>(SKEYS.freeSessions, []),
        ]);
      const todayW = w?.date === todayKey() ? w : null;
      if (w && !todayW) save(SKEYS.wellness, null).catch(() => {});
      setExMetaRaw(m); setSetsRaw(s); setWellnessRaw(todayW);
      setWellnessHistoryRaw(wh); setBodyWeightRaw(bw);
      setGoalsRaw(g); setAthleteNotesRaw(an); setCustomMethodsRaw(cm);
      setWeightLogRaw(wl); setWeightMilestonesRaw(wmil); setInjuriesRaw(inj);
      setBlockConfigRaw(bc); setBlockHistoryRaw(bh || []);
      setWeekScheduleRaw(ws || {}); setNutritionStrategy(ns);
      setNutritionLogRaw(nl || {}); setSessionLogsRaw(sl); setFreeSessionsRaw(fs);

      // ── Cycle ouvert + migration legacy → par-cycle (une seule fois) ────────
      const activeCycleId = await determineActiveCycleId(athleteId);
      // Lecture en erreur (réseau, session expirée) ≠ « pas encore migré » :
      // dans le doute on ne migre pas, on réessaiera au prochain chargement.
      const migratedRes = await sLoadResult<boolean>("asp:percycle_migrated", athleteId);
      if (migratedRes.ok && !migratedRes.value) {
        // Le drapeau "migré" ne doit être posé QUE si les recopies ont réussi.
        // Sinon une écriture ratée (réseau) marquait la migration faite alors
        // que le cycle restait vide : programme et séances perdus définitivement.
        let copiesOk = true;
        if (activeCycleId) {
          // Garde-fou : ne recopier le legacy QUE si le cycle actif n'a pas déjà
          // ses propres données scopées (sinon on écraserait un cycle créé via
          // le nouvel assistant). Le blob legacy appartenait au cycle actif.
          const scopedRes = await sLoadResult<ExosMap>(cycleKey(SKEYS.exos, activeCycleId), athleteId);
          if (!scopedRes.ok) {
            copiesOk = false; // impossible de savoir : ne surtout pas écraser
          } else if (scopedRes.value === undefined) {
            try {
              const [le, lsess, lcs] = await Promise.all([
                load<ExosMap | null>(SKEYS.exos, null),
                load<Session[] | null>(SKEYS.sessions, null),
                load<Record<number, string[]> | null>(SKEYS.completed, null),
              ]);
              if (le)    await sSaveCycle(SKEYS.exos, activeCycleId, le, athleteId);
              if (lsess) await sSaveCycle(SKEYS.sessions, activeCycleId, lsess, athleteId);
              if (lcs)   await sSaveCycle(SKEYS.completed, activeCycleId, lcs, athleteId);
            } catch {
              copiesOk = false;
            }
          }
        }
        // Échec → on ne pose pas le drapeau : la migration sera retentée au
        // prochain chargement, quand la connexion sera revenue.
        if (copiesOk) await save("asp:percycle_migrated", true).catch(() => {});
      }
      openCycleRef.current = activeCycleId;
      setOpenCycleIdState(activeCycleId);
      setLoaded(true);
    })();
  }, [athleteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Charge exos / sessions / completed du cycle ouvert ─────────────────────
  // Rejoué à chaque changement de cycle ouvert (ouverture d'un ancien cycle,
  // création d'un nouveau). Clés scopées si cycle, sinon legacy globales.
  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      const id = openCycleId;
      const exKey = id ? cycleKey(SKEYS.exos, id)      : SKEYS.exos;
      const seKey = id ? cycleKey(SKEYS.sessions, id)  : SKEYS.sessions;
      const csKey = id ? cycleKey(SKEYS.completed, id) : SKEYS.completed;
      const [e, sess, cs] = await Promise.all([
        sLoadResult<ExosMap>(exKey, athleteId),
        sLoadResult<Session[]>(seKey, athleteId),
        sLoadResult<Record<number, string[]>>(csKey, athleteId),
      ]);
      if (cancelled) return;
      openCycleRef.current = id;
      const exosVal = e.value || {};
      const sessVal = sess.value && sess.value.length ? sess.value : (DEF_SESSIONS as Session[]);
      const compVal = cs.value || {};
      setExosRaw(exosVal);
      setSessionsRaw(sessVal);
      setCompletedSessionsRaw(compVal);
      // Miroir legacy : les vues coach (overview, retours, missed) lisent encore
      // les clés globales. On les aligne sur le cycle ouvert pour ne rien régresser.
      // Uniquement les valeurs réellement lues en base : jamais un défaut issu
      // d'une erreur de lecture (réseau, session expirée…), qui écraserait les données.
      if (id) {
        if (e.ok && e.value !== undefined)       save(SKEYS.exos, e.value).catch(() => {});
        if (sess.ok && sess.value?.length)       save(SKEYS.sessions, sess.value).catch(() => {});
        if (cs.ok && cs.value !== undefined)     save(SKEYS.completed, cs.value).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [openCycleId, athleteId, save]);

  // ── Visibility settings + test sessions from Supabase ────────────────────
  useEffect(() => {
    if (!athleteId) return;
    supabase.from('test_sessions').select('id,type,title,date,completed')
      .eq('athlete_id', athleteId).order('date', { ascending: true })
      .then(({ data }) => { if (data) setTestSessionsRaw(data); });
    supabase.from('app_data').select('value')
      .eq('athlete_id', athleteId).eq('key', 'asp:visibility').maybeSingle()
      .then(({ data }) => { if (data?.value) setVisibilityRaw(v => ({ ...v, ...(data.value as VisibilitySettings) })); });
  }, [athleteId]);

  // ── Wellness midnight reset ────────────────────────────────────────────────
  useEffect(() => {
    if (!wellness) return;
    const now = new Date(); const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    const tid = setTimeout(() => { setWellnessRaw(null); save(SKEYS.wellness, null).catch(() => {}); }, +midnight - +now);
    return () => clearTimeout(tid);
  }, [wellness]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save flash ────────────────────────────────────────────────────────────
  const flash = useCallback((ok: boolean) => {
    setSaveStatus(ok ? "saved" : "error");
    setTimeout(() => setSaveStatus(null), 2000);
  }, []);

  // Toute écriture d'une saisie athlète passe par ici. Avant, la plupart des
  // setters faisaient `.catch(() => {})` : l'UI se mettait à jour de façon
  // optimiste, l'écriture échouait (réseau coupé en salle) et la saisie
  // disparaissait au rechargement suivant, sans aucun signal. On flashe l'état
  // ET on remonte un toast. `id` fixe : sonner remplace le toast au lieu d'en
  // empiler un par écriture ratée.
  const persist = useCallback((p: Promise<unknown>): void => {
    p.then(() => flash(true)).catch(() => {
      flash(false);
      toast.error("Sauvegarde échouée — vérifie ta connexion", { id: "asp-persist-error" });
    });
  }, [flash]);

  // ── Wrapped setters (persist on write) ────────────────────────────────────
  const setExos = useCallback((v: ExosMap | ((p: ExosMap) => ExosMap)) => {
    setExosRaw(prev => { const val = typeof v === 'function' ? v(prev) : v; persist(saveBoth(SKEYS.exos, val)); return val; });
  }, [saveBoth, persist]);

  // Ouvre un autre cycle : maj du ref (synchrone) + état → recharge exos/séances.
  const setOpenCycleId = useCallback((id: string | null) => {
    openCycleRef.current = id;
    setOpenCycleIdState(id);
  }, []);

  const setExMeta = useCallback((v: Record<string, unknown> | ((p: Record<string, unknown>) => Record<string, unknown>)) => {
    setExMetaRaw(prev => { const val = typeof v === 'function' ? v(prev) : v; persist(save(SKEYS.exMeta, val)); return val; });
  }, [save, persist]);

  const setSets = useCallback((v: SetsMap) => { setSetsRaw(v); persist(save(SKEYS.sets, v)); }, [save, persist]);
  const setBodyWeight = useCallback((v: BodyWeight) => { setBodyWeightRaw(v); persist(save(SKEYS.bw, v)); }, [save, persist]);

  const setGoals = useCallback((v: Goals | ((p: Goals) => Goals)) => {
    setGoalsRaw(prev => { const val = typeof v === 'function' ? v(prev) : v; persist(save(SKEYS.goals, val)); return val; });
  }, [save, persist]);

  const setCompletedSessions = useCallback((v: Record<number, string[]>) => { setCompletedSessionsRaw(v); persist(saveBoth(SKEYS.completed, v)); }, [saveBoth, persist]);
  const setAthleteNotes = useCallback((v: Record<string, string>) => { setAthleteNotesRaw(v); persist(save(SKEYS.anotes, v)); }, [save, persist]);

  const setCustomMethods = useCallback((v: unknown[]) => {
    setCustomMethodsRaw(v); persist(save(SKEYS.custMethods, v));
  }, [save, persist]);

  const setSessions = useCallback((v: Session[] | ((p: Session[]) => Session[])) => {
    setSessionsRaw(prev => { const val = typeof v === 'function' ? v(prev) : v; persist(saveBoth(SKEYS.sessions, val)); return val; });
  }, [saveBoth, persist]);

  const setBlockConfig = useCallback((v: BlockConfig | ((p: BlockConfig) => BlockConfig)) => {
    setBlockConfigRaw(prev => { const val = typeof v === 'function' ? v(prev) : v; persist(save(SKEYS.blockConfig, val)); return val; });
  }, [save, persist]);

  const setBlockHistory = useCallback((v: ArchivedBlock[]) => {
    setBlockHistoryRaw(v); persist(save(SKEYS.blockHistory, v));
  }, [save, persist]);

  const setWeekSchedule = useCallback((v: Record<string, unknown>) => { setWeekScheduleRaw(v); persist(save(SKEYS.weekSchedule, v)); }, [save, persist]);
  const setSessionLogs = useCallback((v: Record<string, SessionLog>) => { setSessionLogsRaw(v); persist(save(SKEYS.sessionLogs, v)); }, [save, persist]);
  const setFreeSessions = useCallback((v: FreeSession[] | ((prev: FreeSession[]) => FreeSession[])) => {
    setFreeSessionsRaw(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      persist(save(SKEYS.freeSessions, next));
      return next;
    });
  }, [save, persist]);

  // Accepte aussi la forme updater : AlimPage appelle setNutritionLog(prev => …).
  // Avant, la fonction elle-même partait dans sSave → `value` disparaissait du
  // JSON envoyé à Supabase → le journal nutrition du jour n'était jamais persisté.
  const setNutritionLog = useCallback(
    (v: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => {
      setNutritionLogRaw(prev => {
        const next = typeof v === "function" ? v(prev) : v;
        persist(save("asp:nutrition_log", next));
        return next;
      });
    },
    [save, persist],
  );

  const setVisibilitySettings = useCallback(async (settings: VisibilitySettings) => {
    setVisibilityRaw(settings);
    const { error } = await supabase.from('app_data').upsert(
      { athlete_id: athleteId, key: 'asp:visibility', value: settings, updated_at: new Date().toISOString() },
      { onConflict: 'athlete_id,key' },
    );
    if (error) {
      flash(false);
      toast.error("Sauvegarde échouée — vérifie ta connexion", { id: "asp-persist-error" });
    } else {
      flash(true);
    }
  }, [athleteId, flash]);

  const setWellness = useCallback((v: WellnessData | null) => {
    setWellnessRaw(v); persist(save(SKEYS.wellness, v));
  }, [save, persist]);

  const setWellnessHistory = useCallback((v: Record<string, WellnessData>) => {
    setWellnessHistoryRaw(v); persist(save(SKEYS.wellnessHistory, v));
  }, [save, persist]);

  const setWeightLog = useCallback((v: Record<string, number>) => {
    setWeightLogRaw(v); persist(save(SKEYS.weightLog, v));
  }, [save, persist]);

  const setWeightMilestones = useCallback((v: Array<{ date: string; kg: number }>) => {
    setWeightMilestonesRaw(v); persist(save(SKEYS.weightMilestones, v));
  }, [save, persist]);

  const setInjuries = useCallback((v: Injury[]) => { setInjuriesRaw(v); persist(save(SKEYS.injuries, v)); }, [save, persist]);

  return {
    // Raw state (read)
    exos, exMeta, sets, sessions, blockConfig, completedSessions, goals,
    athleteNotes, customMethods, weightLog, weightMilestones, injuries,
    wellness, wellnessHistory, bodyWeight, blockHistory, weekSchedule,
    sessionLogs, freeSessions, nutritionStrategy, setNutritionStrategy,
    nutritionLog, visibilitySettings, testSessions, setTestSessions: setTestSessionsRaw,
    loaded, saveStatus,
    // Cycle ouvert (stockage exos/séances scopé par cycle)
    openCycleId, setOpenCycleId,
    // Wrapped setters (write + persist)
    setExos, setExMeta, setSets, setBodyWeight, setGoals, setCompletedSessions,
    setAthleteNotes, setCustomMethods, setSessions, setBlockConfig, setBlockHistory,
    setWeekSchedule, setSessionLogs, setFreeSessions, setNutritionLog,
    setVisibilitySettings, setWellness, setWellnessHistory,
    setWeightLog, setWeightMilestones, setInjuries,
    // Internal raw setters needed by logic hooks
    _setBodyWeightRaw: setBodyWeightRaw,
    _setWeightLogRaw: setWeightLogRaw,
    _setWeightMilestonesRaw: setWeightMilestonesRaw,
    _setWellnessRaw: setWellnessRaw,
    _setWellnessHistoryRaw: setWellnessHistoryRaw,
    _setSetsRaw: setSetsRaw,
    _setCompletedSessionsRaw: setCompletedSessionsRaw,
    _setAthleteNotesRaw: setAthleteNotesRaw,
  };
}
