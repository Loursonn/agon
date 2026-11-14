import React, { memo } from "react";
import type { SummaryMicrocycle } from "./hooks/usePlanningSummary";
import { useMicroStats } from "./hooks/useMicroStats";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  micro:     SummaryMicrocycle;
  athleteId: string;
}

export const MicrocycleCard = memo(function MicrocycleCard({ micro, athleteId }: Props) {
  const { data: stats } = useMicroStats(athleteId, micro.start_date, micro.end_date);

  const dateRange = `${format(parseISO(micro.start_date), "d MMM", { locale: fr })} → ${format(parseISO(micro.end_date), "d MMM", { locale: fr })}`;

  return (
    <div
      className="rounded-lg border border-agon-tx3/20 bg-agon-tx3/5 px-3 py-2.5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white/70">
            Semaine {micro.week_number}
          </span>
          {micro.is_deload && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 uppercase tracking-wider">
              Deload
            </span>
          )}
        </div>
        <span className="text-[10px] text-white/30">{dateRange}</span>
      </div>

      {/* Mini-stats grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Séances */}
        <div className="rounded-md p-1.5 bg-agon-accent/10 border border-agon-accent/20">
          <div className="text-[9px] text-white/40 mb-0.5">Séances</div>
          <div className="text-sm font-bold text-agon-accent">
            {stats ? `${stats.completed}/${stats.planned}` : "—"}
          </div>
        </div>

        {/* RPE */}
        <div className="rounded-md p-1.5 bg-agon-alerte/10 border border-agon-alerte/20">
          <div className="text-[9px] text-white/40 mb-0.5">RPE moy.</div>
          <div className="text-sm font-bold text-agon-alerte">
            {stats?.avg_rpe != null ? stats.avg_rpe.toFixed(1) : "—"}
          </div>
        </div>

        {/* Wellness */}
        <div className="rounded-md p-1.5 bg-agon-h-vert/10 border border-agon-h-vert/20">
          <div className="text-[9px] text-white/40 mb-0.5">Wellness</div>
          <div className="text-sm font-bold text-agon-h-vert">
            {stats?.avg_wellness != null ? `${stats.avg_wellness}/100` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
});
