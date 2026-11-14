import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { SummaryCycle } from "./hooks/usePlanningSummary";
import { MicrocycleCard } from "./MicrocycleCard";

interface Props {
  cycle:     SummaryCycle;
  athleteId: string;
}

export function CycleSummary({ cycle, athleteId }: Props) {
  const dateRange = `${format(parseISO(cycle.start_date), "d MMM", { locale: fr })} → ${format(parseISO(cycle.end_date), "d MMM", { locale: fr })}`;

  return (
    <AccordionItem
      value={cycle.id}
      className="rounded-xl border border-agon-alerte/30 bg-agon-alerte/10 overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-white/5 transition-colors [&>svg]:text-agon-alerte/60">
        <div className="flex items-center gap-2 text-left">
          <Calendar size={14} className="text-agon-alerte shrink-0" />
          <span className="text-sm font-bold text-white">{cycle.name}</span>
          <span className="text-xs text-white/40">{dateRange}</span>
          <span className="ml-auto mr-2 text-[10px] px-2 py-0.5 rounded-full bg-agon-alerte/20 text-agon-alerte font-semibold">
            {cycle.microcycles.length} sem.
          </span>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-4">
        <div className="flex flex-col gap-2 pt-1">
          {cycle.microcycles.length === 0 ? (
            <p className="text-xs text-white/30 py-2">Aucun microcycle</p>
          ) : (
            cycle.microcycles.map((micro) => (
              <MicrocycleCard key={micro.id} micro={micro} athleteId={athleteId} />
            ))
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
