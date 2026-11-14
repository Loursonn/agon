import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

  const btn = "rounded-[6px] border bg-transparent px-2.5 py-1.5 font-[inherit] text-[11px] font-semibold";

  if (!confirmer) {
    return (
      <button
        type="button"
        onClick={() => setConfirmer(true)}
        className={cn(btn, "mt-1 cursor-pointer self-start border-agon-brd text-agon-tx3")}
      >
        Retirer d'Agon
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <div className="text-[11px] leading-[1.45] text-agon-tx2">
        Retirer cette activité d'Agon, avec sa courbe, ses tours et ses zones ? La séance prévue qui lui
        était rattachée reste. L'activité n'est pas supprimée de la montre.
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirmer(false)}
          disabled={remove.isPending}
          className={cn(btn, "cursor-pointer border-agon-brd text-agon-tx")}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={retirer}
          disabled={remove.isPending}
          className={cn(btn, "border-agon-erreur/[0.38] text-agon-erreur", remove.isPending ? "cursor-wait" : "cursor-pointer")}
        >
          {remove.isPending ? "Retrait…" : "Retirer"}
        </button>
      </div>
    </div>
  );
}
