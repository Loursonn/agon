/**
 * useSyncHistoricalPRs
 *
 * Calcule les PRs Epley depuis les sets réels stockés dans app_data (asp:sets).
 * Les sets sont groupés par clé `{exerciseId}_{week}` → SetRow[].
 *
 * Stratégie :
 *   1. Lit app_data WHERE key = 'asp:sets' pour l'athlète
 *   2. Construit un map exerciseId → effectiveRmRef depuis les exercices du programme
 *   3. Pour chaque set réalisé (done=true, kg>0, reps>0), calcule Epley
 *   4. Garde le meilleur par exerciseRef
 *   5. Compare à l'existant → insère si nouveau record
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { epley1RM } from "./usePRLogs";
import { effectiveRmRef } from "./useAutoComputePRs";
import type { Exercise, SetRow } from "../types/athlete";
import { toast } from "sonner";

interface SyncParams {
  athleteId: string;
  exercises: Exercise[];
}

export function useSyncHistoricalPRs() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async ({ athleteId, exercises }: SyncParams) => {
    if (syncing) return;
    setSyncing(true);
    try {
      // Build exerciseId → effectiveRmRef map
      const refByExId: Record<string, string> = {};
      for (const ex of exercises) {
        const ref = effectiveRmRef(ex);
        if (ref) refByExId[ex.id] = ref;
      }

      if (!Object.keys(refByExId).length) {
        toast("Aucun exercice avec référence RM dans le programme", { duration: 2000 });
        setSyncing(false);
        return;
      }

      // Fetch asp:sets from app_data
      const { data: appDataRow, error } = await supabase
        .from("app_data")
        .select("value")
        .eq("athlete_id", athleteId)
        .eq("key", "asp:sets")
        .maybeSingle();

      if (error) throw error;
      if (!appDataRow?.value) {
        toast("Aucun historique de sets trouvé", { duration: 2000 });
        setSyncing(false);
        return;
      }

      const setsMap = appDataRow.value as Record<string, SetRow[]>;

      // Find best Epley per exerciseRef across all weeks
      const bestByRef: Record<string, { kg: number; reps: number; epley: number }> = {};

      for (const [key, rows] of Object.entries(setsMap)) {
        // key = "{exerciseId}_{week}" — exerciseId itself may contain underscores
        // Strategy: try to match against known exercise IDs (longest match wins)
        let matchedRef: string | null = null;
        for (const [exId, ref] of Object.entries(refByExId)) {
          if (key.startsWith(exId + "_") || key === exId) {
            matchedRef = ref;
            break;
          }
        }
        if (!matchedRef) continue;

        const doneSets = (rows ?? []).filter(
          (s) => s.done && (s.kg ?? 0) > 0 && (s.reps ?? 0) > 0
        );

        for (const s of doneSets) {
          const epley = epley1RM(s.kg!, s.reps!);
          if (!bestByRef[matchedRef] || epley > bestByRef[matchedRef].epley) {
            bestByRef[matchedRef] = { kg: s.kg!, reps: s.reps!, epley };
          }
        }
      }

      if (!Object.keys(bestByRef).length) {
        toast("Aucun set valide trouvé (sets avec kg et reps > 0)", { duration: 3000 });
        setSyncing(false);
        return;
      }

      // Fetch existing computed PRs to avoid duplicates
      const { data: existing } = await supabase
        .from("exercise_pr_logs")
        .select("exercise_ref, kg")
        .eq("athlete_id", athleteId);

      const existingBest: Record<string, number> = {};
      for (const row of (existing ?? []) as Array<{ exercise_ref: string; kg: number }>) {
        if (!existingBest[row.exercise_ref] || row.kg > existingBest[row.exercise_ref]) {
          existingBest[row.exercise_ref] = row.kg;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const inserts: Array<{
        athlete_id: string;
        exercise_ref: string;
        kg: number;
        date: string;
        source: string;
        source_reps: number;
        source_kg: number;
      }> = [];

      for (const [ref, best] of Object.entries(bestByRef)) {
        if ((existingBest[ref] ?? 0) >= best.epley) continue;
        inserts.push({
          athlete_id:   athleteId,
          exercise_ref: ref,
          kg:           best.epley,
          date:         today,
          source:       "computed",
          source_reps:  best.reps,
          source_kg:    best.kg,
        });
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase.from("exercise_pr_logs").insert(inserts);
        if (insertErr) throw insertErr;
        qc.invalidateQueries({ queryKey: ["pr-logs", athleteId] });
        toast.success(`${inserts.length} PR${inserts.length > 1 ? "s" : ""} calculé${inserts.length > 1 ? "s" : ""} depuis l'historique`);
      } else {
        toast("PRs déjà à jour", { duration: 2000 });
      }
    } catch (err) {
      toast.error("Erreur sync historique : " + (err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [qc, syncing]);

  return { sync, syncing };
}
