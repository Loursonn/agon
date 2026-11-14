import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { competitionKeys, getCompetitionLinks } from "@/api/competitions";
import { useDeleteCompetition, useSetCompetitionCancelled } from "@/hooks/useCompetitions";
import { deleteWarnings, isCancelled } from "@shared/domain/competitions";
import { ConfirmBox } from "@/features/shared/components/CompetitionConfirmBox";

/** Le strict nécessaire d'une compétition pour l'annuler ou la supprimer. */
export interface CompetitionActionTarget {
  id: string;
  athlete_id: string;
  name: string;
  cancelled_at?: string | null;
}

type Confirm = "cancel" | "delete" | null;

const COMPETITION_ACTION_BTN = "h-9 flex-1 cursor-pointer rounded-[10px] border bg-transparent px-3 font-[inherit] text-[12.5px] disabled:cursor-default disabled:opacity-50";

/**
 * Annuler / rétablir / supprimer une compétition, avec confirmation.
 * - Annuler : la compétition reste visible, barrée, hors des décomptes.
 * - Rétablir : sans confirmation (réversible).
 * - Supprimer : définitif ; la confirmation dit ce qui est détaché ou perdu
 *   (résultats et plans HYROX, bilan de l'athlète).
 *
 * `state.panel` est la zone de confirmation, à placer où l'appelant veut
 * (sous une ligne de liste, au pied d'une fenêtre).
 */
export function useCompetitionActions(comp: CompetitionActionTarget, onDone?: (what: "cancelled" | "restored" | "deleted") => void) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const setCancelled = useSetCompetitionCancelled();
  const del = useDeleteCompetition();
  const cancelled = isCancelled(comp);
  const pending = setCancelled.isPending || del.isPending;

  const links = useQuery({
    queryKey: competitionKeys.links(comp.athlete_id, comp.id),
    queryFn: () => getCompetitionLinks(comp.id),
    enabled: confirm === "delete",
    staleTime: 0,
  });
  const warnings = links.data ? deleteWarnings(links.data) : [];

  function restore() {
    setCancelled.mutate({ id: comp.id, athlete_id: comp.athlete_id, cancelled: false }, {
      onSuccess: () => { toast.success("Compétition rétablie"); onDone?.("restored"); },
      onError: () => toast.error("Compétition non rétablie"),
    });
  }

  function doCancel() {
    setCancelled.mutate({ id: comp.id, athlete_id: comp.athlete_id, cancelled: true }, {
      onSuccess: () => {
        setConfirm(null);
        toast.success("Compétition annulée", { action: { label: "Rétablir", onClick: restore } });
        onDone?.("cancelled");
      },
      onError: () => toast.error("Compétition non annulée"),
    });
  }

  function doDelete() {
    del.mutate({ id: comp.id, athlete_id: comp.athlete_id }, {
      onSuccess: () => { setConfirm(null); toast.success("Compétition supprimée"); onDone?.("deleted"); },
      onError: () => toast.error("Compétition non supprimée"),
    });
  }

  /** Annuler (demande confirmation) ou rétablir (direct). */
  const toggleCancel = () => (cancelled ? restore() : setConfirm((c) => (c === "cancel" ? null : "cancel")));
  const askDelete = () => setConfirm((c) => (c === "delete" ? null : "delete"));

  let panel: ReactNode = null;
  if (confirm === "cancel") {
    panel = (
      <ConfirmBox tone="accent" text={`Annuler « ${comp.name} » ? Elle reste visible, barrée, et sort des décomptes. Tu pourras la rétablir.`}>
        <button type="button" onClick={() => setConfirm(null)} className={cn(COMPETITION_ACTION_BTN, "border-agon-brd-l text-agon-tx")}>Garder</button>
        <button type="button" disabled={pending} onClick={doCancel} className={cn(COMPETITION_ACTION_BTN, "border-agon-accent/40 font-semibold text-agon-accent")}>
          {setCancelled.isPending ? "…" : "Oui, annuler"}
        </button>
      </ConfirmBox>
    );
  } else if (confirm === "delete") {
    panel = (
      <ConfirmBox
        tone="rouge"
        text={`Supprimer « ${comp.name} » ? C'est définitif.`}
        extra={(links.isLoading || warnings.length > 0 || links.isError) && (
          <ul className="m-0 mb-2.5 list-none p-0 text-[12px] leading-[1.45] text-agon-tx2">
            {links.isLoading && <li>Vérification de ce qui est rattaché…</li>}
            {links.isError && <li>Impossible de vérifier ce qui est rattaché (résultats, bilan).</li>}
            {warnings.map((w) => <li key={w}>· {w}</li>)}
          </ul>
        )}
      >
        <button type="button" onClick={() => setConfirm(null)} className={cn(COMPETITION_ACTION_BTN, "border-agon-brd-l text-agon-tx")}>Garder</button>
        <button type="button" disabled={pending || links.isLoading} onClick={doDelete} className={cn(COMPETITION_ACTION_BTN, "border-agon-rouge/40 font-semibold text-agon-rouge")}>
          {del.isPending ? "…" : "Supprimer"}
        </button>
      </ConfirmBox>
    );
  }

  return { cancelled, confirm, pending, toggleCancel, askDelete, panel };
}
