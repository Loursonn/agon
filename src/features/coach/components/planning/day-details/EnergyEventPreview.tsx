import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";

/** Fetches full EnergySessionRow when an energy event is selected. */
export function EnergyEventPreview({ event, athleteId, onClose }: { event: CalEvent; athleteId: string; onClose: () => void }) {
  const sessionId = event.energySessionId ?? (event.raw?.energy_session_id as string | undefined);
  const { data: session, isLoading } = useEnergySession(sessionId);

  if (isLoading) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 780, maxWidth: "96vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "40px", textAlign: "center", color: C.tx3, fontSize: 13,
        }}>
          Chargement…
        </div>
      </>
    );
  }
  if (!session) return null;
  return <SessionPreviewModal session={session} athleteId={athleteId} onClose={onClose} />;
}
