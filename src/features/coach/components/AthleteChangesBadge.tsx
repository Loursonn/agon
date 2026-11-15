import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { useAthleteModifications } from "@/features/shared/hooks/useAthleteModifications";
import { localISO } from "@/lib/date";
import { relativeSince } from "@/lib/relativeSince";
import {
  athleteChanges,
  describeChange,
  markChangesSeen,
  readSeenChanges,
  recentChanges,
  unseenChanges,
  CHANGES_WINDOW_DAYS,
} from "@/lib/athleteChanges";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const fmtDay = (d: string) => format(parseISO(d), "EEE d MMM", { locale: fr });
const MAX_ROWS = 8;

/**
 * Badge « N modifs » de la barre coach : séances que l'athlète a déplacées
 * (ou complétées de séries / exercices ajoutés) ces 4 dernières semaines ou à
 * venir, que le coach n'a pas encore vues. Un clic ouvre la liste (quoi, quand,
 * par qui) ; la refermer les marque vues sur cet appareil.
 */
export function AthleteChangesBadge({ athleteId, athleteName }: { athleteId: string; athleteName: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const coachId = user?.id ?? "";
  const { data: logs = [] } = useAthleteModifications(athleteId);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => readSeenChanges(coachId, athleteId));
  useEffect(() => { setSeen(readSeenChanges(coachId, athleteId)); }, [coachId, athleteId]);

  const recent = useMemo(() => recentChanges(athleteChanges(logs), localISO()), [logs]);
  const unseen = useMemo(() => unseenChanges(recent, seen), [recent, seen]);
  // Liste figée à l'ouverture : les lignes gardent leur point « nouveau » tant qu'elle est ouverte.
  const [shownUnseen, setShownUnseen] = useState<Set<string>>(new Set());

  if (unseen.length === 0 && !open) return null;

  function onOpenChange(next: boolean) {
    if (next) setShownUnseen(new Set(unseen.map((c) => c.key)));
    else if (coachId) setSeen(markChangesSeen(coachId, athleteId, recent.map((c) => c.key)));
    setOpen(next);
  }

  const who = athleteName.split(" ")[0] || "L'athlète";
  const count = shownUnseen.size || unseen.length;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Ce que l'athlète a modifié"
          className="agon-mono flex-shrink-0 cursor-pointer whitespace-nowrap rounded-full border-0 bg-agon-alerte px-[9px] py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-agon-ink"
        >
          {count} modif{count > 1 ? "s" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] overflow-hidden rounded-[6px] border border-agon-brd-l bg-agon-s1 p-0">
        <div className="agon-mono border-b border-agon-brd px-3.5 py-2.5 text-[11px] uppercase tracking-[0.1em] text-agon-tx3">
          Modifiées par {who} · {CHANGES_WINDOW_DAYS / 7} dernières semaines
        </div>
        <ul className="m-0 max-h-[360px] list-none overflow-y-auto p-0">
          {recent.slice(0, MAX_ROWS).map((c) => {
            const isNew = shownUnseen.has(c.key);
            const since = relativeSince(c.updatedAt);
            return (
              <li key={c.key} className="flex gap-2.5 border-b border-agon-brd px-3.5 py-2.5 last:border-b-0">
                <span
                  aria-label={isNew ? "Nouveau" : undefined}
                  className={cn("mt-[6px] size-[7px] flex-none rounded-full", isNew ? "bg-agon-alerte" : "bg-transparent")}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-agon-tx">{c.sessionName || "Séance"}</div>
                  <div className="mt-0.5 text-[12px] text-agon-tx2">{describeChange(c, fmtDay)}</div>
                  <div className="mt-0.5 text-[11px] text-agon-tx3">
                    par {who}{since ? ` · ${since}` : ""}
                    {c.coachAlert && <span className="text-agon-alerte"> · change de semaine</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => { onOpenChange(false); navigate(`/coach/athletes/${athleteId}/retours`); }}
          className="w-full cursor-pointer border-0 border-t border-agon-brd bg-transparent px-3.5 py-2.5 text-left text-[12px] text-agon-accent"
        >
          Tout voir dans Retours ›
        </button>
      </PopoverContent>
    </Popover>
  );
}
