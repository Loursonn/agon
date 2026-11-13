import { C } from "@/lib/theme";
import type { EnergySessionRow } from "@/types/energy";
import { StepCheckRow } from "@/features/athlete/components/program/StepCheckRow";
import type { StepState, StepStatus } from "@/features/athlete/components/program/programTypes";
import { TYPE_COLOR } from "@/lib/peps";
import { X, Zap } from "lucide-react";
import { useAthleteReferences } from "@/features/shared/hooks/useAthleteReferences";
import { useState } from "react";

// ── Energy active session — interactive step validation ───────────────────────

export function EnergyActiveSession({
  session, athleteId, onTerminate, onClose,
}: {
  session: EnergySessionRow;
  athleteId: string;
  onTerminate: (log: Map<string, StepState>) => void;
  onClose: () => void;
}) {
  const steps = session.intervals ?? [];
  const [stepStates, setStepStates] = useState<Map<string, StepState>>(new Map());
  const { data: refs } = useAthleteReferences(athleteId);
  const vma = refs?.VMA ?? null;

  const kc = session.session_kind === "specifique" ? TYPE_COLOR.hyrox : TYPE_COLOR.energie;

  function setStatus(id: string, status: StepStatus) {
    setStepStates(prev => {
      const n = new Map(prev);
      const cur = n.get(id);
      // Toggle: same status → remove (back to pending)
      if (cur?.status === status) { n.delete(id); }
      else { n.set(id, { status, comment: cur?.comment ?? "" }); }
      return n;
    });
  }
  function setComment(id: string, comment: string) {
    setStepStates(prev => {
      const n = new Map(prev);
      const cur = n.get(id);
      if (cur) n.set(id, { ...cur, comment });
      return n;
    });
  }

  const validatedCount = stepStates.size;
  const total          = steps.length;
  const hasUnsavedPartial = Array.from(stepStates.values()).some(
    s => s.status === "partial" && !s.comment.trim()
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.7)" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: C.s1, borderRadius: "6px 6px 0 0", border: "1px solid " + C.brd,
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 4, background: kc + "25", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap size={14} color={kc} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session.name}
            </div>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
              {validatedCount}/{total} blocs validés · En cours…
            </div>
            {session.notes && (
              <div style={{ fontSize: 11, color: C.tx2, marginTop: 4, fontStyle: "italic", whiteSpace: "pre-line" }}>
                {session.notes}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ height: "100%", background: C.g, width: total > 0 ? `${(validatedCount / total) * 100}%` : "0%", transition: "width 0.3s ease", borderRadius: "0 2px 2px 0" }} />
        </div>

        {/* Steps */}
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((step, i) => {
            const id = step.id ?? String(i);
            return (
              <StepCheckRow
                key={id}
                step={step}
                state={stepStates.get(id)}
                vma={vma}
                onDone={() => setStatus(id, "done")}
                onPartial={() => setStatus(id, "partial")}
                onComment={(v) => setComment(id, v)}
              />
            );
          })}
        </div>

        {/* Terminer */}
        <div style={{ padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))", borderTop: "1px solid " + C.brd, flexShrink: 0 }}>
          {hasUnsavedPartial && (
            <div style={{ fontSize: 11, color: "#F59E0B", textAlign: "center", marginBottom: 8 }}>
              Remplis les commentaires des blocs non terminés
            </div>
          )}
          <button
            onClick={() => onTerminate(stepStates)}
            disabled={hasUnsavedPartial}
            style={{
              width: "100%", padding: "16px 0", borderRadius: 6, border: "none",
              background: hasUnsavedPartial ? C.s2 : C.g,
              color: hasUnsavedPartial ? C.tx3 : "#fff",
              fontSize: 15, fontWeight: 800,
              cursor: hasUnsavedPartial ? "default" : "pointer",
              fontFamily: "inherit",
              boxShadow: hasUnsavedPartial ? "none" : "0 4px 20px rgba(16,185,129,0.35)",
              transition: "all 0.2s ease",
            }}
          >
            Terminer la séance ✓
          </button>
        </div>
      </div>
    </>
  );
}
