import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, max, min, startOfISOWeek, endOfISOWeek, addWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AnyItem, Level, TimelineData } from "./useTimelineData";
import { deletePlannedWorkouts } from "@/api/workouts";

// ── Microcycle helpers ────────────────────────────────────────────────────────

function buildMicrocycles(cycleId: string, start: Date, end: Date) {
  const rows: { cycle_id: string; week_number: number; start_date: string; end_date: string; is_deload: boolean }[] = [];
  let weekMon = startOfISOWeek(start); // Monday of start week
  let week = 1;
  while (weekMon <= end) {
    rows.push({
      cycle_id:    cycleId,
      week_number: week,
      start_date:  format(weekMon,               "yyyy-MM-dd"),
      end_date:    format(endOfISOWeek(weekMon), "yyyy-MM-dd"), // Sunday
      is_deload:   false,
    });
    weekMon = addWeeks(weekMon, 1);
    week++;
  }
  return rows;
}

async function regenerateMicrocycles(cycleId: string, newStart: Date, newEnd: Date) {
  const { data: existing } = await supabase
    .from("microcycles").select("id, start_date").eq("cycle_id", cycleId);

  const needed = buildMicrocycles(cycleId, newStart, newEnd);
  const neededStarts   = new Set(needed.map((m) => m.start_date));
  const existingStarts = new Set((existing ?? []).map((m) => m.start_date));

  // Delete microcycles (and their workout_logs) outside the new range
  const toDelete = (existing ?? []).filter((m) => !neededStarts.has(m.start_date));
  if (toDelete.length > 0) {
    const ids = toDelete.map((m) => m.id);
    await deletePlannedWorkouts({ microcycleIds: ids });
    await supabase.from("microcycles").delete().in("id", ids);
  }

  // Insert only weeks not already covered
  const toInsert = needed.filter((m) => !existingStarts.has(m.start_date));
  if (toInsert.length > 0) {
    const { error } = await supabase.from("microcycles").insert(toInsert);
    if (error) console.error("[regenerate-microcycles]", error.message);
  }
}

export type { AnyItem, Level };

interface ResizeVars {
  level:       "macrocycles" | "mesocycles" | "cycles" | "microcycles";
  item:        { id: string; start_date: string; end_date: string };
  newStart:    Date;
  newEnd:      Date;
  parentStart?: string;
  parentEnd?:   string;
  athleteId:   string;
  rangeStart:  string;
  rangeEnd:    string;
  newMesocycleId?: string;
}

// ── Child cascade ─────────────────────────────────────────────────────────────
// Clips children that fall outside the new parent bounds.
// Returns list of {table, id, start_date, end_date} to update.

type ChildUpdate = { table: string; id: string; start_date: string; end_date: string };

