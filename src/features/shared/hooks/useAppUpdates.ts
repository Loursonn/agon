/**
 * Nouveautés de l'app (vue coach) : accusés de lecture.
 * Le contenu est dans src/data/releaseNotes.ts ; la base (app_update_reads)
 * ne stocke que « tel coach a vu telle nouveauté, à telle date ».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { RELEASE_NOTES } from "@/data/releaseNotes";
import type { ReleaseNote } from "@/data/releaseNotes";

// Table hors types générés tant que la migration n'est pas régénérée
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Ids des nouveautés vues par l'utilisateur. */
export function useAppUpdateReads(userId: string | undefined) {
  return useQuery<Record<string, string>>({
    queryKey: QK.appUpdateReads(userId ?? ""),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("app_update_reads").select("update_id, seen_at").eq("user_id", userId);
      if (error) throw error;
      return Object.fromEntries(((data ?? []) as { update_id: string; seen_at: string }[]).map(r => [r.update_id, r.seen_at]));
    },
  });
}

/** Nouveautés non vues (plus récente en tête) + historique. */
export function useAppUpdates(userId: string | undefined) {
  const { data: reads, isLoading, isError } = useAppUpdateReads(userId);
  const unseen: ReleaseNote[] = reads ? RELEASE_NOTES.filter(n => !reads[n.id]) : [];
  return { notes: RELEASE_NOTES, reads: reads ?? {}, unseen, isLoading, isError };
}

export function useMarkAppUpdateSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, updateIds }: { userId: string; updateIds: string[] }) => {
      const { error } = await db
        .from("app_update_reads")
        .upsert(updateIds.map(id => ({ user_id: userId, update_id: id })), { onConflict: "user_id,update_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: QK.appUpdateReads(v.userId) });
      qc.invalidateQueries({ queryKey: QK.appUpdateStats });
    },
    onError: () => toast.error("Impossible d'enregistrer la lecture"),
  });
}

export interface AppUpdateRead {
  update_id: string;
  user_id: string;
  full_name: string;
  seen_at: string;
  total_coaches: number;
}

/** Admin : qui a vu chaque nouveauté. */
export function useAppUpdateStats(enabled: boolean) {
  return useQuery<AppUpdateRead[]>({
    queryKey: QK.appUpdateStats,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_app_update_reads");
      if (error) throw error;
      return (data ?? []) as AppUpdateRead[];
    },
  });
}
