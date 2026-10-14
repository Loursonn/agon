/**
 * ChangeParentDialog — §4
 * Affiché quand le coach drag une période enfant vers un nouveau parent.
 * Actions : confirmer (FK + dates mises à jour en 1 transaction), annuler.
 */
import { X } from "lucide-react";
import { C } from "@/lib/theme";

interface Props {
  childName: string;
  currentParentName: string;
  newParentName: string;
  newStart: string;
  newEnd: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export function ChangeParentDialog({
  childName, currentParentName, newParentName,
  newStart, newEnd, onConfirm, onCancel, saving,
}: Props) {
  const btnBase: React.CSSProperties = {
    padding: "10px 16px", borderRadius: 4,
    fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
    fontFamily: "inherit", opacity: saving ? 0.7 : 1,
  };

  return (
    <>
      <div onClick={!saving ? onCancel : undefined} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 81,
        transform: "translate(-50%,-50%)",
        width: 400, maxWidth: "92vw",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        padding: "20px 22px",
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.95) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: C.coach }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.coach, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Changer de parent
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>
              Déplacer "{childName}" ?
            </div>
          </div>
          <button onClick={!saving ? onCancel : undefined} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          <div style={{ padding: "8px 12px", borderRadius: 4, background: C.s2, fontSize: 12, color: C.tx2 }}>
            <span style={{ color: C.tx3 }}>Depuis : </span>
            <strong style={{ color: C.tx }}>{currentParentName}</strong>
          </div>
          <div style={{ padding: "8px 12px", borderRadius: 4, background: C.coachS, border: "1px solid " + C.coach + "30", fontSize: 12 }}>
            <span style={{ color: C.tx3 }}>Vers : </span>
            <strong style={{ color: C.coach }}>{newParentName}</strong>
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
              Nouvelles dates : {newStart} → {newEnd}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={!saving ? onCancel : undefined}
            style={{ ...btnBase, background: "transparent", border: "1px solid " + C.brdL, color: C.tx2 }}
          >
            Annuler
          </button>
          <button
            onClick={!saving ? onConfirm : undefined}
            disabled={saving}
            style={{ ...btnBase, background: C.acV, border: "none", color: "#0E0C0A" }}
          >
            {saving ? "…" : "Déplacer dans " + newParentName}
          </button>
        </div>
      </div>
    </>
  );
}
