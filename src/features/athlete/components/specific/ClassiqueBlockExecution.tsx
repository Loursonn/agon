import { Check, Timer } from "lucide-react";
import type { ClassiqueBlock, WodBlock } from "@/types/specific";
import { cn } from "@/lib/utils";

function CheckBox({ on, size = 24 }: { on: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-full",
        on ? "border-none bg-agon-succes" : "border-[1.5px] border-agon-tx/[0.3] bg-transparent",
      )}
      style={{ width: size, height: size }}
    >
      {on && <Check size={size * 0.6} className="text-agon-ink" strokeWidth={2.5} />}
    </span>
  );
}

interface Props {
  block: ClassiqueBlock;
  /** « Bloc 2 · … » */
  number: number;
  blockLogs: Record<string, boolean>;
  onToggle: (itemId: string) => void;
  /** Coche (ou décoche) tout le bloc d'un coup. */
  onToggleAll: (itemIds: string[], done: boolean) => void;
}

/**
 * Bloc « classique » en cours de séance (planche Ath2SeanceSpecifique, 03) :
 * éléments à cocher un par un, ou tout le bloc d'un coup depuis l'en-tête.
 * Un bloc fini se replie sur son titre.
 */
export function ClassiqueBlockExecution({ block, number, blockLogs, onToggle, onToggleAll }: Props) {
  const done = block.items.filter((it) => blockLogs[it.id]).length;
  const allDone = block.items.length > 0 && done === block.items.length;
  const title = `Bloc ${number}${block.title ? ` · ${block.title}` : ""}`;
  return (
    <div
      className={cn(
        "mb-2.5 break-inside-avoid overflow-hidden rounded-[14px] border bg-agon-s1",
        allDone ? "border-agon-succes/[0.35]" : done > 0 ? "border-agon-type-hyrox/[0.45]" : "border-agon-brd",
      )}
    >
      <button
        type="button"
        aria-label={allDone ? `${title} : tout décocher` : `${title} : tout cocher`}
        onClick={() => onToggleAll(block.items.map((it) => it.id), !allDone)}
        className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-3.5 text-left text-agon-tx"
      >
        <CheckBox on={allDone} />
        <span className={cn("flex-1 text-[14.5px] font-medium", allDone ? "text-agon-tx2" : "text-agon-tx")}>{title}</span>
        <span className={cn("agon-mono text-[12.5px]", allDone ? "text-agon-succes" : done > 0 ? "text-agon-type-hyrox" : "text-agon-tx3")}>
          {done} / {block.items.length}
        </span>
      </button>
      {!allDone && (
        <div className="px-3.5 pb-2.5">
          {block.instructions && (
            <div className="mb-1.5 whitespace-pre-wrap rounded-[10px] border-l-2 border-agon-type-hyrox bg-agon-bg px-2.5 py-2 text-[12.5px] leading-[1.45] text-agon-tx2">
              {block.instructions}
            </div>
          )}
          {block.items.map((item) => {
            const on = !!blockLogs[item.id];
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(item.id)}
                className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 border-x-0 border-b-0 border-t border-agon-brd bg-transparent py-2 text-left text-agon-tx"
              >
                <CheckBox on={on} size={22} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14px]", on ? "text-agon-tx3 line-through" : "text-agon-tx no-underline")}>{item.name}</span>
                  {item.notes && <span className="mt-0.5 block whitespace-pre-wrap text-[11.5px] text-agon-tx3">{item.notes}</span>}
                </span>
                {item.prescription && (
                  <span className={cn("agon-mono max-w-[55%] whitespace-pre-wrap text-right text-[12.5px]", on ? "text-agon-tx3" : "text-agon-tx2")}>
                    {item.prescription}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bloc WOD dans le format classique : son minuteur se lance d'ici. */
export function WodBlockExecution({ block, number, done, onTimer }: { block: WodBlock; number: number; done: boolean; onTimer: () => void }) {
  const title = `Bloc ${number}${block.title ? ` · ${block.title}` : ""}`;
  return (
    <div
      className={cn(
        "mb-2.5 flex break-inside-avoid items-center gap-3 rounded-[14px] border border-dashed bg-agon-s1 p-3.5",
        done ? "border-agon-type-hyrox/[0.25]" : "border-agon-type-hyrox/[0.55]",
      )}
    >
      <CheckBox on={done} />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14.5px] font-medium", done ? "text-agon-tx2" : "text-agon-tx")}>{title}</span>
        {block.instructions && !done && <span className="mt-0.5 block whitespace-pre-wrap text-[12px] text-agon-tx3">{block.instructions}</span>}
      </span>
      <button
        type="button"
        onClick={onTimer}
        className={cn(
          "flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-full border-none px-3.5 text-[13px] font-semibold",
          done ? "bg-agon-type-hyrox/[0.16] text-agon-type-hyrox" : "bg-agon-type-hyrox text-agon-ink",
        )}
      >
        <Timer size={15} strokeWidth={2} /> {done ? "Relancer" : "Minuteur"}
      </button>
    </div>
  );
}
