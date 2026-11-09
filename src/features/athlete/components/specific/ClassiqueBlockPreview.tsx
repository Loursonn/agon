import type { ClassiqueBlock } from "@/types/specific";

/** Bloc « classique » d'une séance spécifique, en lecture (avant le départ). */
export function ClassiqueBlockPreview({ block }: { block: ClassiqueBlock }) {
  return (
    <div className="mb-agon-md break-inside-avoid rounded-md border border-l-4 border-agon-brd border-l-agon-succes bg-agon-bg px-agon-md py-agon-md">
      <div className="mb-agon-sm text-agon-xs font-bold uppercase tracking-wide text-agon-succes">
        {block.title || "Bloc classique"}
      </div>
      {block.instructions && (
        <div className="mb-agon-sm whitespace-pre-wrap text-agon-sm leading-snug text-agon-tx2">{block.instructions}</div>
      )}
      {block.items.map((item) => (
        <div key={item.id} className="flex items-baseline gap-agon-sm border-b border-agon-brd py-agon-xs">
          <span className="min-w-0 flex-1 text-agon-base font-semibold text-agon-tx">{item.name}</span>
          {item.prescription && (
            <span className="max-w-[55%] whitespace-pre-wrap text-right text-agon-sm text-agon-tx2">{item.prescription}</span>
          )}
        </div>
      ))}
      {block.items.length > 0 && block.items[block.items.length - 1].rest && (
        <div className="mt-agon-xs text-agon-xs text-agon-tx2">Repos : {block.items[block.items.length - 1].rest}</div>
      )}
    </div>
  );
}
