/**
 * Suppression d'une séance énergétique / spécifique, avec confirmation.
 * Une séance déjà programmée chez un athlète est archivée (retirée des banques,
 * le calendrier et l'historique de l'athlète restent) — voir useDeleteEnergySession.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-[360px] max-w-full rounded-[6px] border border-agon-brd bg-agon-s1 p-6">
        <div className="mb-2 text-[15px] font-bold text-agon-tx">Supprimer la séance ?</div>
        <div className="mb-[18px] text-[12px] leading-[1.5] text-agon-tx3">
          « {sessionName} » sera retirée de la banque. Si elle est déjà programmée chez un athlète, elle reste dans son calendrier avec ses retours.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="cursor-pointer rounded border border-agon-brd bg-transparent px-3.5 py-[7px] text-[13px] text-agon-tx2"
          >
            Annuler
          </button>
          <button
            onClick={() => { deleteMutation.mutate(sessionId); onClose(); }}
            className="cursor-pointer rounded bg-agon-erreur-vif px-3.5 py-[7px] text-[13px] font-semibold text-agon-ink"
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
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-agon-erreur/25 bg-agon-erreur-doux text-agon-erreur"
      >
        <Trash2 size={12} />
      </button>
      {confirm && <DeleteEnergySessionDialog sessionId={sessionId} sessionName={sessionName} onClose={() => setConfirm(false)} />}
    </>
  );
}
