import { useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PERIOD_DEFAULTS } from "@/types/planning";
import { createCycle, createMacrocycle, createMesocycle, createMicrocycle, invalidateCycles } from "@/api/cycles";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Input } from "@/ui/Input";
import { cn } from "@/lib/utils";
import { snapMonday, snapSunday, chainNextStart, endFromWeeks } from "../utils/planningHelpers";
import { LEVEL_LABEL, LEVEL_STYLE, type CreateState, type SnapConflict } from "../utils/timelineLevels";

interface SnapPrompt {
  conflict: SnapConflict;
  snapAfterStart: string;
  snapAfterEnd: string;
  snapBeforeEnd: string | null;
  movingStart: string;
  onCascadeShift?: () => Promise<void>;
}

interface Props {
  state: CreateState;
  athleteId: string;
  coachId: string;
  rangeStart: string;
  onClose: () => void;
}

const LABEL = "mb-agon-xs block text-agon-xs text-agon-tx3";
const DURATION_STEPS = [-4, -1, 1, 4, 13, 26, 52] as const;

/** Création d'une période (macro, méso, cycle, micro) : nom, parent, dates calées sur lundi / dimanche. */
export function CreatePeriodDialog({ state, athleteId, coachId, rangeStart, onClose }: Props) {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [weekNum, setWeekNum] = useState(1);
  const [isDeload, setIsDeload] = useState(false);
  const [startDate, setStartDate] = useState(() => (state.defaultStart ? snapMonday(state.defaultStart) : state.defaultStart));
  const [endDate, setEndDate] = useState(() => (state.defaultEnd ? snapSunday(state.defaultEnd) : state.defaultEnd));
  const [saving, setSaving] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState(state.parentId ?? state.parentOptions?.[0]?.id ?? "");
  const [snapPrompt, setSnapPrompt] = useState<SnapPrompt | null>(null);

  const defaultWeeks = PERIOD_DEFAULTS[state.level as keyof typeof PERIOD_DEFAULTS] ?? 4;
  const style = LEVEL_STYLE[state.level];

  function handleParentChange(newParentId: string) {
    setSelectedParentId(newParentId);
    if (!state.siblingItems) return;
    const siblings = state.siblingItems
      .filter((s) => s.parentId === newParentId)
      .sort((a, b) => b.end_date.localeCompare(a.end_date));
    const last = siblings[0];
    if (last) {
      const autoStart = chainNextStart(last.end_date);
      setStartDate(autoStart);
      setEndDate(endFromWeeks(autoStart, defaultWeeks));
    } else {
      const opt = state.parentOptions?.find((o) => o.id === newParentId);
      const fallback = opt ? snapMonday(opt.start_date) : rangeStart;
      setStartDate(fallback);
      setEndDate(endFromWeeks(fallback, defaultWeeks));
    }
  }

  /** Ajoute ou retire des semaines à la fin, depuis le début courant. */
  function shiftEnd(weeks: number) {
    if (!startDate) return;
    const current = endDate ? endDate : startDate;
    const diffWeeks = Math.max(
      1,
      Math.round((new Date(current).getTime() - new Date(startDate).getTime()) / (7 * 86400_000)) + 1 + weeks,
    );
    setEndDate(endFromWeeks(startDate, diffWeeks));
  }

  async function handleSubmit(opts?: { start: string; end: string }) {
    const sDate = opts?.start ?? startDate;
    const eDate = opts?.end ?? endDate;

    if (!sDate || !eDate) { toast.error("Dates requises"); return; }
    if (state.level !== "microcycle" && !name.trim()) { toast.error("Nom requis"); return; }
    if ((state.level === "mesocycle" || state.level === "cycle" || state.level === "microcycle") && !selectedParentId) {
      toast.error("Sélectionne un parent"); return;
    }
    // Garde dure : le début doit rester ≥ minStart (pas de chevauchement avec le frère précédent).
    if (state.minStart && sDate < state.minStart) {
      toast.error(`Début doit être ≥ ${state.minStart} (pas de chevauchement)`);
      return;
    }

    // Chevauchement côté client (ignoré quand on repasse avec des dates déjà calées).
    if (!opts && state.existingSiblings) {
      const sameParent = state.level === "macrocycle"
        ? state.existingSiblings
        : state.existingSiblings.filter((s) => s.parentId === selectedParentId);
      const conflicts = sameParent.filter((s) => s.start_date <= eDate && s.end_date >= sDate);
      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        const originalWeeks = Math.max(
          1,
          Math.round((parseISO(eDate).getTime() - parseISO(sDate).getTime()) / (7 * 86400_000)) + 1,
        );
        const afterStart = chainNextStart(conflict.end_date);
        const afterEnd = endFromWeeks(afterStart, originalWeeks);
        const beforeEnd = format(addDays(parseISO(conflict.start_date), -1), "yyyy-MM-dd");
        const capturedParentId = selectedParentId;
        setSnapPrompt({
          conflict: { name: conflict.name, start_date: conflict.start_date, end_date: conflict.end_date },
          snapAfterStart: afterStart,
          snapAfterEnd: afterEnd,
          snapBeforeEnd: beforeEnd >= sDate ? beforeEnd : null,
          movingStart: sDate,
          onCascadeShift: state.cascadeShiftFn
            ? async () => {
                await state.cascadeShiftFn!(conflict.start_date, capturedParentId);
                setSnapPrompt(null);
                await handleSubmit({ start: sDate, end: eDate });
              }
            : undefined,
        });
        return;
      }
    }

    setSaving(true);
    try {
      switch (state.level) {
        case "macrocycle":
          await createMacrocycle({ athleteId, coachId, name: name.trim(), start: sDate, end: eDate });
          break;
        case "mesocycle":
          await createMesocycle({ macrocycleId: selectedParentId, name: name.trim(), start: sDate, end: eDate });
          break;
        case "cycle":
          // Cycle + une semaine par semaine ISO, en une écriture.
          await createCycle({ athleteId, mesocycleId: selectedParentId, name: name.trim(), start: sDate, end: eDate });
          break;
        case "microcycle":
          await createMicrocycle({ cycleId: selectedParentId, weekNumber: weekNum, start: sDate, end: eDate, isDeload });
          break;
      }
    } catch {
      setSaving(false);
      toast.error("Erreur lors de la création");
      return;
    }
    setSaving(false);
    void invalidateCycles(qc, athleteId);
    toast.success(`${LEVEL_LABEL[state.level]} créé`);
    onClose();
  }

  const parentLabel = state.level === "mesocycle" ? "Macrocycle parent" : state.level === "cycle" ? "Mésocycle parent" : "Parent";

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={<><span className={cn("block text-agon-xs font-bold uppercase tracking-wide", style.text)}>Nouveau</span>{LEVEL_LABEL[state.level]}</>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>{saving ? "…" : "Créer"}</Button>
        </>
      }
    >
      {snapPrompt && (
        <div className="mb-agon-lg rounded-md border border-agon-alerte/50 bg-agon-alerte-doux p-agon-md">
          <div className="mb-agon-xs text-agon-sm font-bold text-agon-alerte">Chevauche « {snapPrompt.conflict.name} »</div>
          <div className="mb-agon-md text-agon-xs text-agon-tx3">
            {snapPrompt.conflict.start_date} → {snapPrompt.conflict.end_date}
          </div>
          <div className="flex flex-wrap gap-agon-sm">
            <Button
              size="sm"
              className="h-auto min-h-8 whitespace-normal bg-agon-alerte-vif py-agon-xs text-agon-ink"
              onClick={() => { setSnapPrompt(null); void handleSubmit({ start: snapPrompt.snapAfterStart, end: snapPrompt.snapAfterEnd }); }}
            >
              Coller après ({snapPrompt.snapAfterStart})
            </Button>
            {snapPrompt.snapBeforeEnd && (
              <Button
                size="sm"
                variant="secondary"
                className="h-auto min-h-8 whitespace-normal py-agon-xs"
                onClick={() => { setSnapPrompt(null); void handleSubmit({ start: snapPrompt.movingStart, end: snapPrompt.snapBeforeEnd! }); }}
              >
                Coller avant (→ {snapPrompt.snapBeforeEnd})
              </Button>
            )}
            {snapPrompt.onCascadeShift && (
              <Button size="sm" variant="secondary" className="h-auto min-h-8 whitespace-normal py-agon-xs" onClick={() => void snapPrompt.onCascadeShift!()}>
                Décaler « {snapPrompt.conflict.name} » +1 sem.
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-auto min-h-8 whitespace-normal py-agon-xs" onClick={() => setSnapPrompt(null)}>
              Modifier manuellement
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-agon-md">
        {state.parentOptions && state.parentOptions.length > 0 && (
          <div>
            <label className={LABEL} htmlFor="period-parent">{parentLabel}</label>
            <select
              id="period-parent"
              value={selectedParentId}
              onChange={(e) => handleParentChange(e.target.value)}
              className="h-10 w-full rounded-md border border-agon-brd-l bg-agon-s2 px-agon-md font-ui text-agon-lg text-agon-tx md:text-agon-base"
            >
              {state.parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {state.level === "microcycle" ? (
          <div className="flex flex-wrap items-center gap-agon-sm">
            <label className="shrink-0 text-agon-xs text-agon-tx3" htmlFor="period-week">Semaine n°</label>
            <Input
              id="period-week"
              type="number" min={1} max={52}
              value={weekNum}
              onChange={(e) => setWeekNum(parseInt(e.target.value) || 1)}
              className="w-20"
            />
            <label className="flex cursor-pointer items-center gap-agon-xs text-agon-xs text-agon-tx3">
              <input type="checkbox" checked={isDeload} onChange={(e) => setIsDeload(e.target.checked)} className="accent-agon-info" />
              Deload
            </label>
          </div>
        ) : (
          <div>
            <label className={LABEL} htmlFor="period-name">Nom</label>
            <Input
              id="period-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              placeholder={`Nom du ${LEVEL_LABEL[state.level].toLowerCase()}…`}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-agon-md min-[420px]:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="period-start">
              Début <span className="opacity-60">(snap lundi)</span>
            </label>
            <Input
              id="period-start"
              type="date" value={startDate}
              min={state.minStart}
              onChange={(e) => {
                if (!e.target.value) return;
                const snapped = snapMonday(e.target.value);
                setStartDate(state.minStart && snapped < state.minStart ? state.minStart : snapped);
              }}
            />
            {state.minStart && (
              <div className="mt-agon-2xs text-agon-xs text-agon-tx3">≥ {state.minStart} (pas de chevauchement)</div>
            )}
          </div>
          <div>
            <label className={LABEL} htmlFor="period-end">
              Fin <span className="opacity-60">(snap dimanche)</span>
            </label>
            <Input
              id="period-end"
              type="date" value={endDate}
              onChange={(e) => { if (e.target.value) setEndDate(snapSunday(e.target.value)); }}
            />
          </div>
        </div>

        <div>
          <div className={LABEL}>Ajuster la durée</div>
          <div className="flex flex-wrap gap-agon-xs">
            {DURATION_STEPS.map((w) => (
              <Button key={w} size="sm" variant="secondary" className="min-w-11 px-agon-sm" onClick={() => shiftEnd(w)}>
                {w > 0 ? "+" : ""}{w}s
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
