import { ACCENT, ACCENT_ALT, GREEN, REST_DEFAULT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import type { AllSets, PadTarget } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import { BLANK_SET, allSetsToMods, blocRestSeconds, buildExSets, countSets, formatElapsed, formatPrescription, getSetTarget, haptic, hexToRgba, normalizeSet, parsePrevVal, prescribedKg, sameSets, timingLabel } from "@/features/athlete/components/workout-detail/workoutDetailUtils";
import { BadgeTag } from "@/features/athlete/components/workout-detail/BadgeTag";
import { C } from "@/lib/theme";
import { ExerciceCard } from "@/features/athlete/components/workout-detail/ExerciceCard";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";
import { FinishWorkoutSheet } from "@/features/athlete/components/workout/FinishWorkoutSheet";
import { type FocusExercise, firstPendingBloc, nextPendingSet, stepValue } from "@/lib/workoutFocus";
import { FocusInputBar } from "@/features/athlete/components/workout/FocusInputBar";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LibreComment } from "@/features/athlete/components/workout-detail/LibreComment";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { NumPad } from "@/features/athlete/components/workout-detail/NumPad";
import { PENDING_VALIDATION_MESSAGE, assertNoPendingValidation, isPendingWriteError, notifyQueued, queueIsDurable, submitWrite } from "@/lib/offline/writes";
import type { RecordSet } from "@shared/domain/performance";
import { RestTimer } from "@/features/athlete/components/workout-detail/RestTimer";
import { RirAfterSetSheet } from "@/features/athlete/components/workout/RirAfterSetSheet";
import { RirPicker } from "@/features/athlete/components/workout-detail/RirPicker";
import { RpeSheetForLog } from "@/features/athlete/components/workout-detail/RpeSheetForLog";
import { SupersetCard } from "@/features/athlete/components/workout-detail/SupersetCard";
import { VideoRequestBanner, VideoRequestRow } from "@/features/athlete/components/VideoRequest";
import { WORKOUT_GONE_MESSAGE } from "@/features/shared/hooks/useUpsertWorkoutRpe";
import { type WorkoutExerciceData, useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import { applyOptimisticWorkout, draftAlreadyOnServer } from "@/lib/optimisticWorkout";
import { blocColor } from "@/lib/peps";
import { blocLetter, prescriptionLine } from "@/lib/todayPreview";
import { classifyWriteError } from "@/lib/offline/writeQueue";
import { clearDraft, loadDraft, workoutDraftKey } from "@/lib/localDraft";
import { collectRecordSets, newRecordsMessage } from "@/lib/offline/sessionRecords";
import { computeRecordsFromSession, invalidateRecords, resolveRecordRef } from "@/api/records";
import { invalidateWorkouts, isWorkoutNotFound, reopenWorkout as reopenWorkoutLog } from "@/api/workouts";
import { isAllIso, isIsoAt } from "@/lib/formatSetsReps";
import { localIsoDay } from "@shared/domain/dates";
import { parseKm } from "@/features/shared/components/runDistance";
import { toast } from "sonner";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useExerciseVideos } from "@/features/shared/hooks/useExerciseVideos";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePRsByRef, useRecordLinks } from "@/features/shared/hooks/usePRLogs";
import { usePrevWorkoutSets } from "@/features/shared/hooks/usePrevWorkoutSets";
import { useSaveWorkoutSets } from "@/features/shared/hooks/useSaveWorkoutSets";


// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { athleteId } = useAthleteContext();
  const qc = useQueryClient();

  const workout = useWorkoutSession(id);
  const { save: saveWorkoutSets, flushNow: flushWorkoutSets, discardPending } = useSaveWorkoutSets(id, athleteId);

  // ── State ────────────────────────────────────────────────────────────────
  const [sets, setSets] = useState<AllSets>({});
  const [setsInit, setSetsInit] = useState(false);
  const [localMods, setLocalMods] = useState<AthleteModifications>({});
  const [padTarget, setPadTarget] = useState<PadTarget | null>(null);
  const [padVal, setPadVal] = useState("");
  // Mode « un bloc à la fois » + zone de saisie du bas (maquette « Séance en cours »).
  const [focusMode, setFocusMode] = useState(true);
  const [focusBloc, setFocusBloc] = useState<number | null>(null);
  const [rirAsk, setRirAsk] = useState<{ exId: string; setIdx: number; exName: string; target: string | null } | null>(null);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(REST_DEFAULT);
  const [restNextInfo, setRestNextInfo] = useState<string | null>(null);
  const [restActiveKey, setRestActiveKey] = useState<string | null>(null);
  const [showFinish, setShowFinish] = useState(false);
  const [showRpe, setShowRpe] = useState(false);
  const [videoModal, setVideoModal] = useState<{ name: string; ytId: string } | null>(null);
  const [elapsed, setElapsed] = useState(() => {
    // Recover elapsed from persisted startedAt
    const stored = localStorage.getItem("activeWorkoutSession");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.id === id && parsed.startedAt) {
          return Math.floor((Date.now() - parsed.startedAt) / 1000);
        }
      } catch { /* ignore */ }
    }
    return 0;
  });

  const restRef = useRef<ReturnType<typeof setInterval>>();
  const elapsedRef = useRef<ReturnType<typeof setInterval>>();
  const loopRef = useRef(false);
  const restSecondsRef = useRef(REST_DEFAULT);

  // ── Collect all exIds for usePrevWorkoutSets ─────────────────────────────
  const allExIds = useMemo(
    () => workout.blocs.flatMap((b) => b.exercices.map((e) => e.id)),
    [workout.blocs],
  );

  const prevSets = usePrevWorkoutSets(
    workout.sessionId,
    workout.workoutLogId,
    allExIds,
    workout.weekNumber,
    workout.scheduledDate,
  );

  // ── Records : 1RM pour convertir les %RM, références pour les nouveaux records ──
  const { bestByRef } = usePRsByRef(athleteId);
  const { data: recordLinks } = useRecordLinks(athleteId);
  const recordRefByEx = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const bloc of workout.blocs) {
      for (const ex of bloc.exercices) out[ex.id] = resolveRecordRef(ex, recordLinks ?? {});
    }
    return out;
  }, [workout.blocs, recordLinks]);
  const oneRmByEx = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [exId, ref] of Object.entries(recordRefByEx)) out[exId] = ref ? bestByRef[ref]?.kg ?? null : null;
    return out;
  }, [recordRefByEx, bestByRef]);

  // ── Vidéos banque d'exercices (exercise_id → youtube_id) ─────────────────
  const bankExerciseIds = useMemo(
    () => [...new Set(workout.blocs.flatMap((b) => b.exercices.map((e) => e.exercise_id).filter((x): x is string => !!x)))],
    [workout.blocs],
  );
  const { data: videoMap = {} } = useExerciseVideos(bankExerciseIds);

  // ── Init + resync des séries dès que la séance change ────────────────────
  // Cet effet ne s'exécute pas qu'une fois : les blocs peuvent changer APRÈS le
  // premier rendu (semaine résolue par une requête plus lente, programme modifié
  // par le coach et refetch au retour sur l'onglet…). Avec l'ancienne init
  // "une seule fois", un exercice apparu ensuite n'avait aucune ligne dans
  // `sets` → le clic renvoyait un SetState vide → crash à la sauvegarde.
  // La saisie en cours n'est jamais écrasée et aucune ligne n'est supprimée.
  //
  // Tant que le workout_log n'est pas RÉELLEMENT lu (hors ligne, erreur), on
  // n'initialise rien : sinon `localMods` partait de {} et la 1re série envoyée
  // au retour du réseau effaçait coachOverride et commentaires.
  useEffect(() => {
    if (workout.isLoading || workout.logStatus !== "ready" || !workout.workoutLogId) return;

    const serverMods = workout.athleteModifications ?? {};
    let base = serverMods;
    // Brouillon local non synchronisé (app tuée / envoi raté) = plus récent que
    // la base : on le restaure, en gardant l'adaptation coach lue en base.
    let restored = false;
    if (!setsInit && athleteId && id) {
      const draft = loadDraft<AthleteModifications>(workoutDraftKey(athleteId, id));
      // Brouillon « non synchronisé » mais déjà entièrement en base (parti par
      // la file hors ligne ou en keepalive, sans accusé de réception) : rien à
      // restaurer ni à renvoyer.
      if (draft && !draft.synced && !draftAlreadyOnServer(serverMods, draft.value)) {
        base = { ...draft.value, coachOverride: serverMods.coachOverride };
        restored = true;
      }
    }
    const savedSets = base.sessionSets ?? {};

    setSets((prev) => {
      const next: AllSets = { ...prev };
      let changed = false;

      for (const bloc of workout.blocs) {
        for (const ex of bloc.exercices) {
          const rows = buildExSets(ex, savedSets[ex.id], prev[ex.id], oneRmByEx[ex.id]);
          if (!sameSets(rows, prev[ex.id])) {
            next[ex.id] = rows;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });

    if (!setsInit) {
      setLocalMods(base);
      setSetsInit(true);
      if (restored) {
        flushWorkoutSets(base);
        toast.info("Saisie non envoyée retrouvée — envoi en cours", { id: "workout-draft-restored" });
      }
    }
  }, [workout.isLoading, workout.logStatus, workout.workoutLogId, workout.blocs, workout.athleteModifications, setsInit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── %RM : records chargés après l'ouverture → charge convertie dans les
  // cases encore vides (jamais une série déjà validée, passée ou saisie).
  useEffect(() => {
    if (!setsInit) return;
    setSets((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const bloc of workout.blocs) {
        for (const ex of bloc.exercices) {
          if (ex.params.charge_unit !== "%RM" || ex.mode === "libre") continue;
          const exSets = next[ex.id];
          if (!exSets) continue;
          const nb = ex.params.cluster?.nb_clusters ?? 1;
          const updated = exSets.map((raw, i) => {
            const s = normalizeSet(raw);
            if (s.done || s.skipped || s.kg) return raw;
            const t = ex.params.cluster
              ? prescribedKg(ex.params, ex.params.charge.mode === "global" ? ex.params.charge.value : null, oneRmByEx[ex.id])
              : getSetTarget(ex.params, Math.floor(i / nb), oneRmByEx[ex.id]).kg;
            return t != null ? { ...s, kg: String(t).replace(".", ",") } : raw;
          });
          if (updated.some((u, i) => u !== exSets[i])) {
            next[ex.id] = updated;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [setsInit, oneRmByEx, workout.blocs]);

  // ── Backfill empty cells from prevSets once they load ───────────────────
  useEffect(() => {
    if (!setsInit || Object.keys(prevSets).length === 0) return;
    setSets((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [exId, exSets] of Object.entries(next)) {
        const prevEx = prevSets[exId];
        if (!prevEx) continue;
        const updated = exSets.map((raw, i) => {
          const s = raw ?? normalizeSet(raw);
          if (s.done || s.skipped) return s;
          const prevStr = prevEx[i] ?? "";
          if (!prevStr) return s;
          const newS = { ...s };
          let dirty = false;
          if (!newS.kg) {
            const v = parsePrevVal(prevStr, "kg");
            if (v) { newS.kg = v; dirty = true; }
          }
          if (!newS.reps) {
            const v = parsePrevVal(prevStr, "reps");
            if (v) { newS.reps = v; dirty = true; }
          }
          return dirty ? newS : s;
        });
        if (updated.some((s, i) => s !== exSets[i])) {
          next[exId] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [setsInit, prevSets]);

  // ── Ouverture directe du dialogue de fin (?finish=1) ─────────────────────
  // Utilisé par le bandeau "séance non terminée" : l'athlète arrive
  // directement sur la clôture, sans avoir à retrouver le bouton.
  const finishRequested = searchParams.get("finish") === "1";
  const finishAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!finishRequested || finishAutoOpenedRef.current) return;
    if (workout.isLoading || workout.status === "completed") return;
    finishAutoOpenedRef.current = true;
    setShowFinish(true);
  }, [finishRequested, workout.isLoading, workout.status]);

  // ── Session timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (workout.status === "completed") return;
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(elapsedRef.current);
  }, [workout.status]);

  // ── Persist active session to localStorage (timer + "revenir" button) ──
  useEffect(() => {
    if (!id || workout.isLoading) return;
    if (workout.status === "completed") {
      localStorage.removeItem("activeWorkoutSession");
      return;
    }
    const stored = localStorage.getItem("activeWorkoutSession");
    let startedAt = Date.now();
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.id === id && parsed.startedAt) startedAt = parsed.startedAt;
      } catch { /* ignore */ }
    }
    localStorage.setItem("activeWorkoutSession", JSON.stringify({
      id,
      name: workout.sessionName,
      startedAt,
    }));
  }, [id, workout.isLoading, workout.status, workout.sessionName]);

  // ── Flush save on unmount + visibility change ──────────────────────────
  const setsRef = useRef(sets);
  const localModsRef = useRef(localMods);
  setsRef.current = sets;
  localModsRef.current = localMods;

  useEffect(() => {
    // Écriture IMMÉDIATE : sur `visibilitychange` l'onglet part en arrière-plan
    // et le navigateur mobile gèle ses timers. Un enregistrement débouncé ne
    // partirait jamais si le système tuait l'onglet dans la foulée.
    // On n'envoie que la saisie EN ATTENTE (jamais un état recalculé : avant
    // chargement il valait {} et écrasait la séance en base). Chaque saisie
    // passe par saveWorkoutSets, donc l'attente contient toujours la dernière.
    const flush = (keepalive: boolean) => {
      if (!id) return;
      flushWorkoutSets(undefined, keepalive ? { keepalive: true } : undefined);
    };
    // En arrière-plan / fermeture : envoi `keepalive`, qui survit à la page.
    const onVisChange = () => { if (document.hidden) flush(true); };
    document.addEventListener("visibilitychange", onVisChange);
    // `pagehide` couvre la fermeture d'onglet et le retour arrière iOS, cas où
    // `visibilitychange` n'est pas garanti.
    const onPageHide = () => flush(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pagehide", onPageHide);
      flush(false); // flush on unmount
    };
  }, [id, flushWorkoutSets]);

  // ── Inactivity reminder (10 min without interaction) ───────────────────
  const lastActivityRef = useRef(Date.now());
  const [showInactiveReminder, setShowInactiveReminder] = useState(false);

  // Reset activity timestamp on any set change
  useEffect(() => { lastActivityRef.current = Date.now(); setShowInactiveReminder(false); }, [sets]);

  useEffect(() => {
    if (workout.status === "completed") return;
    const CHECK_INTERVAL = 30_000; // check every 30s
    const INACTIVE_THRESHOLD = 10 * 60 * 1000; // 10 min
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVE_THRESHOLD) {
        setShowInactiveReminder(true);
      }
    }, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [workout.status]);

  // ── Rest timer helpers ───────────────────────────────────────────────────
  const stopRest = useCallback(() => {
    clearInterval(restRef.current);
    loopRef.current = false;
    setRestLeft(null);
    setRestActiveKey(null);
  }, []);

  const startRest = useCallback((seconds: number, nextInfo: string | null, activeKey?: string, loop = false) => {
    clearInterval(restRef.current);
    loopRef.current = loop;
    restSecondsRef.current = seconds;
    setRestTotal(seconds);
    setRestLeft(seconds);
    setRestNextInfo(nextInfo);
    setRestActiveKey(activeKey ?? null);
    restRef.current = setInterval(() => {
      setRestLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (loopRef.current) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            return restSecondsRef.current; // relance automatique
          }
          clearInterval(restRef.current);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Persist helper ───────────────────────────────────────────────────────
  const persist = useCallback(
    (newSets: AllSets, mods: AthleteModifications) => {
      const next = allSetsToMods(newSets, mods);
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  // ── Toggle 3-state checkmark ─────────────────────────────────────────────
  const toggleAndPersist = useCallback(
    (exId: string, setIdx: number, restSec: number, nextInfo: string | null, timingMode = "repos", blocId = "", blocExIds: string[] = [], clusterNb?: number, supersetExIds: string[] = []) => {
      // Un updater passé à setState doit rester pur : React peut le rejouer si
      // un rendu est abandonné. Démarrer un timer ou déclencher une écriture
      // réseau dedans expose à des doubles envois. On calcule donc l'état
      // suivant à partir du ref (déjà synchronisé à chaque rendu), puis on
      // applique les effets une seule fois, après.
      const prev = setsRef.current;
      const inSuperset = supersetExIds.length > 1;
      let justDone = false;
      let shouldStop = false;
      let restToStart: { seconds: number; info: string | null; key: string; loop: boolean } | null = null;

      const exSets = [...(prev[exId] ?? [])];
      // La ligne peut manquer si la structure a bougé entre le rendu et le clic
      while (exSets.length <= setIdx) exSets.push({ ...BLANK_SET });
      const s = normalizeSet(exSets[setIdx]);

      if (!s.done && !s.skipped) {
        const prevStr = prevSets[exId]?.[setIdx] ?? "";
        if (!s.kg && prevStr) s.kg = parsePrevVal(prevStr, "kg");
        if (!s.reps && prevStr) s.reps = parsePrevVal(prevStr, "reps");
        s.done = true;
        s.skipped = false;
        justDone = true;

        // Auto-fill ALL empty cluster sub-rows with the same charge
        if (clusterNb && s.kg) {
          for (let j = 0; j < exSets.length; j++) {
            const other = exSets[j];
            if (j !== setIdx && !other?.done && !other?.kg) {
              exSets[j] = { ...normalizeSet(other), kg: s.kg };
            }
          }
        }

        if (timingMode === "depart" && restSec > 0) {
          restToStart = { seconds: restSec, info: null, key: `depart:${blocId}`, loop: true };
        } else if (restSec > 0 && !inSuperset) {
          restToStart = { seconds: restSec, info: nextInfo, key: `${exId}:${setIdx}`, loop: false };
        }
      } else if (s.done) {
        s.done = false;
        s.skipped = true;
        if (timingMode !== "depart") shouldStop = true;
      } else {
        s.done = false;
        s.skipped = false;
      }

      exSets[setIdx] = s;
      const next = { ...prev, [exId]: exSets };

      // Superset: rest only at the end of a full round (one set of each linked
      // exercise done) — otherwise the athlete chains directly to the next exo.
      if (justDone && inSuperset && timingMode !== "depart" && restSec > 0) {
        const doneCount = (eid: string) =>
          (next[eid] ?? []).filter((ss) => ss.done || ss.skipped).length;
        const myCount = doneCount(exId);
        const roundDone = supersetExIds.every((eid) => doneCount(eid) >= myCount);
        if (roundDone) restToStart = { seconds: restSec, info: nextInfo, key: `${exId}:${setIdx}`, loop: false };
      }

      // Départ mode: stop looping timer when all bloc sets are done/skipped
      if (timingMode === "depart" && blocExIds.length > 0) {
        const allDone = blocExIds.every((eid) => {
          const eSets = next[eid] ?? [];
          return eSets.length > 0 && eSets.every((ss) => ss.done || ss.skipped);
        });
        if (allDone) shouldStop = true;
      }

      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);

      if (restToStart) startRest(restToStart.seconds, restToStart.info, restToStart.key, restToStart.loop);
      if (shouldStop) stopRest();
    },
    [prevSets, startRest, stopRest, saveWorkoutSets],
  );

  // ── Changer une valeur sans valider la série (zone du bas, RIR après coup) ──
  const setSetField = useCallback(
    (exId: string, setIdx: number, field: "kg" | "reps" | "rir", value: string) => {
      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? [])];
      while (exSets.length <= setIdx) exSets.push({ ...BLANK_SET });
      exSets[setIdx] = { ...normalizeSet(exSets[setIdx]), [field]: value };
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);
    },
    [saveWorkoutSets],
  );

  // ── Open NumPad ──────────────────────────────────────────────────────────
  const openPad = useCallback(
    (exId: string, setIdx: number, field: "kg" | "reps" | "rir", chargeUnit: string, clusterNb?: number, isIso?: boolean) => {
      const current = sets[exId]?.[setIdx];
      setPadTarget({ exId, setIdx, field, chargeUnit, clusterNb, isIso });
      setPadVal(current?.[field] ?? "");
    },
    [sets],
  );

  // ── Confirm NumPad ───────────────────────────────────────────────────────
  const confirmPad = useCallback(
    (value: string) => {
      if (!padTarget) return;
      const { exId, setIdx, field } = padTarget;
      if (padTarget.noAuto) {
        setSetField(exId, setIdx, field, value);
        setPadTarget(null);
        setPadVal("");
        return;
      }

      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? [])];
      while (exSets.length <= setIdx) exSets.push({ ...BLANK_SET });
      const s = { ...normalizeSet(exSets[setIdx]), [field]: value };

      // Auto-validate: if not done/skipped, mark done
      if (!s.done && !s.skipped) {
        // If entering kg and reps still empty, autofill from prev
        if (field === "kg" && !s.reps && !padTarget.clusterNb) {
          const prevStr = prevSets[exId]?.[setIdx] ?? "";
          const prevReps = parsePrevVal(prevStr, "reps");
          if (prevReps) s.reps = prevReps;
        }
        s.done = true;

        // Auto-fill ALL empty cluster sub-rows with the same charge
        if (field === "kg" && padTarget.clusterNb && value) {
          for (let j = 0; j < exSets.length; j++) {
            const other = exSets[j];
            if (j !== setIdx && !other?.done && !other?.kg) {
              exSets[j] = { ...normalizeSet(other), kg: value };
            }
          }
        }
      }

      exSets[setIdx] = s;
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);

      setPadTarget(null);
      setPadVal("");
    },
    [padTarget, prevSets, saveWorkoutSets, setSetField],
  );

  // ── Add bonus set ────────────────────────────────────────────────────────
  const addBonusSet = useCallback(
    (exId: string) => {
      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? []), { kg: "", reps: "", rir: "", done: false, skipped: false }];
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);
      haptic();
    },
    [saveWorkoutSets],
  );

  // ── Remove bonus set ─────────────────────────────────────────────────────
  const removeBonusSet = useCallback(
    (exId: string, setIdx: number) => {
      const prev = setsRef.current;
      const exSets = [...(prev[exId] ?? [])];
      exSets.splice(setIdx, 1);
      const next = { ...prev, [exId]: exSets };
      const mods = allSetsToMods(next, localModsRef.current);
      setSets(next);
      setLocalMods(mods);
      saveWorkoutSets(mods);
    },
    [saveWorkoutSets],
  );

  // ── Update comment / forme ───────────────────────────────────────────────
  const updateExComment = useCallback(
    (exId: string, comment: string) => {
      const prev = localModsRef.current;
      const next = {
        ...prev,
        exerciceComments: { ...(prev.exerciceComments ?? {}), [exId]: comment },
      };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  const updateSessionComment = useCallback(
    (comment: string) => {
      const next = { ...localModsRef.current, sessionComment: comment };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  // Retour vidéo : l'athlète coche une fois la vidéo envoyée (possible même séance validée)
  const toggleVideoSent = useCallback(
    (exId: string) => {
      const prev = localModsRef.current;
      const next = {
        ...prev,
        videoSent: { ...(prev.videoSent ?? {}), [exId]: !prev.videoSent?.[exId] },
      };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  const updateForme = useCallback(
    (forme: number) => {
      const next = { ...localModsRef.current, sessionForme: forme };
      setLocalMods(next);
      saveWorkoutSets(next);
    },
    [saveWorkoutSets],
  );

  // ── Reopen (cancel completion) ───────────────────────────────────────────
  const { mutate: reopenWorkout, isPending: reopening } = useMutation({
    mutationFn: async () => {
      if (!id) return;
      assertNoPendingValidation(id);
      await reopenWorkoutLog(id);
    },
    onSuccess: () => {
      void invalidateWorkouts(qc, { athleteId, logId: id });
      toast.success("Séance réouverte");
    },
    // La réouverture ne passe pas par la file hors ligne (elle annule une
    // validation : à faire en ligne, jamais rejouée plus tard à l'aveugle).
    onError: (err: unknown) => toast.error(
      isPendingWriteError(err) ? PENDING_VALIDATION_MESSAGE
      : classifyWriteError(err, typeof navigator !== "undefined" && navigator.onLine === false) === "network"
        ? "Pas de réseau : la séance pourra être réouverte au retour du réseau."
        : "Erreur lors de la réouverture",
    ),
  });

  // ── Records battus pendant la séance (calculés à la validation) ──────────
  // Séries faites des exercices rattachés à un record ; une erreur ici ne
  // remet jamais en cause la validation (déjà enregistrée).
  // Validation partie de la file hors ligne : mêmes séries préparées ici
  // (`recordSets` dans la saisie), records calculés par la file à l'envoi
  // (`writes.ts`), même si l'écran n'est plus ouvert.
  const recordNewRecords = useCallback(
    async (aid: string, recordSets: RecordSet[]) => {
      if (recordSets.length === 0) return;
      try {
        const found = await computeRecordsFromSession(aid, recordSets);
        if (found.length > 0) {
          void invalidateRecords(qc, aid);
          toast.success(newRecordsMessage(found));
        }
      } catch {
        /* records : best effort */
      }
    },
    [qc],
  );

  // ── Complete workout ─────────────────────────────────────────────────────
  const [runKm, setRunKm] = useState("");
  const { mutate: completeWorkout, isPending: completing } = useMutation({
    mutationFn: async () => {
      if (!id) return null;
      // RPC : statut + saisie fusionnée sans toucher l'adaptation du coach,
      // idempotente (un double appui ne change pas l'heure de validation).
      // Hors ligne : gardée en file (`workout.complete`) avec la saisie
      // COMPLÈTE de la séance, envoyée au retour du réseau.
      const mods = allSetsToMods(sets, localMods);
      const km = parseKm(runKm);
      const recordSets = collectRecordSets(mods.sessionSets ?? {}, recordRefByEx);
      const res = await submitWrite("workout.complete", {
        athleteId: athleteId ?? "", logId: id, mods, runKm: km, recordSets, recordDay: localIsoDay(),
      });
      return { queued: res.status === "queued", mods, km, recordSets };
    },
    onSuccess: (r) => {
      if (!r || !id) return;
      localStorage.removeItem("activeWorkoutSession");
      // Séance validée (ou validation en file) avec la saisie complète : plus
      // rien à renvoyer. Le brouillon est effacé AUSSI quand la validation est
      // en file : elle porte toute la saisie et vit dans IndexedDB ; garder le
      // brouillon le ferait réapparaître (et renvoyer) sur une séance déjà
      // synchronisée.
      discardPending();
      // Sans IndexedDB la file ne survit pas au rechargement : brouillon gardé.
      if (athleteId && (!r.queued || queueIsDurable())) clearDraft(workoutDraftKey(athleteId, id));
      setShowFinish(false);
      setShowRpe(true);
      if (r.queued) {
        // L'écran se comporte comme si c'était validé ; la file rafraîchit
        // tout une fois vidée. Records : calculés par la file à l'envoi
        // (relecture des records actuels à ce moment-là).
        applyOptimisticWorkout(qc, { athleteId, logId: id }, {
          status: "completed",
          completedAt: new Date().toISOString(),
          runKm: r.km,
          mods: r.mods,
        });
        notifyQueued();
        return;
      }
      void invalidateWorkouts(qc, { athleteId, logId: id });
      toast.success("Séance complétée ! ");
      if (athleteId) void recordNewRecords(athleteId, r.recordSets);
    },
    onError: (err: unknown) => {
      if (isWorkoutNotFound(err)) {
        // Séance retirée par le coach (même hors ligne : refus du serveur).
        setShowFinish(false);
        void invalidateWorkouts(qc, { athleteId, logId: id });
        toast.error(WORKOUT_GONE_MESSAGE, { duration: 8000 });
        return;
      }
      toast.error("Erreur lors de l'enregistrement");
    },
  });

  // ── Progress bar ─────────────────────────────────────────────────────────
  const { progTotal, progDone } = useMemo(() => {
    let total = 0, done = 0;
    for (const bloc of workout.blocs) {
      for (const ex of bloc.exercices) {
        const exSets = sets[ex.id] ?? [];
        total += exSets.length;
        done += exSets.filter((s) => s?.done || s?.skipped).length;
      }
    }
    return { progTotal: total, progDone: done };
  }, [sets, workout.blocs]);

  const isCompleted = workout.status === "completed";
  const canEdit = !isCompleted && !!id;
  const renderVideoRequest = (ex: WorkoutExerciceData, withName = false) =>
    ex.video_request ? (
      <VideoRequestRow
        key={"video-" + ex.id}
        name={withName ? ex.exercise_name : undefined}
        note={ex.video_request.note}
        sent={!!localMods.videoSent?.[ex.id]}
        canToggle={!!id}
        onToggle={() => toggleVideoSent(ex.id)}
      />
    ) : null;

  // Toutes les séries traitées (validées ou passées) → on met en avant le bouton
  // "Terminer", moment où l'athlète oublie le plus souvent de clôturer.
  const allSetsHandled = useMemo(() => {
    const rows = Object.values(sets).flat();
    return rows.length > 0 && rows.every((s) => s?.done || s?.skipped);
    return rows.length > 0 && rows.every((s) => s.done || s.skipped);
  }, [sets]);

  // ── Mode « un bloc à la fois » ─────────────────────────────────────────
  const focusBlocs = useMemo<FocusExercise[][]>(
    () => workout.blocs.map((b) => b.exercices.map((e) => ({
      id: e.id,
      supersetWithNext: !!e.superset_with_next,
      skip: e.mode === "libre" || !!e.params?.cluster,
      nbSets: e.mode === "libre" ? 1 : (e.params?.nb_series ?? 0),
    }))),
    [workout.blocs],
  );
  const autoBloc = useMemo(() => firstPendingBloc(focusBlocs, sets), [focusBlocs, sets]);
  const activeBloc = Math.min(focusBloc ?? autoBloc, Math.max(0, workout.blocs.length - 1));

  // ── Early returns ────────────────────────────────────────────────────────
  if (workout.isLoading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.tx3, fontSize: 13 }}>
        Chargement…
      </div>
    );
  }
  if (workout.logStatus === "pending" || workout.logStatus === "paused" || workout.logStatus === "error") {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.tx3, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span>
          {workout.logStatus === "pending" ? "Chargement…"
            : workout.logStatus === "paused" ? "Hors ligne — la séance s'affichera au retour du réseau"
            : "Impossible de charger la séance"}
        </span>
        {workout.logStatus !== "pending" && (
          <button
            onClick={() => workout.refetchLog()}
            style={{ padding: "7px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }
  if (!workout.workoutLogId) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.tx3, fontSize: 13 }}>
        Séance introuvable
      </div>
    );
  }

  const focusOn = canEdit && focusMode && workout.blocs.length > 0;
  const focus = (() => {
    if (!focusOn) return null;
    const bloc = workout.blocs[activeBloc];
    if (!bloc) return null;
    const pend = nextPendingSet(focusBlocs[activeBloc] ?? [], sets);
    const restSec = blocRestSeconds(bloc);
    const letter = String.fromCharCode(65 + activeBloc);
    const blocLabel = bloc.name && bloc.name.trim() !== letter ? `${letter} · ${bloc.name}` : `Bloc ${letter}`;
    if (!pend) return { bloc, blocLabel, restSec, pending: null as null };
    const exIdx = bloc.exercices.findIndex((e) => e.id === pend.exId);
    const ex = bloc.exercices[exIdx];
    const isSS = pend.chain.length > 1;
    const lastOfChain = bloc.exercices.findIndex((e) => e.id === pend.chain[pend.chain.length - 1]);
    const after = isSS ? bloc.exercices[lastOfChain + 1] : bloc.exercices[exIdx + 1];
    const st = normalizeSet((sets[ex.id] ?? [])[pend.setIdx]);
    const prevStr = prevSets[ex.id]?.[pend.setIdx] ?? "";
    return {
      bloc, blocLabel, restSec,
      pending: {
        ex, setIdx: pend.setIdx, chain: isSS ? pend.chain : [],
        nextInfo: after ? after.exercise_name : null,
        kg: st.kg || (prevStr ? parsePrevVal(prevStr, "kg") : ""),
        reps: st.reps || (prevStr ? parsePrevVal(prevStr, "reps") : ""),
        rir: st.rir,
        iso: isIsoAt(ex.params, pend.setIdx),
        ssTag: isSS ? `Superset · ex. ${pend.chain.indexOf(ex.id) + 1} / ${pend.chain.length}` : undefined,
        prev: prevStr,
      },
    };
  })();
  // « 115×3 » (stockage) → « 115 × 3 ».
  const fmtPrev = (v: string) => (v && v !== "—" ? v.replace(/\s*×\s*/, " × ") : undefined);
  const fmtRest = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec} s`);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: focusOn ? 300 : 140, scrollbarWidth: "none" }}>
      {/* ── Header ── */}
      <div
        style={{
          padding: "12px 16px 0",
          position: "sticky",
          top: 45,
          background: C.bg,
          zIndex: 5,
          borderBottom: `1px solid ${C.brd}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              flexShrink: 0,
              border: `1px solid ${C.brdL}`,
              background: "transparent",
              color: C.tx3,
              fontSize: 16,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ←
          </button>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.tx3 }}>{workout.sessionShort}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>
              {workout.sessionName}
            </div>
            {workout.rescheduledByAthlete &&
              workout.originalScheduledDate &&
              workout.originalScheduledDate !== workout.scheduledDate && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 6,
                    marginTop: 3,
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#F59E0B",
                  }}
                >
                  Décalée du{" "}
                  {new Date(
                    workout.originalScheduledDate + "T12:00:00",
                  ).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
              )}
          </div>

          {/* Timer or "completed" badge */}
          {!isCompleted ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.tx3,
                background: C.s2,
                borderRadius: 4,
                padding: "4px 10px",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {formatElapsed(elapsed)}
            </div>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 6,
                background: C.gS,
                color: C.g,
                flexShrink: 0,
              }}
            >
              ✓ Complétée
            </span>
          )}
        </div>

        {/* Progress bar */}
        {!isCompleted && progTotal > 0 && (
          <div
            style={{
              height: 3,
              background: C.brd,
              borderRadius: 2,
              marginBottom: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round((progDone / progTotal) * 100)}%`,
                background: ACCENT,
                borderRadius: 2,
                transition: "width 300ms ease",
              }}
            />
          </div>
        )}
      </div>

      {/* ── Blocs ── */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {canEdit && !focusMode && workout.blocs.length > 0 && (
          <button
            type="button"
            onClick={() => { setFocusMode(true); window.scrollTo(0, 0); }}
            style={{ alignSelf: "flex-start", background: "none", border: "1px solid " + C.brdL, borderRadius: 10, height: 36, padding: "0 12px", color: C.tx, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            Un bloc à la fois
          </button>
        )}

        {/* Fiches de la séance (variante de la semaine) */}
        <FicheLinks
          title="Fiches de la séance"
          attachments={workout.sessionFiches}
          week={workout.weekNumber}
          athleteId={athleteId}
        />

        <VideoRequestBanner blocs={workout.blocs} videoSent={localMods.videoSent} />

        {workout.blocs.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: C.tx3,
              fontSize: 12,
            }}
          >
            Aucun exercice dans cette séance
          </div>
        ) : (
          workout.blocs.map((bloc, blocIdx) => {
            if (focusOn && blocIdx !== activeBloc) return null;
            const bColor = blocColor(bloc.color, blocIdx);
            const timing = timingLabel(bloc);
            const restSec = blocRestSeconds(bloc);

            return (
              <div key={bloc.id}>
                {/* Bloc header */}
                {(() => {
                  const departKey = `depart:${bloc.id}`;
                  const isDepart = bloc.timing_mode === "depart" && restSec > 0;
                  const isRunning = isDepart && restActiveKey === departKey && restLeft !== null;
                  const urgent = isRunning && restLeft !== null && restLeft <= 10;

                  function fmt(s: number) {
                    const m = Math.floor(s / 60);
                    const sec = s % 60;
                    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
                  }

                  return (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        padding: "5px 10px 5px 12px",
                        borderRadius: 4,
                        background: hexToRgba(bColor, 0.08),
                        borderLeft: `3px solid ${bColor}`,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          background: hexToRgba(bColor, 0.18),
                          color: bColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {String.fromCharCode(65 + blocIdx)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: bColor, flex: 1, minWidth: 0 }}>
                        {bloc.name || `Bloc ${blocIdx + 1}`}
                      </div>
                      {timing && <BadgeTag label={timing} color={bColor} />}
                      {/* Depart inline chrono */}
                      {isDepart && canEdit && (
                        isRunning ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <span style={{
                              fontSize: 13,
                              fontWeight: 900,
                              color: urgent ? ACCENT_ALT : bColor,
                              fontVariantNumeric: "tabular-nums",
                              minWidth: 36,
                              textAlign: "right" as const,
                              transition: "color 300ms",
                            }}>
                              {fmt(restLeft!)}
                            </span>
                            <button
                              onClick={stopRest}
                              style={{
                                width: 22, height: 22, borderRadius: 6,
                                border: `1px solid ${hexToRgba(ACCENT_ALT, 0.5)}`,
                                background: hexToRgba(ACCENT_ALT, 0.12),
                                color: ACCENT_ALT, fontSize: 11, fontWeight: 700,
                                cursor: "pointer", fontFamily: "inherit",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 0, flexShrink: 0,
                              }}
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startRest(restSec, null, departKey, true)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "3px 8px", borderRadius: 6,
                              border: `1px solid ${hexToRgba(bColor, 0.4)}`,
                              background: hexToRgba(bColor, 0.12),
                              color: bColor, fontSize: 11, fontWeight: 700,
                              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                            }}
                          >
                            ▶ {fmt(restSec)}
                          </button>
                        )
                      )}
                    </div>
                  );
                })()}

                {bloc.instructions && (
                  <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45, whiteSpace: "pre-wrap", margin: "-2px 2px 8px" }}>
                    {bloc.instructions}
                  </div>
                )}

                {bloc.fiches && bloc.fiches.length > 0 && (
                  <div style={{ margin: "0 2px 8px" }}>
                    <FicheLinks compact attachments={bloc.fiches} week={workout.weekNumber} athleteId={athleteId} />
                  </div>
                )}

                {/* Exercices — colored background groups them visually as superset */}
                <div
                  style={{
                    background: hexToRgba(bColor, 0.05),
                    border: `1px solid ${hexToRgba(bColor, 0.2)}`,
                    borderRadius: 6,
                    padding: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {(() => {
                    // Superset chains: consecutive exercises linked via superset_with_next
                    const chains: number[][] = [];
                    let chain: number[] = [];
                    bloc.exercices.forEach((e, i) => {
                      chain.push(i);
                      if (!e.superset_with_next || i === bloc.exercices.length - 1) {
                        chains.push(chain);
                        chain = [];
                      }
                    });

                    return chains.map((ch) => {
                      const chainIds = ch.map((j) => bloc.exercices[j].id);
                      const isSS = ch.length > 1;
                      // Cluster/libre dans un superset : pas gérés par la carte tour-par-tour → cartes séparées
                      const hasComplex = ch.some((j) => bloc.exercices[j].mode === "libre" || bloc.exercices[j].params.cluster);

                      if (isSS && !hasComplex) {
                        const lastIdx = ch[ch.length - 1];
                        const afterEx = bloc.exercices[lastIdx + 1];
                        const supersetCard = (
                          <SupersetCard
                            key={chainIds[0]}
                            groupKey={chainIds[0]}
                            members={ch.map((j) => {
                              const ex = bloc.exercices[j];
                              const iso = isAllIso(ex.params);
                              return {
                                id: ex.id,
                                name: ex.exercise_name,
                                muscle: ex.muscle,
                                prescription: formatPrescription(ex.params),
                                coachComment: ex.comment,
                                youtubeId: ex.exercise_id ? videoMap[ex.exercise_id] : undefined,
                                onShowVideo: () => {
                                  const ytId = ex.exercise_id ? videoMap[ex.exercise_id] : undefined;
                                  if (ytId) setVideoModal({ name: ex.exercise_name, ytId });
                                },
                                params: ex.params,
                                sets: sets[ex.id] ?? [],
                                prevSets: prevSets[ex.id] ?? [],
                                isIso: iso,
                                onToggle: (setIdx: number) =>
                                  toggleAndPersist(ex.id, setIdx, restSec, afterEx ? afterEx.exercise_name : null, bloc.timing_mode, bloc.id, bloc.exercices.map(e => e.id), undefined, chainIds),
                                onOpenPad: (setIdx: number, field: "kg" | "reps" | "rir") =>
                                  openPad(ex.id, setIdx, field, ex.params.charge_unit, undefined, iso),
                                comment: localMods.exerciceComments?.[ex.id] ?? "",
                                onCommentChange: (c: string) => updateExComment(ex.id, c),
                              };
                            })}
                            blocColor={bColor}
                            restSec={restSec}
                            timingMode={bloc.timing_mode}
                            restActiveKey={restActiveKey}
                            restLeft={restLeft}
                            restTotal={restTotal}
                            canEdit={canEdit}
                            onStartRest={(key, sec) => startRest(sec, null, key)}
                            onStopRest={stopRest}
                          />
                        );
                        const videoRows = ch.map((j) => renderVideoRequest(bloc.exercices[j], true)).filter(Boolean);
                        return videoRows.length ? (
                          <Fragment key={chainIds[0]}>
                            {supersetCard}
                            {videoRows}
                          </Fragment>
                        ) : supersetCard;
                      }

                      // Exos seuls, ou chaîne superset avec cluster/libre → cartes individuelles
                      return (
                        <Fragment key={chainIds[0]}>
                        {ch.map((exIdx) => {
                    const ex = bloc.exercices[exIdx];
                    const nextEx = bloc.exercices[exIdx + 1];
                    const nextInfo = nextEx ? nextEx.exercise_name : null;
                    const supersetIds = isSS ? chainIds : [];
                    const ssPos = ch.indexOf(exIdx) + 1;

                    // Libre: pas de séries/reps — juste une case à cocher de validation
                    if (ex.mode === "libre") {
                      const s0 = (sets[ex.id] ?? [])[0];
                      const isDone = s0?.done ?? false;
                      const isSkipped = s0?.skipped ?? false;
                      return (
                        <div key={ex.id}>
                        <div
                          onClick={() => canEdit && toggleAndPersist(ex.id, 0, 0, null, "libre")}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 14px", borderRadius: 6,
                            background: isDone ? hexToRgba(GREEN, 0.06) : C.s1,
                            border: `1px solid ${isDone ? hexToRgba(GREEN, 0.35) : isSkipped ? hexToRgba(ACCENT_ALT, 0.4) : C.brd}`,
                            cursor: canEdit ? "pointer" : "default",
                            transition: "border-color 150ms, background 150ms",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 700,
                              color: isDone ? GREEN : C.tx,
                              textDecoration: isSkipped ? "line-through" : "none",
                            }}>
                              {ex.exercise_name || "Note libre"}
                            </div>
                            {ex.libre_text && (
                              <div style={{ fontSize: 12, color: C.tx2, marginTop: 3, whiteSpace: "pre-wrap" }}>
                                {ex.libre_text}
                              </div>
                            )}
                          </div>
                          <div style={{
                            width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${isDone ? GREEN : isSkipped ? ACCENT_ALT : C.brdL}`,
                            background: isDone ? hexToRgba(GREEN, 0.15) : isSkipped ? hexToRgba(ACCENT_ALT, 0.12) : "transparent",
                            color: isDone ? GREEN : ACCENT_ALT,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 900,
                          }}>
                            {isDone ? "✓" : isSkipped ? "✕" : ""}
                          </div>
                        </div>
                        <LibreComment
                          comment={localMods.exerciceComments?.[ex.id] ?? ""}
                          canEdit={canEdit}
                          onChange={(c) => updateExComment(ex.id, c)}
                        />
                        {ex.video_request && <div style={{ marginTop: 6 }}>{renderVideoRequest(ex)}</div>}
                        </div>
                      );
                    }

                    return (
                      <Fragment key={ex.id}>
                      <ExerciceCard
                        exId={ex.id}
                        name={ex.exercise_name}
                        muscle={ex.muscle}
                        prescription={formatPrescription(ex.params)}
                        coachComment={ex.comment}
                        youtubeId={ex.exercise_id ? videoMap[ex.exercise_id] : undefined}
                        onShowVideo={() => {
                          const ytId = ex.exercise_id ? videoMap[ex.exercise_id] : undefined;
                          if (ytId) setVideoModal({ name: ex.exercise_name, ytId });
                        }}
                        supersetTag={supersetIds.length ? `Superset ${ssPos}/${ch.length}` : undefined}
                        params={ex.params}
                        sets={sets[ex.id] ?? []}
                        prevSets={prevSets[ex.id] ?? []}
                        comment={localMods.exerciceComments?.[ex.id] ?? ""}
                        canEdit={canEdit}
                        timingMode={bloc.timing_mode}
                        blocColor={bColor}
                        blocRestSec={restSec}
                        blocRestLabel={bloc.timing_mode === "depart" ? "départ" : "repos"}
                        restActiveKey={restActiveKey}
                        restLeft={restLeft}
                        restTotal={restTotal}
                        onToggle={(setIdx) =>
                          toggleAndPersist(ex.id, setIdx, restSec, nextInfo, bloc.timing_mode, bloc.id, bloc.exercices.map(e => e.id), ex.params.cluster?.nb_clusters, supersetIds)
                        }
                        onOpenPad={(setIdx, field) =>
                          openPad(ex.id, setIdx, field, ex.params.charge_unit, ex.params.cluster?.nb_clusters, isIsoAt(ex.params, setIdx))
                        }
                        onAddSet={() => addBonusSet(ex.id)}
                        onRemoveSet={(setIdx) => removeBonusSet(ex.id, setIdx)}
                        onCommentChange={(c) => updateExComment(ex.id, c)}
                        onStartRest={(key, sec) => startRest(sec, null, key)}
                        onStopRest={stopRest}
                      />
                      {renderVideoRequest(ex)}
                      {/* Superset connector — no rest between linked exercises */}
                      {ex.superset_with_next && nextEx && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, margin: "-4px 0" }}>
                          <span style={{
                            padding: "1px 8px", borderRadius: 4,
                            background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.4)",
                            color: "#F5A623", fontSize: 9, fontWeight: 800,
                          }}>
                            enchaîner sans repos
                          </span>
                        </div>
                      )}
                      </Fragment>
                    );
                  })}
                        </Fragment>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })
        )}

        {/* À suivre : blocs après celui en cours (planche AthleteSeanceA) */}
        {focusOn && activeBloc < workout.blocs.length - 1 && (() => {
          const rest = workout.blocs.slice(activeBloc + 1);
          const n = rest.reduce((k, b) => k + b.exercices.length, 0);
          return (
            <div style={{ margin: "12px 16px 0", padding: "12px 14px", borderRadius: 14, background: C.s1, border: "1px solid " + C.brd }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 }}>À suivre</span>
                <span style={{ fontSize: 12, color: C.tx3 }}>{n} exercice{n > 1 ? "s" : ""}</span>
              </div>
              {rest.map((b, bi) => {
                const idx = activeBloc + 1 + bi;
                return b.exercices.map((e, ei) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setFocusBloc(idx)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", borderTop: bi === 0 && ei === 0 ? "none" : "1px solid " + C.brd, borderLeft: "none", borderRight: "none", borderBottom: "none", background: "transparent", color: C.tx, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.exercise_name}</span>
                      <span style={{ display: "block", ...MONO, fontSize: 11.5, color: C.tx3, marginTop: 1 }}>{prescriptionLine(e.mode, e.params)}</span>
                    </span>
                    <span style={{ ...MONO, fontSize: 11, color: C.tx3, flex: "none" }}>
                      {b.exercices.length > 1 ? `Superset ${ei + 1}/${b.exercices.length}` : `Bloc ${blocLetter(idx)}`}
                    </span>
                  </button>
                ));
              })}
            </div>
          );
        })()}

        {/* Completed session comment */}
        {isCompleted && localMods.sessionComment && (
          <div
            style={{
              background: C.s1,
              borderRadius: 6,
              border: `1px solid ${C.brd}`,
              padding: "12px 16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.tx3,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 6,
              }}
            >
              Commentaire
            </div>
            <div style={{ fontSize: 13, color: C.tx2 }}>
              {localMods.sessionComment}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky "Rouvrir" button (completed) ── */}
      {isCompleted && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            left: 0,
            right: 0,
            zIndex: 20,
            padding: "12px 16px",
            background: `linear-gradient(transparent, ${C.bg} 30%)`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => reopenWorkout()}
            disabled={reopening}
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "14px 0",
              borderRadius: 6,
              border: `1px solid ${hexToRgba(ACCENT_ALT, 0.4)}`,
              background: hexToRgba(ACCENT_ALT, 0.08),
              color: ACCENT_ALT,
              fontSize: 13,
              fontWeight: 700,
              cursor: reopening ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: reopening ? 0.6 : 1,
            }}
          >
            {reopening ? "Annulation…" : "↩ Annuler la complétion"}
          </button>
        </div>
      )}

      {/* ── Zone de saisie « Un pouce » (mode un bloc à la fois) ── */}
      {focusOn && focus && (
        <FocusInputBar
          blocLabel={focus.blocLabel}
          blocIndex={activeBloc}
          blocCount={workout.blocs.length}
          onPrev={() => { setFocusBloc(Math.max(0, activeBloc - 1)); window.scrollTo(0, 0); }}
          onNext={() => { setFocusBloc(Math.min(workout.blocs.length - 1, activeBloc + 1)); window.scrollTo(0, 0); }}
          pending={focus.pending ? {
            exName: focus.pending.ex.exercise_name,
            setNumber: focus.pending.setIdx + 1,
            setCount: Math.max(focus.pending.ex.params.nb_series ?? 0, (sets[focus.pending.ex.id] ?? []).length),
            kg: focus.pending.kg,
            reps: focus.pending.reps,
            unit: focus.pending.ex.params.charge_unit === "kg" ? "kg" : focus.pending.ex.params.charge_unit === "%RM" ? "%" : "",
            isIso: focus.pending.iso,
            supersetTag: focus.pending.ssTag,
            prev: fmtPrev(focus.pending.prev),
            rirTarget: focus.pending.rir || undefined,
          } : null}
          kgStep={2.5}
          onKgStep={(d) => { const p = focus.pending; if (p) { haptic(); setSetField(p.ex.id, p.setIdx, "kg", stepValue(p.kg, d)); } }}
          onRepsStep={(d) => { const p = focus.pending; if (p) { haptic(); setSetField(p.ex.id, p.setIdx, "reps", stepValue(p.reps, d)); } }}
          onKgTap={() => { const p = focus.pending; if (p) { setPadTarget({ exId: p.ex.id, setIdx: p.setIdx, field: "kg", chargeUnit: p.ex.params.charge_unit, isIso: p.iso, noAuto: true }); setPadVal(p.kg); } }}
          onRepsTap={() => { const p = focus.pending; if (p) { setPadTarget({ exId: p.ex.id, setIdx: p.setIdx, field: "reps", chargeUnit: p.ex.params.charge_unit, isIso: p.iso, noAuto: true }); setPadVal(p.reps); } }}
          onValidate={() => {
            const p = focus.pending;
            if (!p) return;
            haptic();
            const st = normalizeSet((sets[p.ex.id] ?? [])[p.setIdx]);
            // Valeurs affichées (pré-remplies) écrites avant la validation.
            if (!st.kg && p.kg) setSetField(p.ex.id, p.setIdx, "kg", p.kg);
            if (!st.reps && p.reps) setSetField(p.ex.id, p.setIdx, "reps", p.reps);
            toggleAndPersist(p.ex.id, p.setIdx, focus.restSec, p.nextInfo, focus.bloc.timing_mode, focus.bloc.id, focus.bloc.exercices.map((e) => e.id), undefined, p.chain);
            if (!p.iso) setRirAsk({ exId: p.ex.id, setIdx: p.setIdx, exName: p.ex.exercise_name, target: p.rir || null });
          }}
          restLabel={focus.restSec > 0 && focus.bloc.timing_mode !== "depart" ? `Lance la récup de ${fmtRest(focus.restSec)}` : null}
          rest={restLeft !== null ? { left: restLeft, total: restTotal, next: restNextInfo, onStop: stopRest } : null}
          allDone={allSetsHandled}
          onFinish={() => setShowFinish(true)}
          onShowAll={() => setFocusMode(false)}
        />
      )}

      {/* ── RIR après « Valider série » ── */}
      {rirAsk && (
        <RirAfterSetSheet
          exName={rirAsk.exName}
          setNumber={rirAsk.setIdx + 1}
          target={rirAsk.target}
          value={normalizeSet((sets[rirAsk.exId] ?? [])[rirAsk.setIdx]).rir}
          onPick={(v) => { setSetField(rirAsk.exId, rirAsk.setIdx, "rir", v); setRirAsk(null); }}
          onSkip={() => setRirAsk(null)}
        />
      )}

      {/* ── Sticky "Terminer" button ── */}
      {canEdit && !focusOn && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            left: 0,
            right: 0,
            zIndex: 20,
            padding: "12px 16px",
            background: `linear-gradient(transparent, ${C.bg} 30%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          {allSetsHandled && (
            <div style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>
              Toutes les séries sont validées — il ne reste qu'à terminer
            </div>
          )}
          <button
            onClick={() => setShowFinish(true)}
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "16px 0",
              borderRadius: 6,
              border: "none",
              background: allSetsHandled ? GREEN : ACCENT,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              animation: allSetsHandled ? "finishPulse 1.8s ease-in-out infinite" : undefined,
            }}
          >
            {allSetsHandled ? "Terminer la séance" : "Terminer la séance"}
          </button>
          {allSetsHandled && (
            <style>{`@keyframes finishPulse {
              0%, 100% { box-shadow: 0 4px 20px ${hexToRgba(GREEN, 0.35)}; }
              50%      { box-shadow: 0 4px 28px ${hexToRgba(GREEN, 0.7)}; }
            }`}</style>
          )}
        </div>
      )}

      {/* ── NumPad / RirPicker ── */}
      {padTarget && padTarget.field === "rir" ? (
        <RirPicker
          value={padVal}
          onChange={setPadVal}
          onConfirm={() => confirmPad(padVal)}
          onClose={() => { setPadTarget(null); setPadVal(""); }}
        />
      ) : padTarget ? (
        <NumPad
          target={padTarget}
          value={padVal}
          onChange={setPadVal}
          onConfirm={() => confirmPad(padVal)}
          onClose={() => { setPadTarget(null); setPadVal(""); }}
        />
      ) : null}

      {/* ── Rest timer (dans la zone du bas en mode un bloc à la fois) ── */}
      {restLeft !== null && !focusOn && (
        <RestTimer
          left={restLeft}
          total={restTotal}
          nextInfo={restNextInfo}
          loop={restActiveKey?.startsWith("depart:") ?? false}
          onDismiss={stopRest}
        />
      )}

      {/* ── Inactivity reminder ── */}
      {showInactiveReminder && !isCompleted && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.s1, borderRadius: 6, padding: "28px 24px", maxWidth: 320, width: "100%", textAlign: "center", border: "1px solid " + C.brd }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏸</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, marginBottom: 6 }}>Séance en pause ?</div>
            <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, marginBottom: 20 }}>
              Aucune activité depuis 10 minutes. Pensez à enregistrer votre séance si vous avez terminé.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => { setShowInactiveReminder(false); lastActivityRef.current = Date.now(); }}
                style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Continuer la séance
              </button>
              <button
                onClick={() => { setShowInactiveReminder(false); setShowFinish(true); }}
                style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "1px solid " + C.g + "60", background: C.g + "15", color: C.g, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Terminer la séance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finish dialog ── */}
      {showFinish && (
        <FinishWorkoutSheet
          title={workout.sessionName}
          {...countSets(workout.blocs, sets)}
          comment={localMods.sessionComment ?? ""}
          forme={localMods.sessionForme}
          onCommentChange={updateSessionComment}
          onFormeChange={updateForme}
          runKm={runKm}
          onRunKmChange={setRunKm}
          onConfirm={() => completeWorkout()}
          onClose={() => setShowFinish(false)}
          completing={completing}
        />
      )}

      {/* ── Video modal ── */}
      {videoModal && (
        <div
          onClick={() => setVideoModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 460,
              background: C.s1, borderRadius: 6, border: `1px solid ${C.brd}`,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {videoModal.name}
              </div>
              <button
                onClick={() => setVideoModal(null)}
                style={{
                  width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.brdL}`,
                  background: "transparent", color: C.tx3, fontSize: 16,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 0, flexShrink: 0,
                }}
              >×</button>
            </div>
            <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoModal.ytId}?rel=0`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
                allowFullScreen
                title={videoModal.name}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── RPE sheet ── */}
      {showRpe && workout.workoutLogId && (
        <RpeSheetForLog
          workoutLogId={workout.workoutLogId}
          onClose={() => {
            setShowRpe(false);
            navigate(-1);
          }}
        />
      )}
    </div>
  );
}
