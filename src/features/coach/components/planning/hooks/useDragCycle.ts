import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import type { Macrocycle, Mesocycle, Cycle, Microcycle, TimelineData } from "./useTimelineData";
import { cycleKeys, invalidateCycles, setCycleDates, updatePeriod } from "@/api/cycles";

type AnyItem = Macrocycle | Mesocycle | Cycle | Microcycle;
type Level = "macrocycles" | "mesocycles" | "cycles" | "microcycles";

interface DragVars {
  level:      Level;
  item:       AnyItem;
  newStart:   Date;
  newEnd:     Date;
  parentStart?: string;
  parentEnd?:   string;
  athleteId:  string;
  rangeStart: string;
  rangeEnd:   string;
  newMesocycleId?: string;
}

const LEVEL_LABEL: Record<Level, string> = {
  macrocycles: "Macrocycle",
  mesocycles:  "Mésocycle",
  cycles:      "Cycle",
  microcycles: "Microcycle",
};

export function useDragCycle() {
  const qc = useQueryClient();

  return useMutation({
    // ── Optimistic update ──────────────────────────────────────────────────
    onMutate: async (vars: DragVars) => {
      const qKey = cycleKeys.timeline(vars.athleteId, vars.rangeStart, vars.rangeEnd);
      await qc.cancelQueries({ queryKey: qKey });
      const previous = qc.getQueryData<TimelineData>(qKey);

      if (previous) {
        const newStartStr = format(vars.newStart, "yyyy-MM-dd");
        const newEndStr   = format(vars.newEnd,   "yyyy-MM-dd");
        qc.setQueryData<TimelineData>(qKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            [vars.level]: (old[vars.level] as AnyItem[]).map((it) =>
              it.id === vars.item.id
                ? { ...it, start_date: newStartStr, end_date: newEndStr }
                : it,
            ),
          };
        });
      }

      return { previous, qKey };
    },

    // ── DB update ─────────────────────────────────────────────────────────
    mutationFn: async (vars: DragVars) => {
      // Parent constraint check
      if (vars.parentStart && vars.parentEnd) {
        const pStart = parseISO(vars.parentStart);
        const pEnd   = parseISO(vars.parentEnd);
        if (vars.newStart < pStart || vars.newEnd > pEnd) {
          throw new Error(`${LEVEL_LABEL[vars.level]} dépasse les bornes du parent`);
        }
      }

      const start = format(vars.newStart, "yyyy-MM-dd");
      const end   = format(vars.newEnd,   "yyyy-MM-dd");

      // Un cycle : dates + semaines réalignées sur les nouvelles semaines ISO,
      // en une écriture (les séances prévues des semaines sorties sont
      // retirées, les séances réelles gardées).
      if (vars.level === "cycles") {
        await setCycleDates({ cycleId: vars.item.id, start, end, mesocycleId: vars.newMesocycleId });
        return;
      }
      await updatePeriod(vars.level, vars.item.id, {
        start_date: start,
        end_date:   end,
        ...(vars.newMesocycleId !== undefined ? { mesocycle_id: vars.newMesocycleId } : {}),
      });
    },

    // ── Rollback on error ──────────────────────────────────────────────────
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous && ctx.qKey) {
        qc.setQueryData(ctx.qKey, ctx.previous);
      }
      toast.error(err.message ?? "Erreur déplacement");
    },

    onSuccess: (_data, vars) => {
      if (vars.level === "cycles") {
        qc.setQueryData(cycleKeys.activeCycleId(vars.athleteId), vars.item.id);
      }
      void invalidateCycles(qc, vars.athleteId);
    },
  });
}
