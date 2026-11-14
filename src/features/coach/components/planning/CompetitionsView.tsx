/**
 * CompetitionsView — liste de toutes les compétitions d'un athlète
 * avec création / édition / suppression via CompetitionFormModal.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isFuture, isPast, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Pencil, Trash2, Ban, RotateCcw } from "lucide-react";
import { alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { competitionKeys, listCompetitions } from "@/api/competitions";
import { priorityLabel, COMPETITION_META } from "@/types/planning";
import { CompetitionFormModal } from "./CompetitionFormModal";
import { useCompetitionActions } from "@/features/shared/hooks/useCompetitionActions";
import { cancelledByLabel } from "@shared/domain/competitions";
import { useAuth } from "@/hooks/useAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Comp {
  id: string;
  athlete_id: string;
  coach_id: string;
  name: string;
  type: string;
  date: string;
  location: string | null;
  notes: string | null;
  priority: string;
  macrocycle_id: string | null;
  athlete_comment: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  created_at: string;
}

/** Pastille de priorité (A orange, B or, C pierre : charte). */
const PRIORITY_TONE: Record<string, string> = {
  A: "border-agon-alerte/[0.314] bg-agon-alerte/[0.133] text-agon-alerte",
  B: "border-agon-accent/[0.314] bg-agon-accent/[0.133] text-agon-accent",
  C: "border-agon-pierre/[0.314] bg-agon-pierre/[0.133] text-agon-pierre",
};
const ADD_BTN = "cursor-pointer items-center gap-1.5 rounded-[4px] border-0 bg-agon-accent py-2 text-[12px] font-bold text-agon-tx";
const ICON_BTN = "flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-agon-brd-l bg-transparent text-agon-tx3";

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useComps(athleteId: string) {
  return useQuery<Comp[]>({
    queryKey: competitionKeys.list(athleteId),
    enabled: !!athleteId,
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => (await listCompetitions(athleteId)) as unknown as Comp[],
  });
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  athleteId: string;
  coachId:   string;
}

