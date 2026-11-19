import { cn } from "@/lib/utils";
import { useCompetitionActions, type CompetitionActionTarget } from "@/features/shared/hooks/useCompetitionActions";

const BTN = "h-9 flex-1 cursor-pointer rounded-[10px] border bg-transparent px-3 font-[inherit] text-[12.5px] disabled:cursor-default disabled:opacity-50";

export type { CompetitionActionTarget };

/**
 * « Modifier » (si `onEdit`), puis « Annuler la compétition » (ou « Rétablir »)
 * et « Supprimer », puis la confirmation. Pour les fenêtres et les feuilles (téléphone).
 */
export function CompetitionActions({ comp, onDone, onEdit, className }: {
  comp: CompetitionActionTarget;
  onDone?: (what: "cancelled" | "restored" | "deleted") => void;
  /** Ouvre le formulaire pré-rempli (nom, date, priorité, lieu). */
  onEdit?: () => void;
  className?: string;
}) {
  const a = useCompetitionActions(comp, onDone);
  return (
    <div className={className}>
      {onEdit && (
        <div className="mb-2 flex">
          <button type="button" disabled={a.pending} onClick={onEdit}
            className={cn(BTN, "border-agon-brd-l text-agon-tx")}>
            Modifier
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={a.pending} onClick={a.toggleCancel}
          aria-pressed={a.confirm === "cancel"}
          className={cn(BTN, a.cancelled ? "border-agon-accent/40 text-agon-accent" : "border-agon-brd-l text-agon-tx2")}>
          {a.cancelled ? "Rétablir" : "Annuler la compétition"}
        </button>
        <button type="button" disabled={a.pending} onClick={a.askDelete}
          aria-pressed={a.confirm === "delete"}
          className={cn(BTN, "border-agon-rouge/40 text-agon-rouge")}>
          Supprimer
        </button>
      </div>
      {a.panel}
    </div>
  );
}
