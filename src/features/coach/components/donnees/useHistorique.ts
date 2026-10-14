import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Macrocycle, Mesocycle, Cycle } from "@/features/coach/components/planning/hooks/useTimelineData";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import { stripForeignPersonalFiches } from "@/features/shared/hooks/fiches/syncDocAssignments";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HistoLog {
  id: string;
  session_id: string;
  session_name: string;
  scheduled_date: string; // yyyy-MM-dd
  status: string;         // planned | completed | missed | skipped
}

export interface HistoriqueData {
  macros: Macrocycle[];
  mesos: Mesocycle[];
  cycles: Cycle[];       // inclut les cycles standalone (mesocycle_id null)
  logs: HistoLog[];
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function useHistorique(athleteId: string) {
  return useQuery({
    queryKey: ["historique", athleteId],
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async (): Promise<HistoriqueData> => {
      const [macroRes, logsRes] = await Promise.all([
        supabase.from("macrocycles").select("*").eq("athlete_id", athleteId).order("start_date", { ascending: false }),
        supabase.from("workout_logs")
          .select("id, session_id, session_name, scheduled_date, status")
          .eq("athlete_id", athleteId)
          .order("scheduled_date"),
      ]);

      const macros = (macroRes.data ?? []) as Macrocycle[];
      const macroIds = macros.map((m) => m.id);

      let mesos: Mesocycle[] = [];
      if (macroIds.length > 0) {
        const mesoRes = await supabase.from("mesocycles").select("*").in("macrocycle_id", macroIds).order("start_date");
        mesos = (mesoRes.data ?? []) as Mesocycle[];
      }
      const mesoIds = mesos.map((m) => m.id);

      let cycles: Cycle[] = [];
      if (mesoIds.length > 0) {
        const cycleRes = await supabase.from("cycles").select("*").in("mesocycle_id", mesoIds).order("start_date");
        cycles = (cycleRes.data ?? []) as Cycle[];
      }

      // Cycles standalone (sans méso parent)
      const saRes = await supabase.from("cycles").select("*")
        .eq("athlete_id", athleteId).is("mesocycle_id", null).order("start_date");
      cycles = [...cycles, ...((saRes.data ?? []) as Cycle[])];

      return { macros, mesos, cycles, logs: (logsRes.data ?? []) as HistoLog[] };
    },
  });
}

// ── Delete log ────────────────────────────────────────────────────────────────

export function useDeleteWorkoutLog(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase.from("workout_logs").delete().eq("id", logId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["historique", athleteId] });
      qc.invalidateQueries({ queryKey: ["cal", athleteId] });
      qc.invalidateQueries({ queryKey: ["calendar-events", athleteId] });
      qc.invalidateQueries({ queryKey: ["week-schedule", athleteId] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", athleteId] });
      toast.success("Séance supprimée de l'historique");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });
}

// ── Copie d'une séance faite → Séances Type d'un athlète ─────────────────────

/** Clone profond avec nouveaux ids (séance, blocs, exercices). */
function cloneSession(session: ProgSession): ProgSession {
  return {
    ...session,
    id: crypto.randomUUID(),
    blocs: session.blocs.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
      exercices: b.exercices.map((e) => ({ ...e, id: crypto.randomUUID() })),
    })),
  };
}

export function useCopySessionAsType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceAthleteId,
      sessionId,
      targetAthleteId,
    }: {
      sourceAthleteId: string;
      sessionId: string;
      targetAthleteId: string;
    }) => {
      // 1. Squelette d'origine dans la programmation de l'athlète source
      const { data, error } = await supabase
        .from("app_data").select("value")
        .eq("athlete_id", sourceAthleteId).eq("key", "asp:prog")
        .maybeSingle();
      if (error) throw error;
      const sessions = (data?.value ?? []) as ProgSession[];
      const src = sessions.find((s) => s.id === sessionId);
      if (!src) throw new Error("Séance introuvable dans la programmation (supprimée ?)");

      // 2. Ajout aux Séances Type de la cible
      const { data: t, error: tErr } = await supabase
        .from("app_data").select("value")
        .eq("athlete_id", targetAthleteId).eq("key", "asp:seances-type")
        .maybeSingle();
      if (tErr) throw tErr;
      const existing = (t?.value ?? []) as ProgSession[];
      const { session: clean, removed } = await stripForeignPersonalFiches(cloneSession(src), targetAthleteId);
      const next = [...existing, clean];

      const { error: upErr } = await supabase
        .from("app_data")
        .upsert({ athlete_id: targetAthleteId, key: "asp:seances-type", value: next as unknown as Record<string, unknown>[] });
      if (upErr) throw upErr;
      return { removed };
    },
    onSuccess: ({ removed }, vars) => {
      qc.invalidateQueries({ queryKey: ["asp-seances-type", vars.targetAthleteId] });
      toast.success("Séance copiée dans les Séances Type ✓");
      if (removed > 0) toast.info(`${removed} fiche(s) personnelle(s) non copiée(s)`);
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? "";
      toast.error(msg.includes("introuvable") ? msg : "Erreur lors de la copie");
    },
  });
}
