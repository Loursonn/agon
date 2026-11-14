import type { ActiveMesocycle } from "@/features/shared/hooks/useActivePlan";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

// ── Plan actif card ───────────────────────────────────────────────────────────

export function ActivePlanCard({ meso }: { meso: ActiveMesocycle }) {
  const total = Math.max(1, meso.totalWeeks);
  return (
    <div style={{ borderRadius: 14, border: "1px solid " + C.brd, background: C.s1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>Plan actif</div>
          <div style={{ fontSize: 14, color: C.tx, marginTop: 2 }}>{meso.name}</div>
          {(meso.macroName || meso.objective) && (
            <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>{[meso.macroName, meso.objective].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <span style={{ ...MONO, fontSize: 13, color: C.tx, flex: "none" }}>
          S{meso.currentWeek} <span style={{ color: C.tx3 }}>/ {meso.totalWeeks}</span>
        </span>
      </div>
      <div aria-label={`Semaine ${meso.currentWeek} sur ${meso.totalWeeks}`} style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(total, 24)}, 1fr)`, gap: 4 }}>
        {Array.from({ length: Math.min(total, 24) }, (_, i) => (
          <span key={i} style={{ height: 4, borderRadius: 2, background: i + 1 < meso.currentWeek ? C.ac : i + 1 === meso.currentWeek ? "rgba(255,201,51,0.5)" : "rgba(231,211,168,0.12)" }} />
        ))}
      </div>
      <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>
        {meso.completionPct} % des séances faites{meso.frequency != null ? ` · ${meso.frequency} par semaine` : ""}
      </div>
    </div>
  );
}
