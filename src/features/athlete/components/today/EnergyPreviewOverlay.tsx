import type { BlockLogs } from "@/types/energy";
import { C } from "@/lib/theme";
import { Check } from "lucide-react";
import { type EnergyDraft, fmtIv, getWorkIntervals, rpeBg, rpeColor } from "@/features/athlete/components/today/todayEnergyUtils";
import { FOSTER_LABELS } from "@/features/athlete/components/today/todayConstants";
import { RunDistanceInput } from "@/features/shared/components/RunDistanceInput";
import { type RunDistanceValue, initialRunDistance, runDistancePayload } from "@/features/shared/components/runDistance";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import type { UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { clearDraft, energyDraftKey, loadDraft, saveDraft } from "@/lib/localDraft";
import { queueIsDurable } from "@/lib/offline/writes";
import { useCompleteEnergyAssignment, useUpdateEnergyAssignment, useUpsertEnergyRpe } from "@/features/shared/hooks/useEnergyAssignments";
import { useEffect, useRef, useState } from "react";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";

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

  const [phase, setPhase]               = useState<"preview" | "log" | "rpe">("preview");
  const [localBlocks, setLocalBlocks]   = useState<BlockLogs>({});
  const [globalNote, setGlobalNote]     = useState("");
  const [actualDuration, setActualDuration] = useState<string>("");
  const [runDist, setRunDist]           = useState<RunDistanceValue>(initialRunDistance());
  const [rpeSelected, setRpeSelected]   = useState<number | null>(null);

  const { data: session, isLoading, isError } = useEnergySession(sessionId);
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
      for (const b of workBlocks) init[b.id] = existing[b.id] ?? { done: false, note: "" };
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
  const energyDraft: EnergyDraft = { phase, localBlocks, globalNote, actualDuration, runDist };
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

  // ── Phase RPE ──────────────────────────────────────────────────────────────
  if (phase === "rpe" || complete.isSuccess) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61,
          background: C.s1, borderRadius: "6px 6px 0 0", borderTop: "1px solid " + C.brd,
          padding: "24px 20px 40px",
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
            minHeight: 28, textAlign: "center", marginBottom: 28, fontSize: 13, fontWeight: 600,
            color: rpeSelected != null ? rpeColor(rpeSelected) : C.tx3,
            background: rpeSelected != null ? rpeBg(rpeSelected) : "transparent",
            borderRadius: 4, padding: "4px 12px",
          }}>
            {rpeSelected != null ? `${rpeSelected}/10 — ${FOSTER_LABELS[rpeSelected]}` : "Sélectionne une valeur"}
          </div>
          <button
            onClick={() => {
              if (rpeSelected != null)
                upsertRpe.mutate({ id: assignmentId, athleteId, rpe_score: rpeSelected }, { onSettled: onClose });
              else
                onClose();
            }}
            disabled={upsertRpe.isPending}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 6, border: "none",
              background: rpeSelected != null ? C.ac : C.s2,
              color: rpeSelected != null ? "#fff" : C.tx3,
              fontSize: 14, fontWeight: 700, cursor: rpeSelected != null ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >{upsertRpe.isPending ? "Enregistrement…" : "Enregistrer"}</button>
          <button onClick={onClose} style={{
            width: "100%", marginTop: 12, padding: "10px 0", border: "none",
            background: "transparent", color: C.tx3, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>Passer</button>
        </div>
      </>
    );
  }

  // ── Phase LOG ──────────────────────────────────────────────────────────────
  if (phase === "log") {
    const allBlocksDone = workBlocks.length === 0 || workBlocks.every(b => localBlocks[b.id]?.done);
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 480, maxWidth: "96vw", maxHeight: "88vh",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button onClick={() => setPhase("preview")} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Retour</button>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.tx }}>{session.name}</div>
          </div>
          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", scrollbarWidth: "none" }}>
            {isComplex && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>
                  Blocs d'effort
                </div>
                {workBlocks.map((b, i) => {
                  const done = localBlocks[b.id]?.done ?? false;
                  return (
                    <div key={b.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 0", borderBottom: i < workBlocks.length - 1 ? "1px solid " + C.brdL : "none",
                    }}>
                      <button
                        onClick={() => setLocalBlocks(prev => ({ ...prev, [b.id]: { ...prev[b.id], done: !done } }))}
                        style={{
                          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                          border: "1.5px solid " + (done ? C.g : C.brdL),
                          background: done ? C.g + "20" : "transparent",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {done && <Check size={13} color={C.g} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: done ? C.tx3 : C.tx, marginBottom: 4 }}>
                          Bloc {i + 1} — {fmtIv(b)}
                        </div>
                        <input
                          placeholder="Note (optionnel)"
                          value={localBlocks[b.id]?.note ?? ""}
                          onChange={e => setLocalBlocks(prev => ({ ...prev, [b.id]: { ...prev[b.id], note: e.target.value } }))}
                          style={{
                            width: "100%", padding: "6px 10px", borderRadius: 4,
                            border: "1px solid " + C.brdL, background: C.s2,
                            color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {/* Durée réelle */}
            <div style={{ marginTop: isComplex ? 16 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
                Durée réelle (min)
              </div>
              <input
                type="number" min={1} max={300}
                value={actualDuration}
                onChange={e => setActualDuration(e.target.value)}
                placeholder="Durée en minutes"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: C.s2,
                  color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {/* Activité + km (volume de course) */}
            <div style={{ marginTop: 16 }}>
              <RunDistanceInput value={runDist} onChange={setRunDist} />
            </div>
            {/* Note globale */}
            <textarea
              placeholder="Note sur la séance…"
              value={globalNote}
              onChange={e => setGlobalNote(e.target.value)}
              rows={2}
              style={{
                width: "100%", marginTop: 12, padding: "8px 10px", borderRadius: 4,
                border: "1px solid " + C.brdL, background: C.s2,
                color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
                resize: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {/* Footer */}
          <div style={{ padding: "12px 18px", borderTop: "1px solid " + C.brd, flexShrink: 0 }}>
            <button
              onClick={handleValidate}
              disabled={complete.isPending || (isComplex && !allBlocksDone)}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 4, border: "none",
                background: (isComplex && !allBlocksDone) ? C.s2 : C.g,
                color: (isComplex && !allBlocksDone) ? C.tx3 : "#fff",
                fontSize: 13, fontWeight: 700,
                cursor: complete.isPending || (isComplex && !allBlocksDone) ? "default" : "pointer",
                fontFamily: "inherit", opacity: complete.isPending ? 0.7 : 1,
              }}
            >
              {complete.isPending ? "Validation…" : "Valider la séance ✓"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Phase PREVIEW ─────────────────────────────────────────────────────────
  return (
    <SessionPreviewModal
      session={session}
      athleteId={athleteId}
      onClose={onClose}
      onValidate={!isCompleted ? () => setPhase("log") : undefined}
      onUnvalidate={isCompleted ? handleUnvalidate : undefined}
    />
  );
}
