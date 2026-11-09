import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteCycle, deletePeriod, invalidateCycles, updatePeriod, type PeriodLevel } from "@/api/cycles";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import type { Competition, TimelineData } from "../hooks/useTimelineData";
import { LEVEL_STYLE, type DrawerType } from "../utils/timelineLevels";
import { MacrocycleDrawer } from "./MacrocycleDrawer";
import { MesocycleDrawer } from "./MesocycleDrawer";
import { CycleDrawer } from "./CycleDrawer";
import { MicrocycleDrawer } from "./MicrocycleDrawer";
import { CompetitionDrawer } from "./CompetitionDrawer";

export interface DrawerState {
  type: DrawerType;
  id: string;
}

interface Props {
  state: DrawerState;
  onClose: () => void;
  data: TimelineData | undefined;
  athleteId: string;
  rangeStart: string;
  rangeEnd: string;
  onEditComp?: (comp: Competition) => void;
  onDeleteComp?: (comp: Competition) => void;
}

const TABLE_MAP: Partial<Record<DrawerType, PeriodLevel>> = {
  macrocycle: "macrocycles",
  mesocycle: "mesocycles",
  cycle: "cycles",
  microcycle: "microcycles",
};

const ICON_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-agon-brd-l text-agon-tx3 hover:bg-agon-s2 hover:text-agon-tx md:h-8 md:w-8";

