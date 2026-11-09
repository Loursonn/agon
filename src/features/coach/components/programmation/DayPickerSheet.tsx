import { cn } from "@/lib/utils";
import { Dialog } from "@/ui/Dialog";
import { DOW } from "./weekDays";

interface Props {
  sessionName: string;
  currentDay: number;
  onPick: (dayIndex: number) => void;
  onClose: () => void;
}

/** Choix du jour d'une séance : reprogramme toutes les séances à partir d'aujourd'hui. */
export function DayPickerSheet({ sessionName, currentDay, onPick, onClose }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={sessionName}
      description="Choisir le jour — reprogramme toutes les séances à partir d'aujourd'hui"
    >
      <div className="grid grid-cols-7 gap-agon-xs">
        {DOW.map((label, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(idx)}
            className={cn(
              "min-h-11 rounded-md border px-0 text-agon-sm font-bold",
              currentDay === idx ? "border-agon-coach bg-agon-coach-doux text-agon-coach" : "border-agon-brd-l text-agon-tx2",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
