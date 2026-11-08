import { differenceInWeeks, parseISO } from "date-fns";
import { listMacrocycleMesocycles, listMesocycleCycles, setCycleDates, updatePeriod } from "@/api/cycles";
import { chainNextStart, endFromWeeks, snapMonday, snapSunday } from "./planningHelpers";

/**
 * Réenchaîne les cycles d'un mésocycle dont les dates changent : chaque cycle
 * garde son nombre de semaines, commence le lundi qui suit le précédent, et
 * s'arrête au plus tard à la fin du méso. Un cycle qui ne tient plus est
 * laissé tel quel (le coach décide). Semaines régénérées par `setCycleDates`
 * (celles qui restent couvertes sont gardées) ; les séances ne sont jamais
 * retirées ici, seulement détachées des semaines supprimées.
 */
export async function rechainCyclesInMeso(mesoId: string, newStart: string, newEnd: string): Promise<void> {
  const cycles = await listMesocycleCycles(mesoId);
  let cursor = snapMonday(newStart);
  for (const c of cycles) {
    if (cursor > newEnd) break;
    const weeks = Math.max(1, differenceInWeeks(parseISO(c.end_date), parseISO(c.start_date)) + 1);
    let end = endFromWeeks(cursor, weeks);
    if (end > newEnd) end = snapSunday(newEnd);
    await setCycleDates({ cycleId: c.id, start: cursor, end, dropPlanned: false });
    cursor = chainNextStart(end);
  }
}

/** Même chose un niveau au-dessus : mésocycles d'un macrocycle, puis leurs cycles. */
export async function rechainMesosInMacro(macroId: string, newStart: string, newEnd: string): Promise<void> {
  const mesos = await listMacrocycleMesocycles(macroId);
  let cursor = snapMonday(newStart);
  for (const m of mesos) {
    if (cursor > newEnd) break;
    const weeks = Math.max(1, differenceInWeeks(parseISO(m.end_date), parseISO(m.start_date)) + 1);
    let end = endFromWeeks(cursor, weeks);
    if (end > newEnd) end = snapSunday(newEnd);
    await updatePeriod("mesocycles", m.id, { start_date: cursor, end_date: end });
    await rechainCyclesInMeso(m.id, cursor, end);
    cursor = chainNextStart(end);
  }
}
