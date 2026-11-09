import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Input } from "@/ui/Input";
import { DOW } from "./weekDays";

interface Props {
  onAdd: (name: string, short: string, dayOfWeek: number | undefined, recurrence: "weekly" | "once") => void;
  onClose: () => void;
}

const LABEL = "mb-agon-xs block text-agon-xs text-agon-tx3";
const CHOICE = "min-h-10 rounded-md border text-agon-sm font-bold transition-colors";
const CHOICE_ON = "border-agon-coach bg-agon-coach-doux text-agon-coach";
const CHOICE_OFF = "border-agon-brd-l bg-transparent text-agon-tx2";

/** Nouvelle séance de musculation : nom, abréviation, récurrence et jour. */
export function AddMuscuSessionDialog({ onAdd, onClose }: Props) {
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [recurrence, setRecurrence] = useState<"weekly" | "once">("weekly");
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);

  function handleSubmit() {
    if (!name.trim()) { toast.error("Nom requis"); return; }
    const day = recurrence === "weekly" ? selectedDay : undefined;
    onAdd(name.trim(), short.trim() || name.trim().slice(0, 3).toUpperCase(), day, recurrence);
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Nouvelle séance"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit}>Créer</Button>
        </>
      }
    >
      <div className="flex flex-col gap-agon-lg">
        <div>
          <label className={LABEL} htmlFor="muscu-name">Nom complet</label>
          <Input
            id="muscu-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="ex. Haut du corps A, Jambes…"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="muscu-short">Abréviation <span className="font-normal">(optionnel)</span></label>
          <Input
            id="muscu-short"
            value={short}
            onChange={(e) => setShort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="ex. HCA, JAM…"
            maxLength={6}
            className="uppercase"
          />
        </div>
        <div>
          <div className={LABEL}>Type de séance</div>
          <div className="grid grid-cols-2 gap-agon-xs">
            {(["weekly", "once"] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRecurrence(r)} className={cn(CHOICE, recurrence === r ? CHOICE_ON : CHOICE_OFF)}>
                {r === "weekly" ? "Récurrente" : "Ponctuelle"}
              </button>
            ))}
          </div>
        </div>
        {recurrence === "weekly" && (
          <div>
            <div className={LABEL}>Jour de la semaine <span className="font-normal">(optionnel)</span></div>
            <div className="grid grid-cols-7 gap-agon-xs">
              {DOW.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedDay(selectedDay === idx ? undefined : idx)}
                  className={cn(CHOICE, "px-0", selectedDay === idx ? CHOICE_ON : CHOICE_OFF)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
