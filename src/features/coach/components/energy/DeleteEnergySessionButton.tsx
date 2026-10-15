/**
 * Suppression d'une séance énergétique / spécifique, avec confirmation.
 * Une séance déjà programmée chez un athlète est archivée (retirée des banques,
 * le calendrier et l'historique de l'athlète restent) — voir useDeleteEnergySession.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import { useDeleteEnergySession } from "@/features/shared/hooks/useEnergySessions";

export function DeleteEnergySessionDialog({ sessionId, sessionName, onClose }: {
  sessionId: string;
  sessionName: string;
  onClose: () => void;
}) {
  const deleteMutation = useDeleteEnergySession();
  // Portal : un parent avec transform (modale) piégerait le position: fixed
  return createPortal(
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.s1, borderRadius: 6, padding: 24, width: 360, maxWidth: "100%", border: `1px solid ${C.brd}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Supprimer la séance ?</div>
        <div style={{ fontSize: 12, color: C.tx3, marginBottom: 18, lineHeight: 1.5 }}>
          « {sessionName} » sera retirée de la banque. Si elle est déjà programmée chez un athlète, elle reste dans son calendrier avec ses retours.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={() => { deleteMutation.mutate(sessionId); onClose(); }}
            style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Icône corbeille + confirmation. Bloque la propagation (utilisable dans une ligne cliquable). */
export function DeleteEnergySessionButton({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setConfirm(true); }}
        title="Supprimer"
        aria-label={`Supprimer ${sessionName}`}
        style={{
          width: 28, height: 28, borderRadius: 4, flexShrink: 0,
          border: `1px solid ${C.r}40`, background: C.rS, color: C.r,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Trash2 size={12} />
      </button>
      {confirm && <DeleteEnergySessionDialog sessionId={sessionId} sessionName={sessionName} onClose={() => setConfirm(false)} />}
    </>
  );
}
