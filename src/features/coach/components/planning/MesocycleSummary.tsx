import { useMemo } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Accordion,
} from "@/components/ui/accordion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Layers } from "lucide-react";
import { format, parseISO, differenceInWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import type { SummaryMesocycle } from "./hooks/usePlanningSummary";
import { useMesoLoad } from "./hooks/useMesoLoad";
import { CycleSummary } from "./CycleSummary";

interface Props {
  meso:      SummaryMesocycle;
  athleteId: string;
}

const ZONE_COLORS: Record<string, string> = {
  Z1: "#22C55E", Z2: "#84CC16", Z3: "#EAB308", Z4: "#F97316", Z5: "#EF4444",
};

export function MesocycleSummary({ meso, athleteId }: Props) {
  const { data: loadData = [] } = useMesoLoad(meso, athleteId);

  const numWeeks = useMemo(
    () => Math.max(1, differenceInWeeks(parseISO(meso.end_date), parseISO(meso.start_date)) + 1),
    [meso.start_date, meso.end_date],
  );

  const totalMicros = useMemo(
    () => meso.cycles.reduce((s, c) => s + c.microcycles.length, 0),
    [meso.cycles],
  );

  const zones = meso.intensity_config?.zones ?? [];

  const dateRange = `${format(parseISO(meso.start_date), "d MMM", { locale: fr })} → ${format(parseISO(meso.end_date), "d MMM", { locale: fr })}`;

  return (
    <AccordionItem
      value={meso.id}
      className="rounded-xl border border-[#FFC933]/30 bg-[#FFC933]/10 overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-white/5 transition-colors [&>svg]:text-[#FFC933]/60">
        <div className="flex items-center gap-2 text-left">
          <Layers size={14} className="text-[#FFC933] shrink-0" />
          <span className="text-sm font-bold text-white">{meso.name}</span>
          <span className="text-xs text-white/40">{dateRange}</span>
          <div className="ml-auto mr-2 flex gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFC933]/20 text-[#FFC933] font-semibold">
              {numWeeks} sem.
            </span>
            {totalMicros > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 font-medium">
                {totalMicros} micros
              </span>
            )}
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-4">
        <div className="flex flex-col gap-4 pt-2">
          {/* Config mini-cards */}
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="Volume" value={meso.volume_config?.type ?? "—"} />
            <InfoCard
              label="Intensité"
              value={zones.length > 0 ? zones.join(", ") : "—"}
              valueStyle={zones.length > 0 ? { display: "flex", gap: 4, flexWrap: "wrap" as const } : undefined}
              renderValue={zones.length > 0
                ? () => (
                  <div className="flex gap-1 flex-wrap">
                    {zones.map((z) => (
                      <span
                        key={z}
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ color: ZONE_COLORS[z] ?? "#fff", background: (ZONE_COLORS[z] ?? "#fff") + "20" }}
                      >
                        {z}
                      </span>
                    ))}
                  </div>
                )
                : undefined
              }
            />
            <InfoCard
              label="Fréquence"
              value={meso.frequency != null ? `${meso.frequency} séances/sem` : "—"}
            />
            <InfoCard
              label="Semaine deload"
              value={meso.deload_week ? `S${meso.deload_week}` : "—"}
            />
          </div>

          {/* Load chart */}
          {loadData.length > 0 && (
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Charge hebdomadaire</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={loadData} margin={{ top: 2, right: 4, left: -24, bottom: 0 }} barCategoryGap="20%">
                  <XAxis
                    dataKey="week"
                    stroke="#7D7468"
                    tick={{ fill: "#7D7468", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0E0C0A", border: "none", borderRadius: 4, fontSize: 10 }}
                    cursor={{ fill: "#FFC933", opacity: 0.1 }}
                    labelStyle={{ color: "#fff" }}
                    itemStyle={{ color: "#FFC933" }}
                    formatter={(v: number) => [v, "Charge"]}
                  />
                  <Bar dataKey="load" fill="#FFC933" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Nested cycles */}
          {meso.cycles.length > 0 && (
            <Accordion type="multiple" className="flex flex-col gap-2">
              {meso.cycles.map((cycle) => (
                <CycleSummary key={cycle.id} cycle={cycle} athleteId={athleteId} />
              ))}
            </Accordion>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ── Small helper card ─────────────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  renderValue,
  valueStyle,
}: {
  label:        string;
  value:        string;
  renderValue?: () => React.ReactNode;
  valueStyle?:  React.CSSProperties;
}) {
  return (
    <div className="rounded-lg p-3 bg-[#0E0C0A]/50 border border-white/5">
      <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
      {renderValue ? (
        renderValue()
      ) : (
        <p className="text-xs font-semibold text-white capitalize" style={valueStyle}>
          {value}
        </p>
      )}
    </div>
  );
}
