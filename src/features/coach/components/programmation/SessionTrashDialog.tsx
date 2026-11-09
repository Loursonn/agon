import { Trash2 } from "lucide-react";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import type { Session } from "@/features/shared/types/athlete";
import { DOW } from "./weekDays";

interface Props {
  sessions: Session[];
  onRestore: (sessionId: string) => void;
  onDeleteForever: (sessionId: string) => void;
  onClose: () => void;
}

/** Corbeille des séances supprimées pendant la session : restaurer ou supprimer pour de bon. */
export function SessionTrashDialog({ sessions, onRestore, onDeleteForever, onClose }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={
        <span className="flex items-center gap-agon-sm">
          <Trash2 size={16} className="text-agon-erreur" />
          Corbeille
          <span className="text-agon-xs font-normal text-agon-tx3">({sessions.length} séance{sessions.length !== 1 ? "s" : ""})</span>
        </span>
      }
    >
      {sessions.length === 0 ? (
        <div className="py-agon-xl text-center text-agon-base text-agon-tx3">Corbeille vide</div>
      ) : (
        <ul className="flex flex-col gap-agon-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-agon-md rounded-md border border-agon-brd-l bg-agon-s1 px-agon-md py-agon-md">
              <div className="min-w-0 flex-1">
                <div className="truncate text-agon-base font-bold">{s.name || s.short || "Séance"}</div>
                {s.day_of_week != null && <div className="text-agon-xs text-agon-tx3">{DOW[s.day_of_week]}</div>}
              </div>
              <Button size="sm" variant="secondary" className="border-agon-coach text-agon-coach hover:text-agon-coach" onClick={() => onRestore(s.id)}>
                Restaurer
              </Button>
              <Button size="icon" variant="danger" className="h-8 w-8" title="Supprimer définitivement" aria-label="Supprimer définitivement" onClick={() => onDeleteForever(s.id)}>
                <Trash2 size={12} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
