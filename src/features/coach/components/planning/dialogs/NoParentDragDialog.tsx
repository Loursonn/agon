import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateCycles, createMesocycle, setCycleDates } from "@/api/cycles";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Input } from "@/ui/Input";
import type { Macrocycle, Mesocycle } from "../hooks/useTimelineData";
import type { NoParentDragState } from "../utils/timelineLevels";

interface Props {
  state: NoParentDragState;
  macrocycles: Macrocycle[];
  mesocycles: Mesocycle[];
  athleteId: string;
  onClose: () => void;
}

/** Un cycle est déposé là où aucun mésocycle n'existe : rattacher à un méso existant ou en créer un. */
export function NoParentDragDialog({ state, macrocycles, mesocycles, athleteId, onClose }: Props) {
  const qc = useQueryClient();
  const [mesoName, setMesoName] = useState(() => format(parseISO(state.newStart), "MMMM yyyy", { locale: fr }));
  const [saving, setSaving] = useState(false);

  // Méso existant dont les dates contiennent le nouveau début (réaffectation sans création).
  const overlappingMeso = mesocycles.find((m) => state.newStart >= m.start_date && state.newStart <= m.end_date);
  // Macro qui contient le nouveau début.
  const targetMacro = macrocycles.find((m) => state.newStart >= m.start_date && state.newStart <= m.end_date);

  async function handleCreateAndMove() {
    if (!mesoName.trim()) { toast.error("Nom requis"); return; }
    if (!targetMacro) { toast.error("Crée d'abord un macrocycle pour cette période"); return; }
    setSaving(true);

    let newMesoId: string;
    try {
      newMesoId = (await createMesocycle({
        macrocycleId: targetMacro.id, name: mesoName.trim(), start: state.newStart, end: state.newEnd,
      })).id;
    } catch {
      toast.error("Erreur création mésocycle"); setSaving(false); return;
    }

    try {
      // Dates + rattachement + semaines régénérées en une écriture (séances gardées).
      await setCycleDates({
        cycleId: state.cycleId, start: state.newStart, end: state.newEnd,
        mesocycleId: newMesoId, dropPlanned: false,
      });
    } catch {
      toast.error("Erreur mise à jour cycle"); setSaving(false); return;
    }

    void invalidateCycles(qc, athleteId);
    toast.success("Mésocycle créé — cycle déplacé");
    setSaving(false);
    onClose();
  }

  async function handleMoveToExisting() {
    if (!overlappingMeso) return;
    setSaving(true);
    try {
      await setCycleDates({
        cycleId: state.cycleId, start: state.newStart, end: state.newEnd,
        mesocycleId: overlappingMeso.id, dropPlanned: false,
      });
    } catch {
      toast.error("Erreur mise à jour cycle"); setSaving(false); return;
    }
    void invalidateCycles(qc, athleteId);
    toast.success("Cycle déplacé");
    setSaving(false);
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={<><span className="block text-agon-xs font-bold uppercase tracking-wide text-agon-coach">Aucun mésocycle ici</span>Que faire ?</>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          {overlappingMeso && (
            <Button disabled={saving} onClick={() => void handleMoveToExisting()}>{saving ? "…" : "Déplacer"}</Button>
          )}
          {targetMacro && !overlappingMeso && (
            <Button disabled={saving} onClick={() => void handleCreateAndMove()}>{saving ? "…" : "Créer et déplacer"}</Button>
          )}
        </>
      }
    >
      <p className="mb-agon-lg text-agon-base text-agon-tx2">
        Nouvelle position :{" "}
        <b className="text-agon-tx">
          {format(parseISO(state.newStart), "d MMM", { locale: fr })} → {format(parseISO(state.newEnd), "d MMM yyyy", { locale: fr })}
        </b>
      </p>

      {overlappingMeso ? (
        <div className="rounded-md bg-agon-s2 p-agon-md text-agon-base text-agon-tx2">
          Mésocycle existant trouvé : <b className="text-agon-coach">{overlappingMeso.name}</b>
          <br />Le cycle sera rattaché à ce mésocycle.
        </div>
      ) : targetMacro ? (
        <div>
          <label htmlFor="meso-name" className="mb-agon-xs block text-agon-xs text-agon-tx3">Nom du nouveau mésocycle</label>
          <Input
            id="meso-name"
            autoFocus
            value={mesoName}
            onChange={(e) => setMesoName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleCreateAndMove()}
          />
          <div className="mt-agon-xs text-agon-xs text-agon-tx3">
            Parent macrocycle : <b>{targetMacro.name}</b>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-agon-alerte-doux p-agon-md text-agon-base text-agon-alerte">
          Aucun macrocycle pour cette période. Crée d'abord un macrocycle puis déplace à nouveau ce cycle.
        </div>
      )}
    </Dialog>
  );
}