async function cascadeClipChildren(
  level: ResizeVars["level"],
  parentId: string,
  newStart: Date,
  newEnd: Date,
): Promise<ChildUpdate[]> {
  const updates: ChildUpdate[] = [];

  const ns = format(newStart, "yyyy-MM-dd");
  const ne = format(newEnd,   "yyyy-MM-dd");

  if (level === "macrocycles") {
    const { data: mesos } = await supabase
      .from("mesocycles")
      .select("id, start_date, end_date")
      .eq("macrocycle_id", parentId);

    for (const m of mesos ?? []) {
      const cs = max([parseISO(m.start_date), newStart]);
      const ce = min([parseISO(m.end_date),   newEnd]);
      if (cs >= ce) {
        // Entirely outside — squeeze to parent start
        updates.push({ table: "mesocycles", id: m.id, start_date: ns, end_date: ns });
        continue;
      }
      if (format(cs, "yyyy-MM-dd") !== m.start_date || format(ce, "yyyy-MM-dd") !== m.end_date) {
        const mesoStart = format(cs, "yyyy-MM-dd");
        const mesoEnd   = format(ce, "yyyy-MM-dd");
        updates.push({ table: "mesocycles", id: m.id, start_date: mesoStart, end_date: mesoEnd });

        // Cascade into cycles
        const { data: cycles } = await supabase
          .from("cycles")
          .select("id, start_date, end_date")
          .eq("mesocycle_id", m.id);

        for (const c of cycles ?? []) {
          const cs2 = max([parseISO(c.start_date), cs]);
          const ce2 = min([parseISO(c.end_date),   ce]);
          if (cs2 >= ce2) {
            updates.push({ table: "cycles", id: c.id, start_date: mesoStart, end_date: mesoStart });
            continue;
          }
          if (format(cs2, "yyyy-MM-dd") !== c.start_date || format(ce2, "yyyy-MM-dd") !== c.end_date) {
            const cycleStart = format(cs2, "yyyy-MM-dd");
            const cycleEnd   = format(ce2, "yyyy-MM-dd");
            updates.push({ table: "cycles", id: c.id, start_date: cycleStart, end_date: cycleEnd });

            // Cascade into microcycles
            const { data: micros } = await supabase
              .from("microcycles")
              .select("id, start_date, end_date")
              .eq("cycle_id", c.id);

            for (const mi of micros ?? []) {
              const ms = max([parseISO(mi.start_date), cs2]);
              const me = min([parseISO(mi.end_date),   ce2]);
              if (ms >= me) {
                updates.push({ table: "microcycles", id: mi.id, start_date: cycleStart, end_date: cycleStart });
                continue;
              }
              if (format(ms, "yyyy-MM-dd") !== mi.start_date || format(me, "yyyy-MM-dd") !== mi.end_date) {
                updates.push({ table: "microcycles", id: mi.id, start_date: format(ms, "yyyy-MM-dd"), end_date: format(me, "yyyy-MM-dd") });
              }
            }
          }
        }
      }
    }
  }

  if (level === "mesocycles") {
    const { data: cycles } = await supabase
      .from("cycles")
      .select("id, start_date, end_date")
      .eq("mesocycle_id", parentId);

    for (const c of cycles ?? []) {
      const cs = max([parseISO(c.start_date), newStart]);
      const ce = min([parseISO(c.end_date),   newEnd]);
      if (cs >= ce) {
        updates.push({ table: "cycles", id: c.id, start_date: ns, end_date: ns });
        continue;
      }
      if (format(cs, "yyyy-MM-dd") !== c.start_date || format(ce, "yyyy-MM-dd") !== c.end_date) {
        const cycleStart = format(cs, "yyyy-MM-dd");
        const cycleEnd   = format(ce, "yyyy-MM-dd");
        updates.push({ table: "cycles", id: c.id, start_date: cycleStart, end_date: cycleEnd });

        const { data: micros } = await supabase
          .from("microcycles")
          .select("id, start_date, end_date")
          .eq("cycle_id", c.id);

        for (const mi of micros ?? []) {
          const ms = max([parseISO(mi.start_date), cs]);
          const me = min([parseISO(mi.end_date),   ce]);
          if (ms >= me) {
            updates.push({ table: "microcycles", id: mi.id, start_date: cycleStart, end_date: cycleStart });
            continue;
          }
          if (format(ms, "yyyy-MM-dd") !== mi.start_date || format(me, "yyyy-MM-dd") !== mi.end_date) {
            updates.push({ table: "microcycles", id: mi.id, start_date: format(ms, "yyyy-MM-dd"), end_date: format(me, "yyyy-MM-dd") });
          }
        }
      }
    }
  }

  // "cycles" level: microcycles are regenerated separately in mutationFn — skip here.

  return updates;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<string, string> = {
  macrocycles: "Macrocycle",
  mesocycles:  "Mésocycle",
  cycles:      "Cycle",
  microcycles: "Microcycle",
};

export function useResizeCycle() {
  const qc = useQueryClient();

  return useMutation({
    onMutate: async (vars: ResizeVars) => {
      const qKey = ["timeline-data", vars.athleteId, vars.rangeStart, vars.rangeEnd];
      await qc.cancelQueries({ queryKey: qKey });
      const previous = qc.getQueryData<TimelineData>(qKey);

      if (previous) {
        const ns = format(vars.newStart, "yyyy-MM-dd");
        const ne = format(vars.newEnd,   "yyyy-MM-dd");
        qc.setQueryData<TimelineData>(qKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            [vars.level]: (old[vars.level] as Array<{ id: string }>).map((it) =>
              it.id === vars.item.id ? { ...it, start_date: ns, end_date: ne } : it,
            ),
          };
        });
      }

      return { previous, qKey };
    },

    mutationFn: async (vars: ResizeVars) => {
      // Parent bounds check
      if (vars.parentStart && vars.parentEnd) {
        const pStart = parseISO(vars.parentStart);
        const pEnd   = parseISO(vars.parentEnd);
        if (vars.newStart < pStart || vars.newEnd > pEnd) {
          throw new Error(`${LEVEL_LABEL[vars.level] ?? vars.level} dépasse les bornes du parent`);
        }
      }

      // Update parent
      const updatePayload: Record<string, string> = {
        start_date: format(vars.newStart, "yyyy-MM-dd"),
        end_date:   format(vars.newEnd,   "yyyy-MM-dd"),
      };
      if (vars.newMesocycleId !== undefined) updatePayload.mesocycle_id = vars.newMesocycleId;

      const { error } = await supabase
        .from(vars.level)
        .update(updatePayload)
        .eq("id", vars.item.id);
      if (error) throw error;

      // Cascade clip children (or regenerate for cycles)
      if (vars.level === "cycles") {
        await regenerateMicrocycles(vars.item.id, vars.newStart, vars.newEnd);

        // Borne dure : raccourcir la fin d'un cycle supprime les séances au-delà
        // de la nouvelle fin (comme une modif manuelle de la date de fin). Couvre
        // aussi les logs date-based (microcycle_id null) que regenerate ne touche pas.
        const newEndStr = format(vars.newEnd, "yyyy-MM-dd");
        if (newEndStr < vars.item.end_date) {
          await deletePlannedWorkouts({ athleteId: vars.athleteId, after: newEndStr, until: vars.item.end_date });
        }
      }

      const childUpdates = await cascadeClipChildren(
        vars.level,
        vars.item.id,
        vars.newStart,
        vars.newEnd,
      );

      // Apply child updates in parallel per table
      const byTable: Record<string, ChildUpdate[]> = {};
      for (const u of childUpdates) {
        (byTable[u.table] ??= []).push(u);
      }

      await Promise.all(
        Object.entries(byTable).map(([table, updates]) =>
          Promise.all(
            updates.map((u) =>
              supabase
                .from(table)
                .update({ start_date: u.start_date, end_date: u.end_date })
                .eq("id", u.id),
            ),
          ),
        ),
      );
    },

    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous && ctx.qKey) {
        qc.setQueryData(ctx.qKey, ctx.previous);
      }
      toast.error(err.message ?? "Erreur redimensionnement");
    },

    onSuccess: (_data, vars) => {
      if (vars.level === "cycles") {
        qc.setQueryData(["active-cycle-id", vars.athleteId], vars.item.id);
      }
      qc.invalidateQueries({ queryKey: ["timeline-data",    vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["planning-summary", vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-cycles",   vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["cycle-sessions",   vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["calendar-events",  vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["micro-days",       vars.athleteId] });
      qc.invalidateQueries({ queryKey: ["micro-stats",      vars.athleteId] });
    },
  });
}