/** Tiroir de détail d'une période ou d'une compétition : plein écran sur mobile, 480 px à droite sur PC. */
export function PeriodDrawer({ state, onClose, data, athleteId, rangeStart, rangeEnd, onEditComp, onDeleteComp }: Props) {
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [working, setWorking] = useState(false);

  if (!data) return null;

  const canRename = state.type !== "competition" && state.type !== "microcycle";
  const canDelete = state.type !== "competition";
  const style = LEVEL_STYLE[state.type];

  async function handleRename() {
    if (!renameDraft.trim() || !canRename) return;
    const table = TABLE_MAP[state.type];
    if (!table) return;
    setWorking(true);
    try {
      await updatePeriod(table, state.id, { name: renameDraft.trim() });
    } catch {
      setWorking(false);
      toast.error("Erreur lors du renommage");
      return;
    }
    setWorking(false);
    void invalidateCycles(qc, athleteId);
    toast.success("Renommé");
    setRenaming(false);
  }

  async function handleDelete() {
    setWorking(true);
    try {
      // Les niveaux inférieurs suivent (clés étrangères en cascade) ; les
      // séances restent, détachées de leurs semaines.
      if (state.type === "macrocycle") await deletePeriod("macrocycles", state.id);
      else if (state.type === "mesocycle") await deletePeriod("mesocycles", state.id);
      else if (state.type === "cycle") await deleteCycle(state.id);
      else if (state.type === "microcycle") await deletePeriod("microcycles", state.id);
      void invalidateCycles(qc, athleteId);
      toast.success("Supprimé");
      onClose();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setWorking(false);
    }
  }

  let title = "";
  let subtitle = "";
  let content: React.ReactNode = null;

  switch (state.type) {
    case "macrocycle": {
      const m = data.macrocycles.find((x) => x.id === state.id);
      if (!m) return null;
      title = m.name;
      subtitle = `${format(parseISO(m.start_date), "d MMM yyyy", { locale: fr })} → ${format(parseISO(m.end_date), "d MMM yyyy", { locale: fr })}`;
      content = (
        <MacrocycleDrawer
          macro={m}
          siblings={[...data.macrocycles].sort((a, b) => a.start_date.localeCompare(b.start_date))}
          athleteId={athleteId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onClose={onClose}
        />
      );
      break;
    }
    case "mesocycle": {
      const m = data.mesocycles.find((x) => x.id === state.id);
      if (!m) return null;
      title = m.name;
      subtitle = `${format(parseISO(m.start_date), "d MMM", { locale: fr })} → ${format(parseISO(m.end_date), "d MMM", { locale: fr })}`;
      const mesoSiblings = [...data.mesocycles]
        .filter((s) => s.macrocycle_id === m.macrocycle_id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      content = (
        <MesocycleDrawer
          meso={m}
          siblings={mesoSiblings}
          allMacros={[...data.macrocycles].sort((a, b) => a.start_date.localeCompare(b.start_date))}
          athleteId={athleteId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
        />
      );
      break;
    }
    case "cycle": {
      const c = data.cycles.find((x) => x.id === state.id);
      if (!c) return null;
      const parentMeso = data.mesocycles.find((m) => m.id === c.mesocycle_id);
      const cycleSiblings = [...data.cycles]
        .filter((s) => s.mesocycle_id === c.mesocycle_id)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      title = c.name;
      subtitle = `${format(parseISO(c.start_date), "d MMM", { locale: fr })} → ${format(parseISO(c.end_date), "d MMM", { locale: fr })}`;
      content = (
        <CycleDrawer
          cycle={c}
          parentMeso={parentMeso}
          siblings={cycleSiblings}
          allMesos={data.mesocycles}
          athleteId={athleteId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onClose={onClose}
        />
      );
      break;
    }
    case "microcycle": {
      const mi = data.microcycles.find((x) => x.id === state.id);
      if (!mi) return null;
      const siblings = data.microcycles
        .filter((m) => m.cycle_id === mi.cycle_id)
        .sort((a, b) => a.week_number - b.week_number);
      const idx = siblings.findIndex((m) => m.id === mi.id);
      const prevMicro = idx > 0 ? siblings[idx - 1] : undefined;
      title = `Semaine ${mi.week_number}`;
      subtitle = `${format(parseISO(mi.start_date), "d MMM", { locale: fr })} → ${format(parseISO(mi.end_date), "d MMM", { locale: fr })}`;
      content = <MicrocycleDrawer micro={mi} prevMicro={prevMicro} athleteId={athleteId} />;
      break;
    }
    case "competition": {
      const c = data.competitions.find((x) => x.id === state.id);
      if (!c) return null;
      title = c.name;
      subtitle = format(parseISO(c.date), "d MMMM yyyy", { locale: fr });
      content = (
        <CompetitionDrawer
          comp={c}
          onEdit={onEditComp ? () => onEditComp(c) : undefined}
          onDelete={onDeleteComp ? () => { onDeleteComp(c); onClose(); } : undefined}
        />
      );
      break;
    }
  }

  const typeLabel = state.type === "competition" ? "Compétition" : state.type.charAt(0).toUpperCase() + state.type.slice(1);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/50" />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-agon-brd bg-agon-s1 font-ui text-agon-tx animate-in slide-in-from-right duration-200 md:max-w-[480px]"
      >
        <header className="flex shrink-0 items-center gap-agon-md border-b border-agon-brd px-agon-lg py-agon-md md:px-5">
          <div className={cn("h-9 w-1.5 shrink-0 rounded-md", style.solid)} />

          <div className="min-w-0 flex-1">
            <div className={cn("text-agon-xs font-bold uppercase tracking-wide", style.text)}>{typeLabel}</div>
            {renaming ? (
              <div className="mt-agon-2xs flex items-center gap-agon-xs">
                <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); if (e.key === "Escape") setRenaming(false); }}
                  className="min-w-0 flex-1 font-bold"
                />
                <button type="button" aria-label="Valider" onClick={() => void handleRename()} disabled={working} className={cn(ICON_BTN, "border-0 text-agon-ink", style.solid)}>
                  {working ? "…" : <Check size={14} />}
                </button>
                <button type="button" aria-label="Annuler" onClick={() => setRenaming(false)} className={ICON_BTN}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-agon-xs">
                <div className="truncate font-display text-agon-xl font-extrabold">{title}</div>
                {canRename && (
                  <button
                    type="button"
                    title="Renommer"
                    aria-label="Renommer"
                    onClick={() => { setRenameDraft(title); setRenaming(true); setDeleteConfirm(false); }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-agon-tx3 hover:text-agon-tx"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}
            <div className="text-agon-xs text-agon-tx3">{subtitle}</div>
          </div>

          <div className="flex shrink-0 items-center gap-agon-xs">
            {canDelete && !renaming && (
              <button
                type="button"
                title="Supprimer"
                aria-label="Supprimer"
                onClick={() => { setDeleteConfirm((v) => !v); setRenaming(false); }}
                className={cn(ICON_BTN, deleteConfirm && "border-agon-erreur/60 text-agon-erreur")}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button type="button" aria-label="Fermer" onClick={onClose} className={ICON_BTN}>
              <X size={16} />
            </button>
          </div>
        </header>

        {deleteConfirm && (
          <div className="flex flex-wrap items-center gap-agon-sm border-b border-agon-erreur/30 bg-agon-erreur-doux px-agon-lg py-agon-sm md:px-5">
            <span className="min-w-0 flex-1 text-agon-sm text-agon-tx2">Supprimer ce bloc et tous ses sous-blocs ?</span>
            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(false)}>Annuler</Button>
            <Button size="sm" disabled={working} className="bg-agon-erreur-vif text-agon-ink" onClick={() => void handleDelete()}>
              {working ? "…" : "Supprimer"}
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-agon-lg [scrollbar-width:none] md:p-5">{content}</div>
      </aside>
    </>
  );
}
