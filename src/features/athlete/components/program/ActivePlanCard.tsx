import type { ActiveMesocycle } from "@/features/shared/hooks/useActivePlan";
import { cn } from "@/lib/utils";

// ── Plan actif card ───────────────────────────────────────────────────────────

export function ActivePlanCard({ meso }: { meso: ActiveMesocycle }) {
  const total = Math.max(1, meso.totalWeeks);
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-agon-brd bg-agon-s1 px-3.5 py-3">
      <div className="flex items-end gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="agon-mono text-[10px] uppercase tracking-[0.12em] text-agon-tx3">Plan actif</div>
          <div className="mt-0.5 text-[14px] text-agon-tx">{meso.name}</div>
          {(meso.macroName || meso.objective) && (
            <div className="mt-0.5 text-[12px] text-agon-tx3">{[meso.macroName, meso.objective].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <span className="agon-mono flex-none text-[13px] text-agon-tx">
          S{meso.currentWeek} <span className="text-agon-tx3">/ {meso.totalWeeks}</span>
        </span>
      </div>
      <div aria-label={`Semaine ${meso.currentWeek} sur ${meso.totalWeeks}`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(total, 24)}, 1fr)` }}>
        {Array.from({ length: Math.min(total, 24) }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 rounded-[2px]",
              i + 1 < meso.currentWeek ? "bg-agon-accent" : i + 1 === meso.currentWeek ? "bg-agon-accent/50" : "bg-agon-sable/[0.12]",
            )}
          />
        ))}
      </div>
      <div className="agon-mono text-[11px] text-agon-tx3">
        {meso.completionPct} % des séances faites{meso.frequency != null ? ` · ${meso.frequency} par semaine` : ""}
      </div>
    </div>
  );
}
