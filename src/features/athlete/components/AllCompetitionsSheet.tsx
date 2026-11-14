import { X } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { localISO } from "@/lib/date";
import { COMPETITION_META, priorityLabel, type Competition, type CompetitionType } from "@/types/planning";
import { CompetitionDayCard } from "./CompetitionDayCard";

/** Liste de toutes les compétitions de l'athlète : à venir puis passées (avec bilan). */
export function AllCompetitionsSheet({ competitions, viewOnly, onClose }: {
  competitions: Competition[];
  viewOnly?: boolean;
  onClose: () => void;
}) {
  const today = localISO();
  const upcoming = competitions.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = competitions.filter((c) => c.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/[0.55]" />
      <div className="relative flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[6px] border border-agon-brd bg-agon-bg">
        <div className="flex shrink-0 items-center border-b border-agon-brd px-4 py-3.5">
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-agon-tx">Mes compétitions</div>
            <div className="mt-0.5 text-[11px] text-agon-tx3">
              {upcoming.length} à venir · {past.length} passée{past.length > 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-agon-tx3"
          ><X size={14} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-4 pb-7 pt-3">
          {competitions.length === 0 && (
            <div className="p-6 text-center text-[12px] text-agon-tx3">Aucune compétition</div>
          )}

          {upcoming.length > 0 && (
            <section>
              <SectionTitle>À venir</SectionTitle>
              <div className="flex flex-col gap-2">
                {upcoming.map((c) => {
                  const meta = COMPETITION_META[c.type as CompetitionType] ?? COMPETITION_META.autre;
                  const days = differenceInCalendarDays(parseISO(c.date), parseISO(today));
                  return (
                    <div key={c.id} className={cn(
                      "flex items-center gap-3 rounded-[6px] border bg-agon-s1 px-3.5 py-3",
                      c.priority === "A" ? "border-agon-coach/[0.31]" : "border-agon-brd",
                    )}>
                      <div className="w-11 shrink-0 text-center">
                        <div className={cn("text-[15px] font-black", days <= 7 ? "text-agon-coach" : "text-agon-tx")}>
                          {days === 0 ? "J" : `J-${days}`}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-bold text-agon-tx">{c.name}</span>
                          <PriorityBadge priority={c.priority} />
                        </div>
                        <div className="mt-[3px] text-[11px] text-agon-tx3">
                          {meta.label} · {format(parseISO(c.date), "EEE d MMM yyyy", { locale: fr })}
                          {c.location ? ` · ${c.location}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <SectionTitle>Passées</SectionTitle>
              <div className="flex flex-col gap-2.5">
                {past.map((c) => (
                  <CompetitionDayCard
                    key={c.id}
                    competition={{
                      id: c.id, name: c.name, type: c.type, date: c.date,
                      location: c.location, priority: c.priority,
                      athlete_comment: c.athlete_comment ?? null,
                    }}
                    viewOnly={viewOnly}
                    showDate
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
      {children}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span className={cn(
      "rounded-[6px] px-[7px] py-0.5 text-[9px] font-bold",
      priority === "A" ? "bg-agon-coach-doux text-agon-coach" : "bg-agon-alerte-doux text-agon-alerte",
    )}>
      {priorityLabel(priority)}
    </span>
  );
}
