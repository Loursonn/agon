import { useMemo } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Accordion,
} from "@/components/ui/accordion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CalendarRange } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { SummaryMacrocycle } from "./hooks/usePlanningSummary";
import { useTestProgression } from "./hooks/useTestProgression";
import { MesocycleSummary } from "./MesocycleSummary";

interface Props {
  macro:     SummaryMacrocycle;
  athleteId: string;
}

const LINE_COLORS = ["#FFC933", "#FFC933", "#FF9500", "#22C55E", "#38BDF8"];

export function MacrocycleSummary({ macro, athleteId }: Props) {
  const { data: testSeries = [] } = useTestProgression(macro.id);

  // Merge all series onto shared date axis
  const chartData = useMemo(() => {
    if (!testSeries.length) return [];
    const dateSet = new Set<string>();
    for (const s of testSeries) s.data.forEach((p) => dateSet.add(p.date));
    const dates = [...dateSet].sort();
    return dates.map((date) => {
      const row: Record<string, unknown> = { date };
      for (const s of testSeries) {
        const pt = s.data.find((p) => p.date === date);
        if (pt) row[s.name] = pt.value;
      }
      return row;
    });
  }, [testSeries]);

  const totalMesos = macro.mesocycles.length;
  const totalMicros = useMemo(
    () => macro.mesocycles.reduce((s, m) => s + m.cycles.reduce((cs, c) => cs + c.microcycles.length, 0), 0),
    [macro.mesocycles],
  );

  const dateRange = `${format(parseISO(macro.start_date), "d MMM yyyy", { locale: fr })} → ${format(parseISO(macro.end_date), "d MMM yyyy", { locale: fr })}`;

  return (
    <AccordionItem
      value={macro.id}
      className="rounded-xl border border-[#FFC933]/30 bg-[#FFC933]/10 overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-white/5 transition-colors [&>svg]:text-[#FFC933]/60">
        <div className="flex items-center gap-2.5 text-left">
          <CalendarRange size={15} className="text-[#FFC933] shrink-0" />
          <div>
            <div className="text-sm font-bold text-white">{macro.name}</div>
            <div className="text-[11px] text-white/40">{dateRange}</div>
          </div>
          <div className="ml-auto mr-2 flex gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#22C55E]/20 text-[#22C55E] font-bold">
              {totalMesos} mésos
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFC933]/20 text-[#FFC933] font-bold">
              {totalMicros} semaines
            </span>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-4">
        <div className="flex flex-col gap-5 pt-2">

          {/* Objectif */}
          {macro.objective && (
            <div className="rounded-lg p-3 bg-[#0E0C0A]/50 border border-white/5">
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Objectif</p>
              <p className="text-sm text-white leading-relaxed">{macro.objective}</p>
            </div>
          )}

          {/* Test progression chart */}
          {chartData.length > 0 ? (
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Progression Tests</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    stroke="#7D7468"
                    tick={{ fill: "#7D7468", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#7D7468"
                    tick={{ fill: "#7D7468", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0E0C0A", border: "1px solid #7D7468", borderRadius: 4, fontSize: 10 }}
                    labelStyle={{ color: "#fff" }}
                    itemStyle={{ color: "#FFC933" }}
                  />
                  {testSeries.length > 1 && (
                    <Legend wrapperStyle={{ fontSize: 10, color: "#7D7468" }} />
                  )}
                  {testSeries.map((s, i) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ fill: LINE_COLORS[i % LINE_COLORS.length], r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-white/25 text-center py-2">Aucun résultat de test</p>
          )}

          {/* Nested mesocycles */}
          {macro.mesocycles.length > 0 && (
            <Accordion type="multiple" className="flex flex-col gap-3">
              {macro.mesocycles.map((meso) => (
                <MesocycleSummary key={meso.id} meso={meso} athleteId={athleteId} />
              ))}
            </Accordion>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
