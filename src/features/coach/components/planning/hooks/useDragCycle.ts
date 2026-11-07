import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, parseISO, addDays, startOfISOWeek, endOfISOWeek, addWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Macrocycle, Mesocycle, Cycle, Microcycle, TimelineData } from "./useTimelineData";
import { deletePlannedWorkouts } from "@/api/workouts";

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

const TABLE: Record<Level, string> = {
  macrocycles: "macrocycles",
  mesocycles:  "mesocycles",
  cycles:      "cycles",
  microcycles: "microcycles",
};

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
      const qKey = ["timeline-data", vars.athleteId, vars.rangeStart, vars.rangeEnd];
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

      const updatePayload: Record<string, string> = {
        start_date: format(vars.newStart, "yyyy-MM-dd"),
        end_date:   format(vars.newEnd,   "yyyy-MM-dd"),
      };
      if (vars.newMesocycleId !== undefined) updatePayload.mesocycle_id = vars.newMesocycleId;

      const { error } = await supabase
        .from(TABLE[vars.level])
        .update(updatePayload)
        .eq("id", vars.item.id);
      if (error) throw error;

      // When dragging a cycle, smart-regenerate microcycles aligned to new ISO weeks
      if (vars.level === "cycles") {
        const { data: existing } = await supabase
          .from("microcycles").select("id, start_date").eq("cycle_id", vars.item.id);

        const needed: { cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }[] = [];
        let weekMon = startOfISOWeek(vars.newStart);
        let week = 1;
        while (weekMon <= vars.newEnd) {
          needed.push({
            cycle_id:    vars.item.id,
            week_number: week,
            start_date:  format(weekMon,               "yyyy-MM-dd"),
            end_date:    format(endOfISOWeek(weekMon), "yyyy-MM-dd"),
            is_deload:   false,
          });
          weekMon = addWeeks(weekMon, 1);
          week++;
        }

        const neededStarts   = new Set(needed.map((m) => m.start_date));
        const existingStarts = new Set((existing ?? []).map((m) => m.start_date));

        const toDelete = (existing ?? []).filter((m) => !neededStarts.has(m.start_date));
        if (toDelete.length > 0) {
          const ids = toDelete.map((m) => m.id);
          await deletePlannedWorkouts({ microcycleIds: ids });
          await supabase.from("microcycles").delete().in("id", ids);
        }

        const toInsert = needed.filter((m) => !existingStarts.has(m.start_date));
        if (toInsert.length > 0) {
          await supabase.from("microcycles").insert(toInsert);
        }
      }
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
        qc.setQueryData(["active-cycle-id", vars.athleteId], vars.item.id);
      }
      qc.invalidateQueries({ queryKey: ["timeline-data",    vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["planning-summary", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-cycles",   vars.athleteId] });
    },
  });
}
