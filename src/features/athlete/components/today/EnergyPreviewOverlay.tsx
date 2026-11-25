import type { BlockLogs } from "@/types/energy";
import { C } from "@/lib/theme";
import { type EnergyDraft, getWorkIntervals, rpeBg, rpeColor } from "@/features/athlete/components/today/todayEnergyUtils";
import { FOSTER_LABELS } from "@/features/athlete/components/today/todayConstants";
import { type RunDistanceValue, initialRunDistance, runDistancePayload } from "@/features/shared/components/runDistance";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import type { UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { clearDraft, energyDraftKey, loadDraft, saveDraft } from "@/lib/localDraft";
import { queueIsDurable } from "@/lib/offline/writes";
import { useCompleteEnergyAssignment, useUpdateEnergyAssignment, useUpsertEnergyRpe } from "@/features/shared/hooks/useEnergyAssignments";
import { useEffect, useRef, useState } from "react";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";
import { useZoneModels } from "@/features/shared/hooks/useZoneModels";
import { activeModelAt } from "@shared/domain/hrZones";
import { localIsoDay } from "@shared/domain/dates";
import { hrZoneCount } from "@/lib/energy/energyRun";
import { EnergyReadView } from "@/features/athlete/components/energy/EnergyReadView";
import { EnergyRunScreen } from "@/features/athlete/components/energy/EnergyRunScreen";
import { WatchPushButton } from "@/features/athlete/components/today/WatchPushButton";
import { EnergyDoneView } from "@/features/athlete/components/energy/EnergyDoneView";
import { EnergyLogView } from "@/features/athlete/components/energy/EnergyLogView";
import { usePlannedVsDone } from "@/features/shared/hooks/usePlannedVsDone";
import { useNavigate } from "react-router-dom";
import type { IsoDay } from "@shared/domain/dates";
import { SessionPainQuestion } from "@/features/athlete/components/session/SessionPainQuestion";
import { useSaveSessionPain } from "@/features/shared/hooks/useSessionPain";
import { EMPTY_SESSION_PAIN, sessionPainPayload, type SessionPainAnswer } from "@/lib/sessionPain";
import { EnergyShareSheet, type EnergyShareDone } from "@/features/athlete/components/energy/EnergyShareSheet";
import { parseKm } from "@/features/shared/components/runDistance";

export function EnergyPreviewOverlay({
  event,
  athleteId,
  onClose,
}: {
  event: UnifiedCalendarEvent;
  athleteId: string;
  onClose: () => void;
}) {
  const sessionId    = event.energySessionId ?? (event.raw?.energy_session_id as string | undefined);
  const assignmentId = event.id;
  const isCompleted  = event.status === "completed";

  const [phase, setPhase]               = useState<"preview" | "run" | "log" | "rpe">("preview");
  // Lecture avant la séance (planche EnergieTel) ; l'ancien aperçu reste
  // accessible par « Voir le détail complet » (schéma, images, fiches).
  const [showDetail, setShowDetail]     = useState(false);
  const [localBlocks, setLocalBlocks]   = useState<BlockLogs>({});
  const [globalNote, setGlobalNote]     = useState("");
  const [actualDuration, setActualDuration] = useState<string>("");
  const [runDist, setRunDist]           = useState<RunDistanceValue>(initialRunDistance());
  const [rpeSelected, setRpeSelected]   = useState<number | null>(null);
  // Question douleur de fin de séance (15/11) : Non par défaut, jamais bloquante.
  const [pain, setPain]                 = useState<SessionPainAnswer>(EMPTY_SESSION_PAIN);
  const savePain                        = useSaveSessionPain();
  // Minutes mesurées par le minuteur (null : durée préremplie avec le prévu).
  const [timerMin, setTimerMin]         = useState<number | null>(null);
  // Partage en story : « celebrate » = juste après le RPE de fin de séance.
  const [share, setShare]               = useState<null | "plain" | "celebrate">(null);

  const { data: session, isLoading, isError } = useEnergySession(sessionId);
  const { data: refs } = useAthleteReferences(athleteId);
  const navigate = useNavigate();
  // Séance faite avec une montre : activité rattachée à cette séance prévue.
  const day = (event.date ?? undefined) as IsoDay | undefined;
  // Échelle des zones FC sous un bloc : modèle du coach valable le jour de la séance.
  const { data: zoneModels } = useZoneModels(athleteId);
  const hrZones = hrZoneCount(zoneModels ? activeModelAt(zoneModels, day ?? localIsoDay()) : null);
  const { data: pvd } = usePlannedVsDone(athleteId, day, day);
  const watchActivity = pvd?.flatMap((d) => d.planned).find((p) => p.kind === "energy" && p.id === assignmentId)?.activity ?? null;
  const complete        = useCompleteEnergyAssignment();
  const updateAssignment = useUpdateEnergyAssignment();
  const upsertRpe       = useUpsertEnergyRpe();

  const workBlocks = getWorkIntervals(session?.intervals ?? []);
  const isComplex  = workBlocks.length > 1;

  // Le brouillon n'est écrit qu'après l'init (sinon il serait écrasé par les défauts).
  const draftReadyRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (workBlocks.length > 0) {
      const existing = (event.raw?.block_logs ?? {}) as BlockLogs;
      const init: BlockLogs = {};
      // Faits d'office : l'athlète décoche ce qu'il n'a pas fait.
      for (const b of workBlocks) init[b.id] = existing[b.id] ?? { done: true, note: "" };
      setLocalBlocks(init);
    }
    if (session.total_duration_s != null)
      setActualDuration(String(Math.round(session.total_duration_s / 60)));
    setRunDist(initialRunDistance(session.total_distance_m));
    // Saisie en cours retrouvée (app fermée/tuée avant « Valider ») : on la
    // restaure par-dessus les valeurs par défaut.
    const draft = !isCompleted && athleteId
      ? loadDraft<EnergyDraft>(energyDraftKey(athleteId, assignmentId), { maxAgeMs: 48 * 3600 * 1000 })
      : null;
    if (draft) {
      const d = draft.value;
      if (d.localBlocks) setLocalBlocks((prev) => ({ ...prev, ...d.localBlocks }));
      if (d.globalNote != null) setGlobalNote(d.globalNote);
      if (d.actualDuration != null) setActualDuration(d.actualDuration);
      if (d.runDist) setRunDist(d.runDist);
      if (d.phase === "log") setPhase("log");
    }
    draftReadyRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Brouillon local de la saisie en cours (par athlète + séance du jour), écrit
  // à chaque modification pendant la saisie, purgé une fois la validation confirmée.
  const energyDraft: EnergyDraft = { phase: phase === "run" ? "preview" : phase, localBlocks, globalNote, actualDuration, runDist };
  const energyDraftJson = JSON.stringify(energyDraft);
  useEffect(() => {
    if (!draftReadyRef.current || isCompleted || !athleteId || phase !== "log" || complete.isSuccess) return;
    saveDraft(energyDraftKey(athleteId, assignmentId), JSON.parse(energyDraftJson));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energyDraftJson]);
  useEffect(() => {
    // Gardée en file sans IndexedDB (perdue au rechargement) : brouillon gardé.
    const queued = (complete.data as { status?: string } | undefined)?.status === "queued";
    if (complete.isSuccess && athleteId && (!queued || queueIsDurable())) clearDraft(energyDraftKey(athleteId, assignmentId));
  }, [complete.isSuccess, complete.data, athleteId, assignmentId]);

  function handleValidate() {
    const logs: BlockLogs = isComplex ? localBlocks : {};
    const durationMin = actualDuration !== "" ? parseInt(actualDuration, 10) : undefined;
    complete.mutate({
      id: assignmentId, athleteId,
      block_logs: logs,
      notes: globalNote || undefined,
      actual_duration_min: durationMin && !isNaN(durationMin) ? durationMin : undefined,
      ...runDistancePayload(runDist),
    });
  }

  function handleUnvalidate() {
    updateAssignment.mutate(
      { id: assignmentId, athleteId, status: "planned", block_logs: {}, rpe_score: null },
      { onSuccess: onClose },
    );
  }

  if (!sessionId || isError || (!isLoading && !session)) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 420, maxWidth: "96vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "40px", textAlign: "center", color: C.tx3, fontSize: 13,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <span>Séance introuvable</span>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 420, maxWidth: "96vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "40px", textAlign: "center", color: C.tx3, fontSize: 13,
        }}>Chargement…</div>
      </>
    );
  }
  if (!session) return null;

  // ── Partage en story ───────────────────────────────────────────────────────
  if (share) {
    const raw = (event.raw ?? {}) as Record<string, unknown>;
    const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const justDone = share === "celebrate";
    const durationMin = justDone ? parseInt(actualDuration, 10) : numOrNull(raw.actual_duration_min);
    const done: EnergyShareDone | null = justDone || isCompleted ? {
      rpe: justDone ? rpeSelected : numOrNull(raw.rpe_score),
      durationMin: durationMin != null && Number.isFinite(durationMin) ? durationMin : null,
      distanceKm: justDone ? (runDist.activity === "course" ? parseKm(runDist.km) : null) : numOrNull(raw.distance_km),
      blockLogs: justDone ? (isComplex ? localBlocks : null) : ((raw.block_logs ?? null) as BlockLogs | null),
      comment: justDone ? globalNote || null : (typeof raw.notes === "string" ? raw.notes : null),
    } : null;
    return (
      <EnergyShareSheet
        session={session}
        refs={refs}
        day={event.date ?? null}
        athleteId={athleteId}
        completed={isCompleted || justDone}
        done={done}
        activity={watchActivity}
        celebrate={justDone}
        onClose={() => { setShare(null); if (justDone) onClose(); }}
      />
    );
  }

  // ── Phase RPE ──────────────────────────────────────────────────────────────
  if (phase === "rpe" || complete.isSuccess) {
    const painPayload = sessionPainPayload(pain);
    const canSave = rpeSelected != null || painPayload != null;
    const save = () => {
      if (painPayload) savePain.mutate({ target: { kind: "energy", id: assignmentId }, athleteId, ...painPayload });
      if (rpeSelected != null)
        upsertRpe.mutate({ id: assignmentId, athleteId, rpe_score: rpeSelected }, { onSettled: () => setShare("celebrate") });
      else
        setShare("celebrate");
    };
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61,
          background: C.s1, borderRadius: "6px 6px 0 0", borderTop: "1px solid " + C.brd,
          padding: "24px 20px 40px", maxHeight: "92dvh", overflowY: "auto",
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.brdL, margin: "0 auto 20px" }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: 4 }}>Comment s'est passée la séance ?</div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 24 }}>Évalue ton effort global (échelle Foster 1-10)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(v => (
              <button key={v} onClick={() => setRpeSelected(v)} style={{
                padding: "14px 0", borderRadius: 6,
                border: "1px solid " + (rpeSelected === v ? rpeColor(v) + "80" : C.brdL),
                background: rpeSelected === v ? rpeBg(v) : C.s2,
                color: rpeSelected === v ? rpeColor(v) : C.tx2,
                fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>{v}</button>
            ))}
          </div>
          <div style={{
            minHeight: 28, textAlign: "center", marginBottom: 20, fontSize: 13, fontWeight: 600,
            color: rpeSelected != null ? rpeColor(rpeSelected) : C.tx3,
            background: rpeSelected != null ? rpeBg(rpeSelected) : "transparent",
            borderRadius: 4, padding: "4px 12px",
          }}>
            {rpeSelected != null ? `${rpeSelected}/10 — ${FOSTER_LABELS[rpeSelected]}` : "Sélectionne une valeur"}
          </div>
          <div style={{ marginBottom: 24 }}>
            <SessionPainQuestion value={pain} onChange={setPain} />
          </div>
          <button
            onClick={save}
            disabled={upsertRpe.isPending}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 6, border: "none",
              background: canSave ? C.ac : C.s2,
              color: canSave ? C.tx : C.tx3,
              fontSize: 14, fontWeight: 700, cursor: canSave ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >{upsertRpe.isPending ? "Enregistrement…" : "Enregistrer"}</button>
          <button onClick={() => setShare("celebrate")} style={{
            width: "100%", marginTop: 12, padding: "10px 0", border: "none",
            background: "transparent", color: C.tx3, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>Passer</button>
        </div>
      </>
    );
  }

  // ── Phase LOG (planche EnergieTel : feuille du bas) ────────────────────────
  if (phase === "log") {
    const plannedMin = session.total_duration_s != null ? Math.round(session.total_duration_s / 60) : null;
    return (
      <EnergyLogView
        session={session}
        refs={refs}
        blocks={localBlocks}
        onBlocks={setLocalBlocks}
        duration={actualDuration}
        onDuration={setActualDuration}
        durationHint={timerMin != null ? `Mesurée par le minuteur${plannedMin ? ` · prévu ${plannedMin} min` : ""}` : plannedMin ? `Prévu ${plannedMin} min` : "Durée en minutes"}
        runDist={runDist}
        onRunDist={setRunDist}
        note={globalNote}
        onNote={setGlobalNote}
        pending={complete.isPending}
        onBack={() => setPhase("preview")}
        onClose={onClose}
        onValidate={handleValidate}
      />
    );
  }

  // ── Phase RUN (plein écran) ───────────────────────────────────────────────
  if (phase === "run") {
    return (
      <EnergyRunScreen
        steps={session.intervals ?? []}
        refs={refs}
        title={session.name}
        onExit={(elapsedS, finished) => {
          if (elapsedS >= 60) {
            setActualDuration(String(Math.round(elapsedS / 60)));
            setTimerMin(Math.round(elapsedS / 60));
          }
          // Séance allée au bout : tous les blocs d'effort sont cochés d'office.
          if (finished) setLocalBlocks((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, done: true }])));
          setPhase("log");
        }}
      />
    );
  }

  // ── Phase PREVIEW ─────────────────────────────────────────────────────────
  const energyKind = session.session_kind !== "specifique" && session.format !== "classique";
  if (energyKind && watchActivity && !showDetail) {
    return (
      <EnergyDoneView
        session={session}
        refs={refs}
        activity={watchActivity}
        isCompleted={isCompleted}
        onClose={onClose}
        onNote={!isCompleted ? () => setPhase("log") : undefined}
        onLaps={() => navigate(`/athlete/program/activity/${watchActivity.id}`)}
        onDetail={() => setShowDetail(true)}
        onShare={() => setShare("plain")}
      />
    );
  }
  const readable = !isCompleted && energyKind;
  if (readable && !showDetail) {
    return (
      <EnergyReadView
        session={session}
        refs={refs}
        hrZones={hrZones}
        badge={<WatchPushButton athleteId={athleteId} kind="energy" sourceId={assignmentId} sessionStatus={event.status} date={event.date} />}
        onClose={onClose}
        onStart={() => setPhase("run")}
        onNote={() => setPhase("log")}
        onDetail={() => setShowDetail(true)}
        onShare={() => setShare("plain")}
      />
    );
  }
  return (
    <SessionPreviewModal
      session={session}
      athleteId={athleteId}
      onClose={readable || (energyKind && watchActivity) ? () => setShowDetail(false) : onClose}
      onValidate={!isCompleted ? () => setPhase("log") : undefined}
      onUnvalidate={isCompleted ? handleUnvalidate : undefined}
      onShare={() => setShare("plain")}
    />
  );
}
