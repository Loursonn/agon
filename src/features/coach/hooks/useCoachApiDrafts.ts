import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import type { Goals } from "@/features/shared/types/athlete";
import { invalidateSessionStatus } from "@/features/shared/hooks/invalidateSessionStatus";
import {
  syncDocAssignmentsFromEnergy,
  syncDocAssignmentsFromProg,
} from "@/features/shared/hooks/fiches/syncDocAssignments";
import { invalidateDocs } from "@/api/docs";
import { invalidateProgram } from "@/api/program";
import { invalidateEnergy } from "@/api/energy";
import { invalidateTests } from "@/api/tests";
import {
  callCoachApi, coachKeys, draftTargetHash, invalidateCoachApiDrafts, listDraftHistory, listPendingDrafts, rejectDraft,
  type CoachApiDraft,
} from "@/api/coaches";

export type { CoachApiDraft } from "@/api/coaches";
export { CoachApiError, DraftAlreadyDecided } from "@/api/coaches";

/** Propositions en attente de l'assistant IA du coach, pour un athlète. */
export function useCoachApiDrafts(athleteId: string | undefined) {
  return useQuery<CoachApiDraft[]>({
    queryKey: coachKeys.apiDrafts(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    // L'assistant dépose pendant que l'app est ouverte : un retour sur
    // l'onglet suffit à voir ce qu'il vient de proposer.
    refetchOnWindowFocus: true,
    queryFn: () => listPendingDrafts(athleteId!),
  });
}

/**
 * Ce qui a été inscrit dans Agon par une proposition de l'assistant, les 30
 * derniers jours — appliquée par le coach ou directement par l'assistant.
 * C'est là que le coach annule.
 */
export function useCoachApiHistory(athleteId: string | undefined) {
  return useQuery<CoachApiDraft[]>({
    queryKey: coachKeys.apiHistory(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => listDraftHistory(athleteId!),
  });
}

/**
 * Empreinte actuelle de la clé visée, calculée comme l'Edge Function la
 * calcule. Différente de `base_hash` : la cible a changé depuis la proposition.
 */
export function useDraftTargetHash(athleteId: string | undefined, key: "asp:prog" | "asp:goals") {
  return useQuery({
    queryKey: coachKeys.draftTarget(athleteId, key),
    enabled: !!athleteId,
    staleTime: 10_000,
    queryFn: () => draftTargetHash(athleteId!, key),
  });
}

/** Tout ce qu'une proposition peut avoir changé chez l'athlète. */
function invalidateAfterWrite(qc: QueryClient, athleteId: string) {
  void invalidateCoachApiDrafts(qc, athleteId);
  void invalidateProgram(qc, athleteId);
  void invalidateEnergy(qc, null);
  void invalidateTests(qc, athleteId);
  qc.invalidateQueries({ queryKey: QK.dayThemes(athleteId) });
  qc.invalidateQueries({ queryKey: ["day-themes", "recent"] });
  invalidateSessionStatus(qc, athleteId);
  // Planification : périodisation, compétitions, tests, calendrier.
  for (const key of [
    "timeline-data", "planning-summary", "calendar-events", "week-schedule", "cal", "cal-range",
    "cycle-sessions", "athlete-cycles", "athlete-cycles-list", "active-cycle", "assistant-last-cycle",
    "microcycles-nav", "microcycle", "activePlan", "test-results", "test-progression",
  ]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
  qc.invalidateQueries({ queryKey: QK.competitions() });
  // Fiches attribuées, rattachées ou rangées chez l'athlète (préfixe : tout le module).
  void invalidateDocs(qc, athleteId);
  qc.invalidateQueries({ queryKey: QK.testSessions(athleteId) });
  // Les fiches suivent le programme et les séances énergie placées.
  void syncDocAssignmentsFromProg(athleteId, undefined, qc);
  void syncDocAssignmentsFromEnergy(athleteId, qc);
}

interface ApplyArgs {
  draft: CoachApiDraft;
  /** Setter du contexte athlète : l'écran garde les objectifs en mémoire. */
  setGoals: (v: Goals | ((p: Goals) => Goals)) => void;
}

/** Applique une proposition en attente (ou retient un axe de travail). */
export function useApplyCoachApiDraft(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, setGoals }: ApplyArgs) => {
      const res = await callCoachApi<{ goals?: Goals }>(`drafts/${draft.id}/appliquer`);
      // Le contexte athlète a chargé les objectifs une fois : sans ça, il
      // réécrirait l'ancienne valeur à la prochaine sauvegarde.
      if (res?.goals) setGoals(res.goals);
    },
    onSettled: () => invalidateAfterWrite(qc, athleteId),
  });
}

/**
 * Annule une proposition appliquée. Sans `forcer`, le serveur refuse
 * (`modifie_depuis`) si le programme ou les objectifs ont changé depuis.
 */
export function useUndoCoachApiDraft(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, forcer = false }: { id: string; forcer?: boolean }) =>
      callCoachApi<{ conserves: number; message: string }>(`drafts/${id}/annuler`, { forcer }),
    onSettled: () => invalidateAfterWrite(qc, athleteId),
  });
}

/** Écarte une proposition (ou marque un axe de travail comme lu et non retenu). */
export function useRejectCoachApiDraft(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rejectDraft,
    onSettled: () => invalidateCoachApiDrafts(qc, athleteId),
  });
}
