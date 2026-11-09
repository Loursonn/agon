import { useState, useEffect, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  SKEYS, sLoadResult, sSave, cycleKey, sSaveCycle,
  isKeyLoadFailed, isKeyNotLoadedError, KeyNotLoadedError, markKeyLoad,
} from "@/lib/storage";
import { mergeLocalIntoServer } from "@/lib/mergeLocal";
import { DEF_SESSIONS, DEF_BLOCK_CONFIG } from "@/lib/exercises";
import { todayKey } from "@/lib/date";
import type {
  ExosMap, SetsMap, Session, BlockConfig, WellnessData,
  BodyWeight, Goals, ArchivedBlock,
  VisibilitySettings, SessionLog, FreeSession,
} from "../types/athlete";
import { readAppData, writeAppData } from "@/api/appData";
import { listTestSessions } from "@/api/tests";
import { listAthleteCycles } from "@/api/cycles";
import { getWellnessHistory, toLegacyToday, toLegacyWellnessHistory } from "@/api/wellness";
import {
  getBodyWeightGoal, getWeightLog, getWeightMilestones,
  toLegacyBodyWeight, toLegacyMilestones, toLegacyWeightLog,
} from "@/api/profile";

/**
 * Clé dont la lecture a échoué : comment la réappliquer une fois relue.
 * `apply(server, dirty)` — dirty = l'athlète a modifié la valeur pendant que
 * l'écriture était bloquée → on fusionne sa saisie dans la valeur serveur.
 */
interface Reloader {
  fb: unknown;
  apply: (server: unknown, dirty: boolean) => void;
  /** Relecture propre à la clé (tables santé via `src/api`) ; absent = `sLoadResult`. */
  load?: () => Promise<{ ok: boolean; value?: unknown }>;
}

const NOT_LOADED_TOAST = "asp-not-loaded";
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000, 30_000, 60_000];

const DEF_VISIBILITY: VisibilitySettings = {
  muscu: true, energy: true, tests: true, wellness: true,
  nutrition: true, pr: true, weight: true,
};

/** Cycle ouvert par défaut : celui qui couvre aujourd'hui, sinon le plus récent. */
async function determineActiveCycleId(athleteId: string): Promise<string | null> {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let rows: { id: string; start_date: string; end_date: string }[];
  try {
    rows = await listAthleteCycles(athleteId, { direct: true, newestFirst: true });
  } catch {
    return null; // comme avant : sans cycles lisibles, clés globales
  }
  if (rows.length === 0) return null;
  const covering = rows.find((c) => c.start_date <= today && today <= c.end_date);
  return (covering ?? rows[0]).id;
}

/**
 * @param opts.readOnly  Lecteur sans droit d'écriture (professionnel du staff) :
 *   aucune écriture (migration par cycle, miroir legacy, sauvegardes).
 */
