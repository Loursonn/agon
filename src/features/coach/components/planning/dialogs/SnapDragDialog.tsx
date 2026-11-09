import { useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { chainNextStart, endFromWeeks } from "../utils/planningHelpers";
import type { SnapDragDialogState } from "../utils/timelineLevels";

/** Chevauchement détecté à un déplacement, un redimensionnement ou une création : coller avant / après, ou décaler. */
export function SnapDragDialog({ state }: { state: SnapDragDialogState }) {
  const [cascading, setCascading] = useState(false);

  const originalWeeks = Math.max(
    1,
    Math.round((parseISO(state.movingEnd).getTime() - parseISO(state.movingStart).getTime()) / (7 * 86400_000)) + 1,
  );

  const afterStart = chainNextStart(state.conflict.end_date);
  const afterEnd = endFromWeeks(afterStart, originalWeeks);

  // « Coller avant » = fin juste avant le début du conflit (qui démarre un lundi → dimanche précédent).
  const beforeEnd = format(addDays(parseISO(state.conflict.start_date), -1), "yyyy-MM-dd");
  const beforeValid = beforeEnd >= state.movingStart; // il faut au moins une semaine de place

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) state.onCancel(); }}
      title={<><span className="block text-agon-xs font-bold uppercase tracking-wide text-agon-alerte">Chevauchement</span>Que faire ?</>}
      footer={
        <>
          {state.onCascadeShift && (
            <Button
              variant="secondary"
              disabled={cascading}
              className="h-auto min-h-10 whitespace-normal py-agon-xs md:mr-auto"
              title="Décale le bloc en conflit et tous les suivants de 1 semaine, puis place la période à sa nouvelle position"
              onClick={async () => {
                setCascading(true);
                await state.onCascadeShift!();
                setCascading(false);
              }}
            >
              {cascading ? "…" : `Décaler « ${state.conflict.name} » +1 sem. → cascade`}
            </Button>
          )}
          <Button variant="ghost" onClick={state.onCancel}>Annuler</Button>
        </>
      }
    >
      <div className="mb-agon-lg rounded-md bg-agon-alerte-doux p-agon-md text-agon-base text-agon-tx2">
        <b className="text-agon-tx">{state.movingLabel}</b> chevauche <b className="text-agon-tx">{state.conflict.name}</b>
        <div className="mt-agon-xs text-agon-xs text-agon-tx3">
          {state.conflict.start_date} → {state.conflict.end_date}
        </div>
      </div>

      <div className="flex flex-col gap-agon-sm">
        <button
          type="button"
          onClick={() => state.onConfirmSnap(afterStart, afterEnd)}
          className="rounded-md bg-agon-alerte-vif p-agon-md text-left font-ui text-agon-ink"
        >
          <div className="text-agon-xs opacity-[.85]">Coller après</div>
          <div className="text-agon-base font-extrabold">{state.conflict.name}</div>
          <div className="mt-agon-2xs text-agon-xs opacity-80">{afterStart} → {afterEnd}</div>
        </button>

        {beforeValid && (
          <button
            type="button"
            onClick={() => state.onConfirmSnap(state.movingStart, beforeEnd)}
            className="rounded-md border border-agon-brd-l bg-agon-s2 p-agon-md text-left font-ui text-agon-tx"
          >
            <div className="text-agon-xs text-agon-tx3">Coller avant</div>
            <div className="text-agon-base font-extrabold">{state.conflict.name}</div>
            <div className="mt-agon-2xs text-agon-xs text-agon-tx3">{state.movingStart} → {beforeEnd}</div>
          </button>
        )}
      </div>
    </Dialog>
  );
}
