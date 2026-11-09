import { cn } from "@/lib/utils";
import type { ClassiqueBlock } from "@/types/specific";

interface Props {
  block: ClassiqueBlock;
  blockLogs: Record<string, boolean>;
  onToggle: (itemId: string) => void;
}

/** Bloc « classique » en cours de séance : une case à cocher par élément. */
export function ClassiqueBlockExecution({ block, blockLogs, onToggle }: Props) {
  const allDone = block.items.every((item) => blockLogs[item.id]);
  return (
    <div
      className={cn(
        "mb-agon-md break-inside-avoid rounded-md border border-l-4 border-agon-brd bg-agon-bg px-agon-md py-agon-md transition-opacity duration-200",
        allDone ? "border-l-agon-succes opacity-70" : "border-l-agon-tx2",
      )}
    >
      <div className={cn("mb-agon-sm text-agon-xs font-bold uppercase tracking-wide", allDone ? "text-agon-succes" : "text-agon-tx2")}>
        {block.title || "Bloc classique"}
        {allDone && " ✓"}
      </div>
      {block.instructions && (
        <div className="mb-agon-sm whitespace-pre-wrap text-agon-sm leading-snug text-agon-tx2">{block.instructions}</div>
      )}
      {block.items.map((item) => {
        const done = !!blockLogs[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={cn(
              "flex min-h-11 w-full items-center gap-agon-sm border-b border-agon-brd px-agon-xs py-agon-sm text-left",
              done && "opacity-50",
            )}
          >
            <span
              className={cn(
                "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 text-agon-sm text-agon-succes",
                done ? "border-agon-succes bg-agon-succes/10" : "border-agon-tx2 bg-transparent",
              )}
            >
              {done ? "✓" : ""}
            </span>
            <span className={cn("min-w-0 flex-1 text-agon-base font-semibold text-agon-tx", done && "line-through")}>{item.name}</span>
            {item.prescription && (
              <span className="max-w-[55%] whitespace-pre-wrap text-right text-agon-sm text-agon-tx2">{item.prescription}</span>
            )}
          </button>
        );
      })}
      {block.items.some((it) => it.notes) && (
        <div className="mt-agon-xs">
          {block.items.filter((it) => it.notes).map((it) => (
            <div key={it.id} className="whitespace-pre-wrap py-agon-2xs text-agon-xs text-agon-tx2">
              Note — {it.name} : {it.notes}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
