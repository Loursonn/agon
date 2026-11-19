import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { localISO } from "@/lib/date";
import { COMPETITION_META, priorityLabel, type Competition, type CompetitionType } from "@/types/planning";
import { CompetitionDayCard } from "./CompetitionDayCard";
import { CompetitionActions } from "@/features/shared/components/CompetitionActions";
import { EventFormPage } from "./EventFormPage";
import { cancelledByLabel, isCancelled } from "@shared/domain/competitions";
import { useAuth } from "@/hooks/useAuth";

/**
 * Liste de toutes les compétitions de l'athlète : à venir puis passées (avec
 * bilan). « ⋯ » sur chaque ligne : modifier, annuler (reste barrée), rétablir, supprimer.
 */
export function AllCompetitionsSheet({ competitions, viewOnly, onClose }: {
  competitions: Competition[];
  viewOnly?: boolean;
  onClose: () => void;
}) {
  const today = localISO();
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Competition | null>(null);
  const upcoming = competitions.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = competitions.filter((c) => c.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const nUp = upcoming.filter((c) => !isCancelled(c)).length;
  const nPast = past.filter((c) => !isCancelled(c)).length;
  const nCancelled = competitions.length - nUp - nPast;
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const manage = (c: Competition) => !viewOnly && open === c.id && (
    <CompetitionActions comp={c} onDone={() => setOpen(null)} onEdit={() => { setOpen(null); setEditing(c); }} className="mt-2" />
  );
  const moreBtn = (c: Competition) => !viewOnly && (
    <button
      type="button"
      onClick={() => toggle(c.id)}
      aria-label={`Modifier, annuler ou supprimer ${c.name}`}
      aria-expanded={open === c.id}
      className={cn(
        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border bg-transparent",
        open === c.id ? "border-agon-accent/40 text-agon-accent" : "border-agon-brd-l text-agon-tx3",
      )}
    ><MoreHorizontal size={15} /></button>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/[0.55]" />
      <div className="relative flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[6px] border border-agon-brd bg-agon-bg">
        <div className="flex shrink-0 items-center border-b border-agon-brd px-4 py-3.5">
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-agon-tx">Mes compétitions</div>
            <div className="mt-0.5 text-[11px] text-agon-tx3">
              {nUp} à venir · {nPast} passée{nPast > 1 ? "s" : ""}{nCancelled > 0 ? ` · ${nCancelled} annulée${nCancelled > 1 ? "s" : ""}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
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
                  const cancelled = isCancelled(c);
                  return (
                    <div key={c.id}>
                      <div className={cn(
                        "flex items-center gap-3 rounded-[6px] border bg-agon-s1 px-3.5 py-3",
                        cancelled ? "border-dashed border-agon-brd-l" : c.priority === "A" ? "border-agon-coach/[0.31]" : "border-agon-brd",
                      )}>
                        <div className="w-11 shrink-0 text-center">
                          <div className={cn("text-[15px] font-black", cancelled ? "text-agon-tx3" : days <= 7 ? "text-agon-coach" : "text-agon-tx")}>
                            {cancelled ? "—" : days === 0 ? "J" : `J-${days}`}
                          </div>
                        </div>
                        <CompInfo c={c} meta={meta.label} viewerId={user?.id} />
                        {moreBtn(c)}
                      </div>
                      {manage(c)}
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
                  <div key={c.id}>
                    {isCancelled(c) ? (
                      // Annulée : pas de bilan à écrire
                      <div className="flex items-center gap-3 rounded-[6px] border border-dashed border-agon-brd-l bg-agon-s1 px-3.5 py-3">
                        <CompInfo c={c} meta={(COMPETITION_META[c.type as CompetitionType] ?? COMPETITION_META.autre).label} viewerId={user?.id} />
                        {moreBtn(c)}
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <CompetitionDayCard
                            competition={{
                              id: c.id, name: c.name, type: c.type, date: c.date,
                              location: c.location, priority: c.priority,
                              athlete_comment: c.athlete_comment ?? null,
                              athlete_id: c.athlete_id, result_text: c.result_text ?? null,
                              result_url: c.result_url ?? null, rpe_score: c.rpe_score ?? null,
                            }}
                            viewOnly={viewOnly}
                            showDate
                          />
                        </div>
                        {moreBtn(c)}
                      </div>
                    )}
                    {manage(c)}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {editing && (
        <EventFormPage
          athleteId={editing.athlete_id}
          coachId={editing.coach_id}
          coachName={null}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CompInfo({ c, meta, viewerId }: { c: Competition; meta: string; viewerId?: string }) {
  const cancelled = isCancelled(c);
  const by = cancelled ? cancelledByLabel(c, viewerId) : "";
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-[14px] font-bold", cancelled ? "text-agon-tx3 line-through" : "text-agon-tx")}>{c.name}</span>
        {cancelled ? (
          <span className="rounded-[6px] border border-agon-brd-l px-[7px] py-0.5 text-[9px] font-bold text-agon-tx2">
            Annulée{by ? ` ${by}` : ""}
          </span>
        ) : <PriorityBadge priority={c.priority} />}
      </div>
      <div className="mt-[3px] text-[11px] text-agon-tx3">
        {meta} · {format(parseISO(c.date), "EEE d MMM yyyy", { locale: fr })}
        {c.location ? ` · ${c.location}` : ""}
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
