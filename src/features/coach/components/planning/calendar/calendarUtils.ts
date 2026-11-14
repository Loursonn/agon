import { format } from "date-fns";
import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import { TYPE_COLOR as PEPS } from "@/lib/peps";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";

export function findCurrentCycleId(cycles: Array<{ id: string; start_date: string; end_date: string }>): string | null {
  if (!cycles.length) return null;
  const today = format(new Date(), "yyyy-MM-dd");
  const current  = cycles.find(c => c.start_date <= today && today <= c.end_date);
  if (current) return current.id;
  const upcoming = cycles.find(c => c.start_date > today);
  if (upcoming) return upcoming.id;
  return cycles[cycles.length - 1].id;
}

export function isBiometric(event: CalEvent): boolean {
  return event.type === "test" && event.raw?.type === "biometric";
}

export function energyChipColor(event: CalEvent): string {
  // Peps : énergie bleu, séance spécifique (HYROX) orange.
  return event.sessionKind === "specifique" ? PEPS.hyrox : PEPS.energie;
}


// Le curseur décide du jour ciblé, pas le rectangle de la vignette déplacée :
// une vignette (~230px) est plus large qu'une case jour (~160px), donc la
// détection par intersection de rectangles (défaut dnd-kit) visait un jour
// voisin — ou aucun jour près des bords, et le drop était alors ignoré.
export const dayCollisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : closestCenter(args);
};
