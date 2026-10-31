/**
 * Application d'une semaine proposée par l'assistant IA du coach.
 *
 * Mêmes écritures que les gestes du coach dans l'app : séance ajoutée au
 * programme (éditeur), séance énergétique créée pour l'athlète (éditeur
 * énergie), placement sur une date (calendrier), thème du jour (calendrier).
 *
 * Ces écritures ne sont pas atomiques. Chacune est donc rejouable : si l'une
 * échoue, la proposition revient en attente et un nouveau clic termine le
 * travail sans rien dupliquer — séances créées sous l'id fixé à la
 * proposition, placements et thèmes en upsert, assignations énergie
 * vérifiées avant insertion.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import type { EnergyGroup, EnergyStep } from "@/types/energy";
import { computeTotals, expandIntervals } from "@/lib/energy";
import {
  syncDocAssignmentsFromEnergy,
  syncDocAssignmentsFromProg,
} from "@/features/shared/hooks/fiches/syncDocAssignments";
import { invalidateSessionStatus } from "@/features/shared/hooks/invalidateSessionStatus";
import { QK } from "@/lib/queryKeys";
import {
  applyWeekProgOps,
  DraftApplyError,
  type DraftOp,
  type ProgSessionShape,
  type WeekOp,
} from "@shared/coachApiOps.ts";

function totals(steps: EnergyStep[]) {
  const root: EnergyGroup = { type: "group", id: "__root__", role: "open", repeat: 1, children: steps };
  return computeTotals(expandIntervals(root));
}

export async function applyWeekDraft(
  qc: QueryClient,
  athleteId: string,
  coachId: string,
  allOps: DraftOp[],
) {
  const ops = allOps as WeekOp[];

  // 1. Séances de musculation créées → programme. Relu en base juste avant.
  const { data: progRow, error: pErr } = await supabase
    .from("app_data")
    .select("value")
    .eq("athlete_id", athleteId)
    .eq("key", "asp:prog")
    .maybeSingle();
  if (pErr) throw pErr;
  const current = (progRow?.value ?? []) as unknown as ProgSessionShape[];
  const prog = applyWeekProgOps(current, ops);
  if (prog !== current) {
    const { error } = await supabase
      .from("app_data")
      .upsert({ athlete_id: athleteId, key: "asp:prog", value: prog as unknown as Json });
    if (error) throw error;
    void syncDocAssignmentsFromProg(athleteId, prog as unknown as ProgSession[], qc);
  }

  // 2. Séances énergétiques créées → copies propres à l'athlète, comme
  //    l'éditeur quand il est ouvert depuis sa fiche.
  const creates = ops.filter((o): o is Extract<WeekOp, { op: "create_energy_session" }> => o.op === "create_energy_session");
  if (creates.length > 0) {
    const { data: existing, error } = await supabase
      .from("energy_sessions")
      .select("id")
      .in("id", creates.map((c) => c.energy.id));
    if (error) throw error;
    const done = new Set((existing ?? []).map((e) => e.id as string));
    const rows = creates
      .filter((c) => !done.has(c.energy.id))
      .map(({ energy }) => {
        const t = totals(energy.intervals as unknown as EnergyStep[]);
        return {
          id: energy.id,
          name: energy.name,
          session_kind: energy.session_kind,
          structure_type: energy.structure_type,
          notes: energy.notes,
          intervals: energy.intervals as unknown as Json,
          format: "wod",
          created_by: coachId,
          athlete_id: athleteId,
          total_duration_s: t.durationS,
          total_distance_m: t.distanceM,
        };
      });
    if (rows.length > 0) {
      const { error: iErr } = await supabase.from("energy_sessions").insert(rows as never);
      if (iErr) throw iErr;
    }
  }

  // 3. Séances de musculation placées.
  const placeWorkout = ops.filter((o): o is Extract<WeekOp, { op: "place_session" }> => o.op === "place_session");
  if (placeWorkout.length > 0) {
    const rows = placeWorkout.map((o) => {
      const session = prog.find((s) => s.id === o.session_id);
      if (!session) throw new DraftApplyError(`la séance « ${o.session_id} » n'existe plus dans le programme`);
      return {
        athlete_id: athleteId,
        coach_id: coachId,
        session_id: session.id,
        session_name: session.name,
        scheduled_date: o.date,
        original_scheduled_date: o.date,
        status: "planned",
      };
    });
    const { error } = await supabase.from("workout_logs").upsert(rows, {
      onConflict: "athlete_id,session_id,scheduled_date",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }

  // 4. Séances énergétiques placées. Pas de contrainte d'unicité en base :
  //    on vérifie ce qui existe déjà pour ne pas doubler au second clic.
  const placeEnergy = ops.filter((o): o is Extract<WeekOp, { op: "place_energy_session" }> => o.op === "place_energy_session");
  if (placeEnergy.length > 0) {
    const { data: existing, error } = await supabase
      .from("energy_session_assignments")
      .select("energy_session_id, scheduled_date")
      .eq("athlete_id", athleteId)
      .in("energy_session_id", [...new Set(placeEnergy.map((o) => o.energy_session_id))])
      .in("scheduled_date", [...new Set(placeEnergy.map((o) => o.date))]);
    if (error) throw error;
    const done = new Set((existing ?? []).map((a) => `${a.energy_session_id}|${a.scheduled_date}`));
    const rows = placeEnergy
      .filter((o) => !done.has(`${o.energy_session_id}|${o.date}`))
      .map((o) => ({
        athlete_id: athleteId,
        coach_id: coachId,
        energy_session_id: o.energy_session_id,
        scheduled_date: o.date,
        status: "planned",
      }));
    if (rows.length > 0) {
      const { error: iErr } = await supabase.from("energy_session_assignments").insert(rows);
      if (iErr) throw iErr;
    }
    void syncDocAssignmentsFromEnergy(athleteId, qc);
  }

  // 5. Thèmes du jour : remplacent celui de la date, comme dans le calendrier.
  const themes = ops.filter((o): o is Extract<WeekOp, { op: "set_day_theme" }> => o.op === "set_day_theme");
  if (themes.length > 0) {
    const now = new Date().toISOString();
    const rows = themes.map((t) => ({
      athlete_id: athleteId,
      coach_id: coachId,
      date: t.date,
      label: t.label,
      intensity: t.intensity,
      dominante: t.dominante,
      color: t.color,
      note: t.note,
      updated_at: now,
    }));
    const { error } = await supabase.from("day_themes").upsert(rows as never, { onConflict: "athlete_id,date" });
    if (error) throw error;
  }

  invalidateSessionStatus(qc, athleteId);
  qc.invalidateQueries({ queryKey: QK.energySessions });
  qc.invalidateQueries({ queryKey: QK.dayThemes(athleteId) });
  qc.invalidateQueries({ queryKey: ["day-themes", "recent"] });
}
