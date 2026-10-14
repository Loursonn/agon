/**
 * ChildOverflowDialog — §2.b
 * Affiché quand une période enfant déborde de son parent.
 * Actions : confirmer multi-parent (FK reste, 2nd parent calculé),
 *           recadrer dans parent, annuler.
 */
import { X } from "lucide-react";
import { C } from "@/lib/theme";

interface Props {
  childName: string;
  parentName: string;
  /** Nom du parent alternatif potentiel (peut être undefined si aucun) */
  altParentName?: string;
  onConfirmMultiParent: () => void;
  onShrinkToParent: () => void;
  onCancel: () => void;
}

export function ChildOverflowDialog({
  childName, parentName, altParentName,
  onConfirmMultiParent, onShrinkToParent, onCancel,
}: Props) {
  const btnBase: React.CSSProperties = {
    width: "100%", padding: "11px 0", borderRadius: 4,
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", border: "none",
  };

  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 81,
        transform: "translate(-50%,-50%)",
        width: 420, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 22px",
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.95) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: C.o }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.o, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Débordement de parent
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>
              "{childName}" sort de "{parentName}"
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: C.tx2, marginBottom: 16, lineHeight: 1.5 }}>
          Cette période déborde des bornes de son parent{" "}
          <strong style={{ color: C.tx }}>{parentName}</strong>.
          {altParentName && (
            <> Voulez-vous la rattacher aussi à <strong style={{ color: C.o }}>{altParentName}</strong> ?</>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {altParentName && (
            <button
              onClick={onConfirmMultiParent}
              style={{ ...btnBase, background: C.oV, color: "#0E0C0A" }}
            >
              Confirmer — rattacher aussi à "{altParentName}"
            </button>
          )}
          <button
            onClick={onShrinkToParent}
            style={{ ...btnBase, background: "transparent", border: "1px solid " + C.brdL, color: C.tx2 }}
          >
            Recadrer dans "{parentName}"
          </button>
          <button
            onClick={onCancel}
            style={{ ...btnBase, background: "transparent", color: C.tx3, fontSize: 12 }}
          >
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}
