import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateWorkouts, listWorkoutLogs, removeWorkout } from "@/api/workouts";
import { cycleKeys, getCycleTree } from "@/api/cycles";
import { getProgram } from "@/api/program";
import { readAppData, writeAppData } from "@/api/appData";
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
    queryKey: cycleKeys.history(athleteId),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async (): Promise<HistoriqueData> => {
      const [tree, logs] = await Promise.all([
        getCycleTree(athleteId, { withMicrocycles: false }),
        listWorkoutLogs({ athleteIds: [athleteId], withMods: false }),
      ]);
      // Macrocycles du plus récent au plus ancien ; mésos et cycles par date.
      const macros = [...tree.macrocycles].reverse();
      const { mesocycles: mesos, cycles } = tree;

      return {
        macros, mesos, cycles,
        logs: logs.map((l) => ({
          id: l.id, session_id: l.session_id, session_name: l.session_name,
          scheduled_date: l.scheduled_date, status: l.status,
        })),
      };
    },
  });
}

// ── Delete log ────────────────────────────────────────────────────────────────

export function useDeleteWorkoutLog(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Suppression explicite et confirmée par le coach dans l'historique :
    // une séance réalisée peut être retirée (doublon, erreur de saisie).
    mutationFn: (logId: string) => removeWorkout(logId, { allowCompleted: true }),
    onSuccess: (_d, logId) => {
      void invalidateWorkouts(qc, { athleteId, logId });
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
      const sessions = await getProgram(sourceAthleteId);
      const src = sessions.find((s) => s.id === sessionId);
      if (!src) throw new Error("Séance introuvable dans la programmation (supprimée ?)");

      // 2. Ajout aux Séances Type de la cible
      const t = await readAppData<ProgSession[]>(targetAthleteId, "asp:seances-type");
      const existing = Array.isArray(t.value) ? t.value : [];
      const { session: clean, removed } = await stripForeignPersonalFiches(cloneSession(src), targetAthleteId);
      const next = [...existing, clean];

      await writeAppData(targetAthleteId, "asp:seances-type", next);
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
