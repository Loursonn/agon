/**
 * useAutoComputePRs
 *
 * Calcule les 1RM Epley depuis les sets réalisés et les insère dans exercise_pr_logs.
 *
 * Règle de référence :
 *   - Si ex.rm_ref défini → utilise ce nom (pool partagé entre exercices)
 *   - Sinon (muscu/halterophilie) → utilise ex.name comme référence par défaut
 *   - Exercices non-force (mobilite, plio) → ignorés
 *
 * Appelé :
 *   1. À la fin d'une séance (WorkoutDetailPage)
 *   2. Rétroactivement depuis les set_logs DB (useSyncHistoricalPRs)
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { epley1RM } from "./usePRLogs";
import type { Exercise, SetRow } from "../types/athlete";
import { toast } from "sonner";

const STRENGTH_TYPES = new Set(["muscu", "halterophilie", undefined, null, ""]);

/** Effective reference for an exercise (rm_ref > name for strength exercises). */
export function effectiveRmRef(ex: Exercise): string | null {
  if (ex.rm_ref) return ex.rm_ref;
  const t = ex.exType ?? "";
  if (!STRENGTH_TYPES.has(t)) return null;
  if (ex.isFlexibility) return null;
  return ex.name || null;
}

interface ComputeParams {
  athleteId: string;
  exercises: Exercise[];
  /** sets[exId_week] → SetRow[] */
  sets: Record<string, SetRow[]>;
  currentWeek: number;
  silent?: boolean;
}

export function useAutoComputePRs() {
  const qc = useQueryClient();

  return useCallback(async ({ athleteId, exercises, sets, currentWeek, silent = false }: ComputeParams) => {
    const today = new Date().toISOString().slice(0, 10);
    const newPRs: string[] = [];

    // Fetch current bests for all refs in one query
    const refs = [...new Set(exercises.map(effectiveRmRef).filter(Boolean) as string[])];
    if (!refs.length) return;

    const { data: existingBests } = await supabase
      .from("exercise_pr_logs")
      .select("exercise_ref, kg")
      .eq("athlete_id", athleteId)
      .in("exercise_ref", refs)
      .order("kg", { ascending: false });

    const bestByRef: Record<string, number> = {};
    for (const row of (existingBests ?? []) as Array<{ exercise_ref: string; kg: number }>) {
      if (!bestByRef[row.exercise_ref] || row.kg > bestByRef[row.exercise_ref]) {
        bestByRef[row.exercise_ref] = row.kg;
      }
    }

    const inserts: Array<{
      athlete_id: string;
      exercise_ref: string;
      kg: number;
      date: string;
      source: string;
      source_reps: number;
      source_kg: number;
    }> = [];

    for (const ex of exercises) {
      const ref = effectiveRmRef(ex);
      if (!ref) continue;

      const exSets = (sets[`${ex.id}_${currentWeek}`] ?? []) as SetRow[];
      const doneSets = exSets.filter(s => s.done && s.kg && s.reps && s.reps > 0);
      if (!doneSets.length) continue;

      const bestSet = doneSets.reduce<{ kg: number; reps: number; epley: number } | null>((best, s) => {
        const e = epley1RM(s.kg!, s.reps!);
        if (!best || e > best.epley) return { kg: s.kg!, reps: s.reps!, epley: e };
        return best;
      }, null);
      if (!bestSet || bestSet.epley <= 0) continue;

      const currentBest = bestByRef[ref] ?? 0;
      if (bestSet.epley > currentBest) {
        inserts.push({
          athlete_id:   athleteId,
          exercise_ref: ref,
          kg:           bestSet.epley,
          date:         today,
          source:       "computed",
          source_reps:  bestSet.reps,
          source_kg:    bestSet.kg,
        });
        bestByRef[ref] = bestSet.epley; // prevent duplicate insert for same ref
        newPRs.push(`${ref} : ${bestSet.epley} kg`);
      }
    }

    if (inserts.length > 0) {
      await supabase.from("exercise_pr_logs").insert(inserts);
      qc.invalidateQueries({ queryKey: ["pr-logs", athleteId] });
      if (!silent && newPRs.length > 0) {
        toast.success(`Nouveau PR : ${newPRs.join(", ")}`);
      }
    }
  }, [qc]);
}
