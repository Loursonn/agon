import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import type { Goals } from "@/features/shared/types/athlete";
import { sha256Hex } from "@/lib/coachApiKey";
import { invalidateSessionStatus } from "@/features/shared/hooks/invalidateSessionStatus";
import {
  syncDocAssignmentsFromEnergy,
  syncDocAssignmentsFromProg,
} from "@/features/shared/hooks/fiches/syncDocAssignments";
import type { DraftKind, DraftOp } from "@shared/coachApiOps.ts";

export interface CoachApiDraft {
  id: string;
  kind: DraftKind;
  title: string;
  body: string;
  ops: DraftOp[];
  base_hash: string | null;
  status: "pending" | "applied" | "rejected" | "undone";
  applied_via: "app" | "api" | null;
  created_at: string;
  decided_at: string | null;
  undone_at: string | null;
}

const COLUMNS = "id, kind, title, body, ops, base_hash, status, applied_via, created_at, decided_at, undone_at";

/** Propositions en attente de l'assistant IA du coach, pour un athlète. */
export function useCoachApiDrafts(athleteId: string | undefined) {
  return useQuery({
    queryKey: QK.coachApiDrafts(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    // L'assistant dépose pendant que l'app est ouverte : un retour sur
    // l'onglet suffit à voir ce qu'il vient de proposer.
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CoachApiDraft[]> => {
      const { data, error } = await supabase
        .from("coach_api_drafts")
        .select(COLUMNS)
        .eq("athlete_id", athleteId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CoachApiDraft[];
    },
  });
}

/**
 * Ce qui a été inscrit dans Agon par une proposition de l'assistant, les 30
 * derniers jours — appliquée par le coach ou directement par l'assistant.
 * C'est là que le coach annule.
 */
export function useCoachApiHistory(athleteId: string | undefined) {
  return useQuery({
    queryKey: QK.coachApiHistory(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CoachApiDraft[]> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("coach_api_drafts")
        .select(COLUMNS)
        .eq("athlete_id", athleteId!)
        .in("status", ["applied", "undone"])
        .neq("kind", "axe")
        .gte("decided_at", since)
        .order("decided_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as CoachApiDraft[];
    },
  });
}

/**
 * Empreinte actuelle de la clé visée, calculée comme l'Edge Function la
 * calcule (SHA-256 du JSON renvoyé par la base). Différente de `base_hash` :
 * la cible a changé depuis la proposition.
 */
export function useDraftTargetHash(athleteId: string | undefined, key: "asp:prog" | "asp:goals") {
  return useQuery({
    queryKey: ["coach-api-draft-target", athleteId, key],
    enabled: !!athleteId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_data")
        .select("value")
        .eq("athlete_id", athleteId!)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return sha256Hex(JSON.stringify(data?.value ?? null));
    },
  });
}

/** Erreur renvoyée par l'Edge Function : un code stable et une phrase. */
export class CoachApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Appelle `coach-api` avec la session du coach. Appliquer et annuler se font
 * côté serveur : c'est lui qui tient le journal qui permet de revenir en
 * arrière.
 */
async function callCoachApi<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(`coach-api/${path}`, {
    method: "POST",
    body: body ?? {},
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let payload: { error?: string; message?: string } | null = null;
    try {
      payload = ctx ? await ctx.json() : null;
    } catch {
      payload = null;
    }
    throw new CoachApiError(payload?.error ?? "erreur", payload?.message ?? "La requête a échoué.");
  }
  return data as T;
}

/** Tout ce qu'une proposition peut avoir changé chez l'athlète. */
function invalidateAfterWrite(qc: QueryClient, athleteId: string) {
  qc.invalidateQueries({ queryKey: ["coach-api-drafts", athleteId] });
  qc.invalidateQueries({ queryKey: ["asp-prog", athleteId] });
  qc.invalidateQueries({ queryKey: ["coach-api-draft-target", athleteId] });
  qc.invalidateQueries({ queryKey: QK.energySessions });
  qc.invalidateQueries({ queryKey: QK.dayThemes(athleteId) });
  qc.invalidateQueries({ queryKey: ["day-themes", "recent"] });
  invalidateSessionStatus(qc, athleteId);
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

export class DraftAlreadyDecided extends Error {}

/** Écarte une proposition (ou marque un axe de travail comme lu et non retenu). */
export function useRejectCoachApiDraft(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("coach_api_drafts")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if ((data ?? []).length === 0) throw new DraftAlreadyDecided();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK.coachApiDrafts(athleteId) }),
  });
}
