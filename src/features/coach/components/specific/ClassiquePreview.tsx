/**
 * ClassiquePreview — aperçu lecture seule d'une séance par blocs (mix Classique / WOD).
 */
import { Youtube } from "lucide-react";
import { C } from "@/lib/theme";
import SessionPreview from "../energy/SessionPreview";
import type { EnergyGroup } from "@/types/energy";
import type { SessionBlock, ClassiqueBlock, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";

const ORANGE = "#F5A623";
const GREEN  = "#66F03C";

function hasContent(b: SessionBlock): boolean {
  if (isWodBlock(b)) return b.title.trim().length > 0 || b.steps.length > 0;
  return b.title.trim().length > 0 || b.items.some((i) => i.name.trim());
}

export default function ClassiquePreview({ blocks }: { blocks: SessionBlock[] }) {
  const realBlocks = blocks.filter(hasContent);

  if (realBlocks.length === 0) {
    return (
      <div style={{ color: C.tx3, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
        Ajoute des blocs pour voir l'aperçu
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {realBlocks.map((block, idx) => {
        const wod = isWodBlock(block);
        const accent = wod ? ORANGE : GREEN;
        return (
          <div key={block.id} style={{ background: C.s1, borderRadius: 4, border: `1px solid ${C.brd}`, overflow: "hidden" }}>
            <div style={{
              padding: "8px 12px", background: accent + "0D",
              borderBottom: `1px solid ${C.brd}`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: accent }}>{idx + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{block.title || "Bloc"}</span>
              <span style={{
                fontSize: 8, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
                background: accent + "20", color: accent,
              }}>
                {wod ? "WOD" : "CLASSIQUE"}
              </span>
              {!wod && (
                <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>
                  {(block as ClassiqueBlock).items.filter((i) => i.name.trim()).length} exo{(block as ClassiqueBlock).items.filter((i) => i.name.trim()).length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {block.instructions && (
              <div style={{ padding: "6px 12px 0", fontSize: 11, color: C.tx2, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                {block.instructions}
              </div>
            )}

            {wod ? (
              <div style={{ padding: "8px 10px" }}>
                {(block as WodBlock).steps.length > 0 ? (
                  <SessionPreview
                    intervals={{
                      type: "group", id: `__pv_${block.id}__`, role: "open", repeat: 1,
                      children: (block as WodBlock).steps,
                    } as EnergyGroup}
                    compact
                  />
                ) : (
                  <span style={{ fontSize: 11, color: C.tx3 }}>Aucun intervalle</span>
                )}
              </div>
            ) : (
              <div style={{ padding: "6px 12px 8px" }}>
                {(block as ClassiqueBlock).items.filter((i) => i.name.trim()).map((item) => (
                  <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderBottom: `1px solid ${C.brd}30` }}>
                    <span style={{ fontSize: 11, color: C.tx, flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {item.name}
                      {item.youtube_id && <Youtube size={11} color="#EF4444" style={{ flexShrink: 0 }} />}
                    </span>
                    {item.prescription && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, flexShrink: 0 }}>{item.prescription}</span>
                    )}
                    {item.rest && (
                      <span style={{ fontSize: 10, color: C.tx3, flexShrink: 0 }}>R : {item.rest}</span>
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
