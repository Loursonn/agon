import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import type { Json } from "@/integrations/supabase/types";
import type { Goals } from "@/features/shared/types/athlete";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import { syncDocAssignmentsFromProg } from "@/features/shared/hooks/fiches/syncDocAssignments";
import { sha256Hex } from "@/lib/coachApiKey";
import { applyWeekDraft } from "./applyWeekDraft";
import {
  applyGoalsOps,
  applyProgOps,
  type DraftKind,
  type DraftOp,
  type GoalsOp,
  type PlanningOp,
  type ProgOp,
  type ProgSessionShape,
} from "@shared/coachApiOps.ts";

export interface CoachApiDraft {
  id: string;
  kind: DraftKind;
  title: string;
  body: string;
  ops: DraftOp[];
  base_hash: string | null;
  created_at: string;
}

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
        .select("id, kind, title, body, ops, base_hash, created_at")
        .eq("athlete_id", athleteId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
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

/**
 * Réserve une proposition en une seule requête : seule la première décision
 * passe, un deuxième onglet ou appareil trouve la ligne déjà décidée.
 */
async function claim(id: string, status: "applied" | "rejected"): Promise<boolean> {
  const { data, error } = await supabase
    .from("coach_api_drafts")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function release(id: string) {
  await supabase.from("coach_api_drafts").update({ status: "pending", decided_at: null }).eq("id", id);
}

export class DraftAlreadyDecided extends Error {}

interface ApplyArgs {
  draft: CoachApiDraft;
  /** Setter du contexte athlète : les objectifs passent par la sauvegarde normale. */
  setGoals: (v: Goals | ((p: Goals) => Goals)) => void;
  /** Coach connecté : auteur des placements et des thèmes d'une semaine. */
  coachId: string;
}

/**
 * Applique une proposition.
 *
 * Le programme est relu en base juste avant, pas pris dans le cache : la
 * proposition s'applique à ce qui est enregistré maintenant. Si elle ne
 * correspond plus (exercice supprimé entre-temps), `applyProgOps` lève une
 * erreur et rien n'est écrit — la proposition est remise en attente.
 */
export function useApplyCoachApiDraft(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, setGoals, coachId }: ApplyArgs) => {
      if (!(await claim(draft.id, "applied"))) throw new DraftAlreadyDecided();
      try {
        if (draft.kind === "programme" || draft.kind === "planning") {
          const { data, error } = await supabase
            .from("app_data")
            .select("value")
            .eq("athlete_id", athleteId)
            .eq("key", "asp:prog")
            .maybeSingle();
          if (error) throw error;
          const current = (data?.value ?? []) as unknown as ProgSessionShape[];
          const next = applyProgOps(current, draft.ops as (ProgOp | PlanningOp)[]) as unknown as ProgSession[];
          const { error: wErr } = await supabase
            .from("app_data")
            .upsert({ athlete_id: athleteId, key: "asp:prog", value: next as unknown as Json });
          if (wErr) throw wErr;
          // Même suite que l'éditeur de programmation : les fiches rattachées
          // aux séances suivent le programme.
          void syncDocAssignmentsFromProg(athleteId, next, qc);
        } else if (draft.kind === "objectifs") {
          setGoals((g) => applyGoalsOps(g, draft.ops as GoalsOp[]) as Goals);
        } else if (draft.kind === "semaine") {
          await applyWeekDraft(qc, athleteId, coachId, draft.ops);
        }
      } catch (e) {
        await release(draft.id);
        throw e;
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.coachApiDrafts(athleteId) });
      qc.invalidateQueries({ queryKey: ["asp-prog", athleteId] });
      qc.invalidateQueries({ queryKey: ["coach-api-draft-target", athleteId] });
    },
  });
}

/** Écarte une proposition (ou marque un axe de travail comme lu et non retenu). */
export function useRejectCoachApiDraft(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!(await claim(id, "rejected"))) throw new DraftAlreadyDecided();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK.coachApiDrafts(athleteId) }),
  });
}