export function useAthletePersistedState(athleteId: string, opts?: { readOnly?: boolean }) {
  // Lecteur sans droit d'écriture (staff) : aucune écriture, ni miroir legacy
  // ni sauvegarde. La RLS les refuserait de toute façon.
  const readOnly = !!opts?.readOnly;

  // ── Clés non chargées (lecture en erreur) ──────────────────────────────────
  // Leur écriture est bloquée (voir sSave) : l'état local n'y vaut que le défaut
  // et le réécrire effacerait l'historique en base. On les relit automatiquement
  // (délai croissant, retour du réseau, retour au premier plan).
  const failedRef = useRef(new Map<string, Reloader>());
  // Clés modifiées localement pendant que leur écriture était bloquée.
  const dirtyRef = useRef(new Set<string>());
  const [unloadedKeys, setUnloadedKeys] = useState<string[]>([]);
  const syncUnloaded = useCallback(() => setUnloadedKeys([...failedRef.current.keys()]), []);
  const athleteIdRef = useRef(athleteId);
  athleteIdRef.current = athleteId;

  const save = useCallback(
    (k: string, v: unknown): Promise<void> => {
      if (readOnly) return Promise.resolve();
      // sSave ignore null/undefined : rien n'est écrit, donc rien à bloquer.
      if (v === null || v === undefined) return Promise.resolve();
      if (isKeyLoadFailed(k, athleteId)) {
        dirtyRef.current.add(k);
        return Promise.reject(new KeyNotLoadedError(k));
      }
      return sSave(k, v, athleteId);
    },
    [athleteId, readOnly],
  );

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
    if (readOnly) return Promise.resolve();
    const k = keyFor(base);
    const p = save(k, val);
    // Miroir seulement si la clé scopée a pu partir (sinon on recopierait un défaut).
    if (k !== base) p.then(() => sSave(base, val, athleteId)).catch(() => {});
    return p;
  }, [keyFor, athleteId, readOnly, save]);

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
  const [wellness, setWellnessRaw] = useState<WellnessData | null>(null);
  const [wellnessHistory, setWellnessHistoryRaw] = useState<Record<string, WellnessData>>({});
  const [bodyWeight, setBodyWeightRaw] = useState<BodyWeight>({ current: 0, target: 0 });
  const [blockHistory, setBlockHistoryRaw] = useState<ArchivedBlock[]>([]);
  const [weekSchedule, setWeekScheduleRaw] = useState<Record<string, unknown>>({});
  const [sessionLogs, setSessionLogsRaw] = useState<Record<string, SessionLog>>({});
  const [freeSessions, setFreeSessionsRaw] = useState<FreeSession[]>([]);
  const [visibilitySettings, setVisibilityRaw] = useState<VisibilitySettings>(DEF_VISIBILITY);
  const [testSessions, setTestSessionsRaw] = useState<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "error" | null>(null);

  // ── Rechargement au retour dans l'app ──────────────────────────────────────
  // Le provider n'est plus remonté à chaque navigation (App.tsx) : sans ça, une
  // modification du coach n'apparaîtrait qu'après un rechargement manuel.
  // On relit tout quand l'app revient au premier plan après une longue absence.
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    const AWAY_MS = 10 * 60 * 1000;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) setRefreshNonce((n) => n + 1);
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
  // Renvoie true seulement si le serveur a confirmé l'écriture.
  const persist = useCallback((p: Promise<unknown>): Promise<boolean> => {
    return p.then(
      () => { flash(true); return true; },
      (e) => {
        if (isKeyNotLoadedError(e)) {
          // Écriture retenue (clé non chargée) : elle partira, fusionnée avec
          // la base, dès que la relecture réussira.
          toast.warning("Données pas encore chargées — ta saisie sera enregistrée au retour du réseau", { id: NOT_LOADED_TOAST });
          return false;
        }
        flash(false);
        toast.error("Sauvegarde échouée — vérifie ta connexion", { id: "asp-persist-error" });
        return false;
      },
    );
  }, [flash]);

  /** Réapplication d'une clé relue avec succès (fusion si saisie locale entre-temps). */
  const makeReloader = useCallback(<T,>(
    fb: T,
    setRaw: Dispatch<SetStateAction<T>>,
    write: (v: T) => Promise<unknown>,
    normalize?: (v: T) => T,
    isCurrent?: () => boolean,
  ): Reloader => ({
    fb,
    apply: (server, dirty) => {
      if (isCurrent && !isCurrent()) return;
      const sv = normalize ? normalize(server as T) : (server as T);
      if (!dirty) { setRaw(sv); return; }
      setRaw((prev) => {
        const merged = mergeLocalIntoServer(sv, prev, fb);
        void persist(write(merged));
        return merged;
      });
    },
  }), [persist]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // exos / sessions / completedSessions ne sont PLUS chargés ici : ils sont
      // scopés par cycle (voir l'effet dédié plus bas). Tout le reste est global.
      failedRef.current.clear();
      dirtyRef.current.clear();
      // Lecture qui distingue « clé absente » (défaut légitime) de « lecture en
      // erreur » : dans ce cas la clé est enregistrée pour relecture et son
      // écriture reste bloquée d'ici là.
      const tracked = async <T,>(
        k: string, fb: T, setRaw: Dispatch<SetStateAction<T>>, normalize?: (v: T) => T,
      ): Promise<T> => {
        const r = await sLoadResult<T>(k, athleteId);
        if (r.ok) return r.value === undefined ? fb : (r.value as T);
        failedRef.current.set(k, makeReloader(fb, setRaw, (v) => save(k, v), normalize));
        return fb;
      };
      const todayOnly = (v: WellnessData | null) => (v?.date === todayKey() ? v : null);
      // Wellness, pesées, paliers, objectif : tables santé lues par `src/api`
      // (docs/SANTE_TABLES.md), rendues dans la forme des anciennes clés
      // `asp:*` que les composants attendent. Une lecture en erreur bloque
      // l'écriture de la clé, comme `tracked`, jusqu'à une relecture réussie.
      const trackedApi = async <T,>(
        k: string, fb: T, setRaw: Dispatch<SetStateAction<T>>, read: () => Promise<T>, normalize?: (v: T) => T,
      ): Promise<T> => {
        const load = async (): Promise<{ ok: boolean; value?: unknown }> => {
          try {
            const value = await read();
            markKeyLoad(k, athleteId, true);
            return { ok: true, value };
          } catch {
            markKeyLoad(k, athleteId, false);
            return { ok: false };
          }
        };
        const r = await load();
        if (r.ok) return r.value as T;
        failedRef.current.set(k, { ...makeReloader(fb, setRaw, (v) => save(k, v), normalize), load });
        return fb;
      };
      // Une seule lecture du wellness pour l'historique et la saisie du jour.
      // (la relecture après une erreur, elle, refait la requête.)
      const readWellness = () => getWellnessHistory(athleteId, { includeArchived: false });
      let firstRead: ReturnType<typeof readWellness> | null = readWellness();
      const wellnessRead = () => firstRead ?? readWellness();
      const [m, s, w, wh, bw, g, an, cm, wl, wmil, bc, bh, ws, sl, fs] =
        await Promise.all([
          tracked<Record<string, unknown>>(SKEYS.exMeta, {}, setExMetaRaw),
          tracked<SetsMap>(SKEYS.sets, {}, setSetsRaw),
          trackedApi<WellnessData | null>(SKEYS.wellness, null, setWellnessRaw,
            async () => (toLegacyToday(await wellnessRead()) as WellnessData | null), todayOnly),
          trackedApi<Record<string, WellnessData>>(SKEYS.wellnessHistory, {}, setWellnessHistoryRaw,
            async () => toLegacyWellnessHistory(await wellnessRead()) as unknown as Record<string, WellnessData>),
          trackedApi<BodyWeight>(SKEYS.bw, { current: 0, target: 0 }, setBodyWeightRaw,
            async () => toLegacyBodyWeight(await getBodyWeightGoal(athleteId))),
          tracked<Goals>(SKEYS.goals, { sessionsPerWeek: 6, sleepTarget: 8 }, setGoalsRaw),
          tracked<Record<string, string>>(SKEYS.anotes, {}, setAthleteNotesRaw),
          tracked<unknown[]>(SKEYS.custMethods, [], setCustomMethodsRaw),
          trackedApi<Record<string, number>>(SKEYS.weightLog, {}, setWeightLogRaw,
            async () => toLegacyWeightLog(await getWeightLog(athleteId))),
          trackedApi<Array<{ date: string; kg: number }>>(SKEYS.weightMilestones, [], setWeightMilestonesRaw,
            async () => toLegacyMilestones(await getWeightMilestones(athleteId))),
          tracked<BlockConfig>(SKEYS.blockConfig, DEF_BLOCK_CONFIG as BlockConfig, setBlockConfigRaw),
          tracked<ArchivedBlock[]>(SKEYS.blockHistory, [], setBlockHistoryRaw, (v) => v || []),
          tracked<Record<string, unknown>>(SKEYS.weekSchedule, {}, setWeekScheduleRaw, (v) => v || {}),
          tracked<Record<string, SessionLog>>(SKEYS.sessionLogs, {}, setSessionLogsRaw),
          tracked<FreeSession[]>(SKEYS.freeSessions, [], setFreeSessionsRaw),
        ]);
      firstRead = null;
      const todayW = todayOnly(w);
      setExMetaRaw(m); setSetsRaw(s); setWellnessRaw(todayW);
      setWellnessHistoryRaw(wh); setBodyWeightRaw(bw);
      setGoalsRaw(g); setAthleteNotesRaw(an); setCustomMethodsRaw(cm);
      setWeightLogRaw(wl); setWeightMilestonesRaw(wmil);
      setBlockConfigRaw(bc); setBlockHistoryRaw(bh || []);
      setWeekScheduleRaw(ws || {});
      setSessionLogsRaw(sl); setFreeSessionsRaw(fs);

      // ── Cycle ouvert + migration legacy → par-cycle (une seule fois) ────────
      const activeCycleId = await determineActiveCycleId(athleteId);
      // Lecture en erreur (réseau, session expirée) ≠ « pas encore migré » :
      // dans le doute on ne migre pas, on réessaiera au prochain chargement.
      const migratedRes = await sLoadResult<boolean>("asp:percycle_migrated", athleteId);
      if (!readOnly && migratedRes.ok && !migratedRes.value) {
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
              const [leR, lsessR, lcsR] = await Promise.all([
                sLoadResult<ExosMap>(SKEYS.exos, athleteId),
                sLoadResult<Session[]>(SKEYS.sessions, athleteId),
                sLoadResult<Record<number, string[]>>(SKEYS.completed, athleteId),
              ]);
              // Lecture legacy en erreur → on ne sait pas s'il y avait des
              // données : ne pas poser le drapeau, la migration sera retentée.
              if (!leR.ok || !lsessR.ok || !lcsR.ok) throw new Error("legacy read failed");
              const le = leR.value, lsess = lsessR.value, lcs = lcsR.value;
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
      syncUnloaded();
    })();
  }, [athleteId, refreshNonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Lecture en erreur : écriture bloquée + relecture auto, uniquement tant
      // que ce cycle reste celui ouvert.
      const isCurrent = (k: string, base: string) => () => keyFor(base) === k;
      const reg = <T,>(
        res: { ok: boolean }, k: string, base: string, fb: T,
        setRaw: Dispatch<SetStateAction<T>>, normalize?: (v: T) => T,
      ) => {
        if (res.ok) { failedRef.current.delete(k); dirtyRef.current.delete(k); return; }
        failedRef.current.set(k, makeReloader(fb, setRaw, (v) => saveBoth(base, v), normalize, isCurrent(k, base)));
      };
      reg<ExosMap>(e, exKey, SKEYS.exos, {}, setExosRaw, (v) => v || {});
      reg<Session[]>(sess, seKey, SKEYS.sessions, DEF_SESSIONS as Session[], setSessionsRaw,
        (v) => (v && v.length ? v : (DEF_SESSIONS as Session[])));
      reg<Record<number, string[]>>(cs, csKey, SKEYS.completed, {}, setCompletedSessionsRaw, (v) => v || {});
      syncUnloaded();
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
  }, [openCycleId, athleteId, save, refreshNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Relecture automatique des clés en erreur ───────────────────────────────
  const retryingRef = useRef(false);
  const retryFailed = useCallback(async () => {
    if (retryingRef.current || failedRef.current.size === 0) return;
    retryingRef.current = true;
    const aid = athleteId;
    try {
      const entries = [...failedRef.current.entries()];
      const results = await Promise.all(entries.map(([k, r]) => (r.load ? r.load() : sLoadResult(k, aid))));
      if (aid !== athleteIdRef.current) return; // athlète changé pendant la relecture
      entries.forEach(([k, r], i) => {
        const res = results[i];
        if (!res.ok || failedRef.current.get(k) !== r) return;
        failedRef.current.delete(k);
        const dirty = dirtyRef.current.delete(k);
        r.apply(res.value === undefined ? r.fb : res.value, dirty);
      });
    } finally {
      retryingRef.current = false;
      syncUnloaded();
    }
  }, [athleteId, syncUnloaded]);

  const hasUnloaded = unloadedKeys.length > 0;
  useEffect(() => {
    if (!hasUnloaded) { toast.dismiss(NOT_LOADED_TOAST); return; }
    toast.warning("Certaines données n'ont pas pu être chargées — nouvel essai…", { id: NOT_LOADED_TOAST });
    let attempt = 0;
    let tid: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      const d = RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)];
      tid = setTimeout(async () => {
        await retryFailed();
        if (!stopped && failedRef.current.size > 0) schedule();
      }, d);
    };
    schedule();
    const onOnline = () => { void retryFailed(); };
    const onVisible = () => { if (document.visibilityState === "visible") void retryFailed(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(tid);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasUnloaded, retryFailed]);

  // ── Visibility settings + test sessions from Supabase ────────────────────
  useEffect(() => {
    if (!athleteId) return;
    listTestSessions(athleteId)
      .then(setTestSessionsRaw)
      .catch(() => { /* garde la liste déjà affichée */ });
    readAppData<VisibilitySettings>(athleteId, 'asp:visibility')
      .then(({ value }) => { if (value) setVisibilityRaw(v => ({ ...v, ...value })); })
      .catch(() => { /* réglages par défaut : tout visible */ });
  }, [athleteId, refreshNonce]);

  // ── Wellness midnight reset ────────────────────────────────────────────────
  useEffect(() => {
    if (!wellness) return;
    const now = new Date(); const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    const tid = setTimeout(() => { setWellnessRaw(null); save(SKEYS.wellness, null).catch(() => {}); }, +midnight - +now);
    return () => clearTimeout(tid);
  }, [wellness]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const setVisibilitySettings = useCallback(async (settings: VisibilitySettings) => {
    setVisibilityRaw(settings);
    try {
      await writeAppData(athleteId, 'asp:visibility', settings);
      flash(true);
    } catch {
      flash(false);
      toast.error("Sauvegarde échouée — vérifie ta connexion", { id: "asp-persist-error" });
    }
  }, [athleteId, flash]);

  // Ces trois setters renvoient la confirmation serveur (true/false) : la saisie
  // wellness n'affiche son succès / ne purge son brouillon qu'après confirmation.
  const setWellness = useCallback((v: WellnessData | null): Promise<boolean> => {
    setWellnessRaw(v); return persist(save(SKEYS.wellness, v));
  }, [save, persist]);

  const setWellnessHistory = useCallback((v: Record<string, WellnessData>): Promise<boolean> => {
    setWellnessHistoryRaw(v); return persist(save(SKEYS.wellnessHistory, v));
  }, [save, persist]);

  const setWeightMilestones = useCallback((v: Array<{ date: string; kg: number }>) => {
    setWeightMilestonesRaw(v); persist(save(SKEYS.weightMilestones, v));
  }, [save, persist]);


  return {
    // Raw state (read)
    exos, exMeta, sets, sessions, blockConfig, completedSessions, goals,
    athleteNotes, customMethods, weightLog, weightMilestones,
    wellness, wellnessHistory, bodyWeight, blockHistory, weekSchedule,
    sessionLogs, freeSessions, visibilitySettings, testSessions, setTestSessions: setTestSessionsRaw,
    loaded, saveStatus,
    /** Clés app_data dont la lecture a échoué (écriture bloquée, relecture en cours). */
    unloadedKeys,
    // Cycle ouvert (stockage exos/séances scopé par cycle)
    openCycleId, setOpenCycleId,
    // Wrapped setters (write + persist)
    setExos, setExMeta, setSets, setGoals, setCompletedSessions,
    setAthleteNotes, setCustomMethods, setSessions, setBlockConfig, setBlockHistory,
    setWeekSchedule, setSessionLogs, setFreeSessions,
    setVisibilitySettings, setWellness, setWellnessHistory,
    setWeightMilestones,
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
