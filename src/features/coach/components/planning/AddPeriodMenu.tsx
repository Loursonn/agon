import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { CREATE_LEVELS, LEVEL_LABEL, LEVEL_STYLE, type CreateLevel } from "./utils/timelineLevels";

/** Bouton « Ajouter » de la frise : menu des quatre niveaux de période. */
export function AddPeriodMenu({ onSelect }: { onSelect: (level: CreateLevel) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button size="sm" className="gap-agon-xs" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus size={12} />
        Ajouter
        <ChevronDown size={10} className="opacity-80" />
      </Button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-30" />
          <div className="absolute left-0 top-[calc(100%+6px)] z-[31] min-w-40 rounded-md border border-agon-brd bg-agon-s1 p-agon-xs md:left-auto md:right-0">
            {CREATE_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => { setOpen(false); onSelect(level); }}
                className="flex min-h-10 w-full items-center gap-agon-sm rounded-md px-agon-md py-agon-sm text-left font-ui text-agon-sm font-semibold text-agon-tx hover:bg-agon-s2"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-sm", LEVEL_STYLE[level].solid)} />
                {LEVEL_LABEL[level]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
