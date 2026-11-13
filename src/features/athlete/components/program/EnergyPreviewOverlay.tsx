import { C } from "@/lib/theme";
import { EnergyActiveSession } from "@/features/athlete/components/program/EnergyActiveSession";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import type { StepState } from "@/features/athlete/components/program/programTypes";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useState } from "react";

// ── Energy preview overlay ────────────────────────────────────────────────────

export function EnergyPreviewOverlay({
  energySessionId, assignmentId, scheduledDate, initialStatus, today,
  athleteId, onClose,
  onRescheduleToToday, onComplete, onCancel,
}: {
  energySessionId: string;
  assignmentId: string;
  scheduledDate: string;
  initialStatus: string;
  today: string;
  athleteId: string;
  onClose: () => void;
  onRescheduleToToday: () => void;
  onComplete: (log: Map<string, StepState>) => void;
  onCancel: () => void;
}) {
  const { data: session, isLoading, isError } = useEnergySession(energySessionId);
  const [isNowToday,    setIsNowToday]    = useState(scheduledDate === today);
  const [sessionActive, setSessionActive] = useState(false);

  if (!energySessionId || isError || (!isLoading && !session)) return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%,-50%)", width: 420, maxWidth: "96vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: 40, textAlign: "center", color: C.tx3, fontSize: 13,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <span>Séance introuvable</span>
        <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
      </div>
    </>
  );
  if (isLoading) return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%,-50%)", width: 420, maxWidth: "96vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: 40, textAlign: "center", color: C.tx3, fontSize: 13,
      }}>Chargement…</div>
    </>
  );
  if (!session) return null;
  void assignmentId;

  const isCompleted = initialStatus === "completed";

  // — Active mode: interactive step-by-step validation —
  if (sessionActive) {
    return (
      <EnergyActiveSession
        session={session}
        athleteId={athleteId}
        onTerminate={(log) => onComplete(log)}
        onClose={onClose}
      />
    );
  }

  // — Preview mode —
  const startLabel = !isCompleted
    ? (isNowToday ? "Faire la séance ▶" : "Faire la séance aujourd'hui")
    : undefined;

  const onStartFn = !isCompleted
    ? isNowToday
      ? () => setSessionActive(true)
      : () => { onRescheduleToToday(); setIsNowToday(true); }
    : undefined;

  return (
    <SessionPreviewModal
      session={session}
      athleteId={athleteId}
      onClose={onClose}
      onStart={onStartFn}
      startLabel={startLabel}
      onCancel={isCompleted ? onCancel : undefined}
    />
  );
}
