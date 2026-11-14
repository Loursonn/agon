import { useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useRemoveProviderActivity } from "@/features/shared/hooks/useRemoveProviderActivity";

/**
 * « Retirer d'Agon » une sortie de montre ou de fichier (P38).
 *
 * Garmin et COROS ne préviennent pas quand une activité est supprimée dans
 * leur application : l'athlète, ou son coach, la retire ici. Confirmation en
 * deux temps ; la séance prévue rapprochée reste (seul le lien part). Une
 * séance saisie dans Agon n'a pas ce bouton (et la base la refuse).
 */
export function RemoveActivityButton({
  athleteId,
  activityId,
  sources,
}: {
  athleteId: string;
  activityId: string;
  sources?: string[] | null;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const remove = useRemoveProviderActivity(athleteId);
  if (sources?.includes("manual")) return null;

  const retirer = () =>
    remove.mutate(activityId, {
      onSuccess: () => toast.success("Activité retirée d'Agon"),
      onError: (e) => toast.error("Activité non retirée", { description: e.message }),
    });

  const btn = {
    padding: "6px 10px",
    borderRadius: 6,
    background: "transparent",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "inherit",
  } as const;

  if (!confirmer) {
    return (
      <button
        type="button"
        onClick={() => setConfirmer(true)}
        style={{ ...btn, alignSelf: "flex-start", marginTop: 4, border: "1px solid " + C.brd, color: C.tx3, cursor: "pointer" }}
      >
        Retirer d'Agon
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
      <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.45 }}>
        Retirer cette activité d'Agon, avec sa courbe, ses tours et ses zones ? La séance prévue qui lui
        était rattachée reste. L'activité n'est pas supprimée de la montre.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setConfirmer(false)}
          disabled={remove.isPending}
          style={{ ...btn, border: "1px solid " + C.brd, color: C.tx, cursor: "pointer" }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={retirer}
          disabled={remove.isPending}
          style={{ ...btn, border: "1px solid " + C.r + "60", color: C.r, cursor: remove.isPending ? "wait" : "pointer" }}
        >
          {remove.isPending ? "Retrait…" : "Retirer"}
        </button>
      </div>
    </div>
  );
}
