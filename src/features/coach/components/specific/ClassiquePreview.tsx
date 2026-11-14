/**
 * ClassiquePreview — aperçu lecture seule d'une séance par blocs (mix Classique / WOD).
 */
import { Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import SessionPreview from "../energy/SessionPreview";
import type { EnergyGroup } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";

/** Teinte par type de bloc : WOD (miel hérité → alerte) ou classique (succès). */
const TONE = {
  wod:       { head: "bg-agon-alerte/[0.051]", text: "text-agon-alerte", badge: "bg-agon-alerte/[0.125] text-agon-alerte" },
  classique: { head: "bg-agon-succes/[0.051]", text: "text-agon-succes", badge: "bg-agon-succes/[0.125] text-agon-succes" },
} as const;

function hasContent(b: SessionBlock): boolean {
  if (isWodBlock(b)) return b.title.trim().length > 0 || b.steps.length > 0;
  return b.title.trim().length > 0 || b.items.some((i) => i.name.trim());
}

export default function ClassiquePreview({ blocks }: { blocks: SessionBlock[] }) {
  const realBlocks = blocks.filter(hasContent);

  if (realBlocks.length === 0) {
    return (
      <div className="pt-10 text-center text-[12px] text-agon-tx3">
        Ajoute des blocs pour voir l'aperçu
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {realBlocks.map((block, idx) => {
        const wod = isWodBlock(block);
        const tone = wod ? TONE.wod : TONE.classique;
        return (
          <div key={block.id} className="overflow-hidden rounded border border-agon-brd bg-agon-s1">
            <div className={cn("flex items-center gap-2 border-b border-agon-brd px-3 py-2", tone.head)}>
              <span className={cn("text-[10px] font-extrabold", tone.text)}>{idx + 1}</span>
              <span className="min-w-0 text-[12px] font-bold text-agon-tx [overflow-wrap:anywhere]">{block.title || "Bloc"}</span>
              <span className={cn("rounded px-1.5 py-px text-[8px] font-extrabold", tone.badge)}>
                {wod ? "WOD" : "CLASSIQUE"}
              </span>
              {!wod && (
                <span className="ml-auto text-[10px] text-agon-tx3">
                  {(block as ClassiqueBlock).items.filter((i) => i.name.trim()).length} exo{(block as ClassiqueBlock).items.filter((i) => i.name.trim()).length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {block.instructions && (
              <div className="whitespace-pre-wrap px-3 pt-1.5 text-[11px] leading-[1.4] text-agon-tx2">
                {block.instructions}
              </div>
            )}

            {wod ? (
              <div className="px-2.5 py-2">
                {(block as WodBlock).steps.length > 0 ? (
                  <SessionPreview
                    intervals={{
                      type: "group", id: `__pv_${block.id}__`, role: "open", repeat: 1,
                      children: (block as WodBlock).steps,
                    } as EnergyGroup}
                    compact
                  />
                ) : (
                  <span className="text-[11px] text-agon-tx3">Aucun intervalle</span>
                )}
              </div>
            ) : (
              <div className="px-3 pb-2 pt-1.5">
                {(block as ClassiqueBlock).items.filter((i) => i.name.trim()).map((item) => (
                  // Pas de filet : l'ancien style (couleur rgba + « 30 ») était invalide, donc jamais affiché.
                  <div key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
                    <span className="min-w-0 flex-[1_1_120px] text-[11px] leading-[1.4] text-agon-tx [overflow-wrap:anywhere]">
                      {item.name}
                      {item.youtube_id && <Youtube size={11} className="ml-[5px] align-middle text-agon-erreur" />}
                    </span>
                    {item.prescription && (
                      <span className="min-w-0 max-w-full whitespace-pre-wrap text-[11px] font-bold leading-[1.4] text-agon-succes [overflow-wrap:anywhere]">{item.prescription}</span>
                    )}
                    {item.rest && (
                      <span className="shrink-0 text-[10px] text-agon-tx3">R : {item.rest}</span>
                    )}
                    {item.notes && (
                      <div className="basis-full whitespace-pre-wrap text-[10px] leading-[1.4] text-agon-tx3 [overflow-wrap:anywhere]">
                        {item.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
