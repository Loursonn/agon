import { C } from "@/lib/theme";
import type { PastCycle } from "@/features/shared/hooks/useActivePlan";
import { fmtShort } from "@/features/athlete/components/program/programUtils";

// ── Past cycle card (historique athlète) ───────────────────────────────────────

export function PastCycleCard({ cycle }: { cycle: PastCycle }) {
  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brdL, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cycle.name}
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
          {fmtShort(cycle.startDate)} → {fmtShort(cycle.endDate)} · {cycle.totalWeeks} sem.
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: cycle.completionPct >= 80 ? C.g : C.tx2 }}>
          {cycle.completionPct}%
        </div>
        <div style={{ fontSize: 9, color: C.tx3 }}>{cycle.completedLogs}/{cycle.totalLogs} séances</div>
      </div>
    </div>
  );
}
