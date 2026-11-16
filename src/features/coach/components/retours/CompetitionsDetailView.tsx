import { priorityLabel } from "@/types/planning";
import { CompetitionResultLine } from "@/features/shared/components/CompetitionResultLine";
import { Trophy, X, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SHEET_CLOSE, SHEET_HEAD, SHEET_OVERLAY, SHEET_PANEL, SHEET_SUB, SHEET_TITLE, STAT_CARD, STAT_LABEL, STAT_VALUE, TYPE_TAG } from "./detailSheet";
import { EmptyState } from "@/features/shared/components/EmptyState";
import type { CompetitionDetail } from "@/features/shared/types/retours.types";

interface CompetitionsDetailViewProps {
  competitions: CompetitionDetail[];
  onClose: () => void;
}

/** Importance A / B / C : pastille teintée 12,5 %. */
const PRIORITY_TONE: Record<string, string> = {
  A: "bg-agon-erreur/[0.125] text-agon-erreur",
  B: "bg-agon-alerte/[0.125] text-agon-alerte",
  C: "bg-agon-or-clair/[0.125] text-agon-or-clair",
};

function CompCard({ comp }: { comp: CompetitionDetail }) {
  return (
    <div className="rounded-[4px] bg-agon-s2 px-3.5 py-3">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-bold text-agon-tx">
            {comp.name}
          </span>
          {comp.type && (
            <span className={TYPE_TAG}>
              {comp.type}
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {comp.priority && (
            <span className={cn("rounded-[6px] px-2 py-0.5 text-[10px] font-extrabold", PRIORITY_TONE[comp.priority])}>
              {priorityLabel(comp.priority)}
            </span>
          )}
          <span className="text-[10px] text-agon-tx3">
            {format(parseISO(comp.date), "d MMM yyyy", { locale: fr })}
          </span>
        </div>
      </div>

      {/* Location */}
      {comp.location && (
        <div className="mb-2 flex items-center gap-[5px]">
          <MapPin size={10} color={C.tx3} />
          <span className="text-[11px] text-agon-tx3">{comp.location}</span>
        </div>
      )}

      {/* Séance du jour J et retour de l'athlète (lecture seule) */}
      <CompetitionResultLine comp={comp} />
      {comp.athlete_comment ? (
        <div className="rounded-[4px] bg-agon-accent-doux px-2.5 py-2">
          <div className="mb-[3px] text-[9px] font-bold text-agon-accent">Retour de l'athlète</div>
          <div className="whitespace-pre-wrap text-[12px] text-agon-tx2">{comp.athlete_comment}</div>
        </div>
      ) : (
        <div className="text-[11px] italic text-agon-tx3">Pas encore de retour de l'athlète</div>
      )}
    </div>
  );
}

export function CompetitionsDetailView({ competitions, onClose }: CompetitionsDetailViewProps) {
  const countA = competitions.filter((c) => c.priority === "A").length;
  const countB = competitions.filter((c) => c.priority === "B").length;
  const countC = competitions.filter((c) => c.priority === "C").length;

  return (
    <div className={SHEET_OVERLAY}>
      <div className={SHEET_PANEL}>
        <div className={SHEET_HEAD}>
          <div>
            <div className={SHEET_TITLE}>Compétitions — détails</div>
            <div className={SHEET_SUB}>{competitions.length} au total</div>
          </div>
          <button onClick={onClose} className={SHEET_CLOSE}><X size={16} /></button>
        </div>

        {/* Stats row */}
        {competitions.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Total",       value: competitions.length, tone: "text-agon-accent" },
              { label: "Importance A",  value: countA,              tone: "text-agon-erreur" },
              { label: "Importance B",  value: countB,              tone: "text-agon-alerte" },
              { label: "Importance C",  value: countC,              tone: "text-agon-or-clair" },
            ].map(({ label, value, tone }) => (
              <div key={label} className={STAT_CARD}>
                <div className={STAT_LABEL}>{label}</div>
                <div className={cn(STAT_VALUE, "text-[20px] leading-none", tone)}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {competitions.length === 0
          ? <EmptyState icon={Trophy} title="Aucune compétition ce mois" />
          : (
            <div className="flex flex-col gap-2.5">
              {competitions.map((c) => <CompCard key={c.id} comp={c} />)}
            </div>
          )
        }
      </div>
    </div>
  );
}