export function CompetitionsView({ athleteId, coachId }: Props) {
  const { data: competitions = [], isLoading } = useComps(athleteId);
  const { user } = useAuth();
  const [formComp,   setFormComp]   = useState<Comp | null | "new">(null);

  const upcoming = competitions.filter((c) => isFuture(parseISO(c.date)) || isToday(parseISO(c.date)));
  const past     = competitions.filter((c) => isPast(parseISO(c.date)) && !isToday(parseISO(c.date)));
  // Les annulées restent listées (barrées) mais ne comptent pas.
  const nUpcoming = upcoming.filter((c) => !c.cancelled_at).length;
  const nPast     = past.filter((c) => !c.cancelled_at).length;
  const nCancelled = competitions.length - nUpcoming - nPast;

  if (isLoading) {
    return (
      <div className="py-10 text-center text-[12px] text-agon-tx3">
        Chargement…
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-[740px]">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[18px] font-extrabold text-agon-tx">Compétitions</div>
            <div className="mt-0.5 text-[11px] text-agon-tx3">
              {nUpcoming} à venir · {nPast} passée{nPast > 1 ? "s" : ""}{nCancelled > 0 ? ` · ${nCancelled} annulée${nCancelled > 1 ? "s" : ""}` : ""}
            </div>
          </div>
          <button onClick={() => setFormComp("new")} className={cn(ADD_BTN, "flex px-4")}>
            <Plus size={13} /> Ajouter
          </button>
        </div>

        {competitions.length === 0 ? (
          <div className="rounded-[6px] border border-agon-brd bg-agon-s1 py-[60px] text-center">
            <div className="mb-2.5 text-[32px]"></div>
            <div className="text-[14px] font-bold text-agon-tx">Aucune compétition</div>
            <div className="mb-4 mt-1 text-[12px] text-agon-tx3">
              Ajoute des compétitions pour planifier la saison.
            </div>
            <button onClick={() => setFormComp("new")} className={cn(ADD_BTN, "inline-flex px-[18px]")}>
              <Plus size={12} /> Ajouter une compétition
            </button>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Section title="À venir">
                {upcoming.map((c) => (
                  <CompRow
                    key={c.id}
                    comp={c}
                    viewerId={user?.id}
                    onEdit={() => setFormComp(c)}
                  />
                ))}
              </Section>
            )}

            {past.length > 0 && (
              <Section title="Passées" dimmed>
                {past.map((c) => (
                  <CompRow
                    key={c.id}
                    comp={c}
                    viewerId={user?.id}
                    onEdit={() => setFormComp(c)}
                    dimmed
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {formComp !== null && (
        <CompetitionFormModal
          athleteId={athleteId}
          coachId={coachId}
          existing={formComp === "new" ? null : (formComp as import("@/types/planning").Competition)}
          onClose={() => setFormComp(null)}
        />
      )}
    </>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, dimmed, children }: { title: string; dimmed?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <div className={cn("mb-2 text-[10px] font-bold uppercase tracking-[0.8px]", dimmed ? "text-agon-tx3" : "text-agon-tx2")}>
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {children}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface CompRowProps {
  comp:      Comp;
  viewerId?: string;
  onEdit:    () => void;
  dimmed?:   boolean;
}

function CompRow({ comp, viewerId, onEdit, dimmed }: CompRowProps) {
  const meta      = COMPETITION_META[comp.type as keyof typeof COMPETITION_META] ?? COMPETITION_META.competition;
  const priTone   = PRIORITY_TONE[comp.priority] ?? "border-agon-tx3/[0.314] bg-agon-tx3/[0.133] text-agon-tx3";
  const actions   = useCompetitionActions(comp);
  const cancelled = actions.cancelled;
  const by        = cancelledByLabel({ cancelled_by: comp.cancelled_by, athlete_id: comp.athlete_id }, viewerId);

  return (
    <div className={cn("rounded-[4px] border bg-agon-s1 px-4 py-3", cancelled ? "border-dashed border-agon-brd-l" : "border-agon-brd")}>
    <div className={cn("flex items-center gap-3 transition-opacity duration-150", (dimmed || cancelled) && "opacity-70")}>
      {/* Priority badge */}
      {/* Pastille de 28 px : la lettre seule, le libellé complet en infobulle */}
      <div
        title={priorityLabel(comp.priority)}
        aria-label={priorityLabel(comp.priority)}
        className={cn("flex size-7 flex-shrink-0 items-center justify-center rounded-[6px] border text-[11px] font-extrabold", cancelled ? "border-agon-brd-l text-agon-tx3" : priTone)}
      >
        {comp.priority ?? "—"}
      </div>

      {/* Emoji */}
      <div className="flex-shrink-0 text-[18px]">{meta.emoji}</div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[13px] font-bold", cancelled ? "text-agon-tx3 line-through" : "text-agon-tx")}>{comp.name}</span>
          {cancelled ? (
            <span className="rounded-[4px] border border-agon-brd-l px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.5px] text-agon-tx2">
              Annulée{by ? ` ${by}` : ""}
            </span>
          ) : (
            /* Couleur du type de compétition : donnée de COMPETITION_META */
            <span
              className="rounded-[4px] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: meta.color, background: alpha(meta.color, 0.094) }}
            >
              {meta.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-2.5 text-[11px] text-agon-tx3">
          <span>{format(parseISO(comp.date), "d MMMM yyyy", { locale: fr })}</span>
          {comp.location && <span>{comp.location}</span>}
          {comp.notes    && (
            <span className="max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap italic">
              {comp.notes}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 gap-1">
        <button onClick={onEdit} title="Modifier" aria-label="Modifier" className={ICON_BTN}>
          <Pencil size={13} />
        </button>
        <button
          onClick={actions.toggleCancel}
          disabled={actions.pending}
          title={cancelled ? "Rétablir" : "Annuler la compétition"}
          aria-label={cancelled ? "Rétablir" : "Annuler la compétition"}
          aria-pressed={actions.confirm === "cancel"}
          className={cn(ICON_BTN, cancelled && "text-agon-accent")}
        >
          {cancelled ? <RotateCcw size={13} /> : <Ban size={13} />}
        </button>
        <button
          onClick={actions.askDelete}
          disabled={actions.pending}
          title="Supprimer"
          aria-label="Supprimer"
          aria-pressed={actions.confirm === "delete"}
          className={cn(ICON_BTN, actions.confirm === "delete" && "text-agon-erreur")}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
    {actions.panel}

      {/* Bilan de l'athlète (compétitions passées) */}
      {comp.athlete_comment ? (
        <div className="mt-2.5 rounded-[4px] bg-agon-accent-doux px-2.5 py-2">
          <div className="mb-[3px] text-[9px] font-bold uppercase tracking-[0.4px] text-agon-accent">
            Retour de l'athlète
          </div>
          <div className="whitespace-pre-wrap text-[12px] leading-[1.5] text-agon-tx2">{comp.athlete_comment}</div>
        </div>
      ) : dimmed && !cancelled && (
        <div className="mt-2 text-[11px] italic text-agon-tx3">
          Pas encore de retour de l'athlète
        </div>
      )}
    </div>
  );
}
