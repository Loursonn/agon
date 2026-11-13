import { Check, Timer } from "lucide-react";
import type { ClassiqueBlock, WodBlock } from "@/types/specific";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";

const HYROX = TYPE_COLOR.hyrox;

function CheckBox({ on, size = 24 }: { on: boolean; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
      background: on ? C.g : "transparent", border: on ? "none" : `1.5px solid ${alpha(C.tx, 0.3)}`,
    }}>
      {on && <Check size={size * 0.6} color={C.bg} strokeWidth={2.5} />}
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
    <div style={{
      marginBottom: 10, breakInside: "avoid", borderRadius: 14, background: C.s1,
      border: `1px solid ${allDone ? alpha(C.g, 0.35) : done > 0 ? alpha(HYROX, 0.45) : C.brd}`, overflow: "hidden",
    }}>
      <button
        type="button"
        aria-label={allDone ? `${title} : tout décocher` : `${title} : tout cocher`}
        onClick={() => onToggleAll(block.items.map((it) => it.id), !allDone)}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 14px", background: "transparent", border: "none", color: C.tx, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
      >
        <CheckBox on={allDone} />
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: allDone ? C.tx2 : C.tx }}>{title}</span>
        <span style={{ ...MONO, fontSize: 12.5, color: allDone ? C.g : done > 0 ? HYROX : C.tx3 }}>{done} / {block.items.length}</span>
      </button>
      {!allDone && (
        <div style={{ padding: "0 14px 10px" }}>
          {block.instructions && (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: C.tx2, lineHeight: 1.45, padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: C.bg, borderLeft: `2px solid ${HYROX}` }}>
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
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 48, padding: "8px 0", borderTop: `1px solid ${C.brd}`, borderLeft: "none", borderRight: "none", borderBottom: "none", background: "transparent", color: C.tx, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
              >
                <CheckBox on={on} size={22} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, color: on ? C.tx3 : C.tx, textDecoration: on ? "line-through" : "none" }}>{item.name}</span>
                  {item.notes && <span style={{ display: "block", fontSize: 11.5, color: C.tx3, marginTop: 2, whiteSpace: "pre-wrap" }}>{item.notes}</span>}
                </span>
                {item.prescription && (
                  <span style={{ ...MONO, maxWidth: "55%", whiteSpace: "pre-wrap", textAlign: "right", fontSize: 12.5, color: on ? C.tx3 : C.tx2 }}>{item.prescription}</span>
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
    <div style={{ marginBottom: 10, breakInside: "avoid", borderRadius: 14, background: C.s1, border: `1px dashed ${alpha(HYROX, done ? 0.25 : 0.55)}`, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <CheckBox on={done} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 500, color: done ? C.tx2 : C.tx }}>{title}</span>
        {block.instructions && !done && <span style={{ display: "block", fontSize: 12, color: C.tx3, marginTop: 2, whiteSpace: "pre-wrap" }}>{block.instructions}</span>}
      </span>
      <button type="button" onClick={onTimer} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 999, border: "none", background: done ? alpha(HYROX, 0.16) : HYROX, color: done ? HYROX : C.bg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flex: "none" }}>
        <Timer size={15} strokeWidth={2} /> {done ? "Relancer" : "Minuteur"}
      </button>
    </div>
  );
}
