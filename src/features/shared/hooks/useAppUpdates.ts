/**
 * Nouveautés de l'app (vue coach) : accusés de lecture.
 * Le contenu est dans src/data/releaseNotes.ts ; la base (app_update_reads)
 * ne stocke que « tel coach a vu telle nouveauté, à telle date ».
 * Adaptateurs de `src/api/appContent.ts`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  appContentKeys, invalidateAppUpdates, listAppUpdateReads, listAppUpdateStats, markAppUpdatesSeen,
  type AppUpdateRead,
} from "@/api/appContent";
import { RELEASE_NOTES } from "@/data/releaseNotes";
import type { ReleaseNote } from "@/data/releaseNotes";

export type { AppUpdateRead } from "@/api/appContent";

/** Ids des nouveautés vues par l'utilisateur. */
export function useAppUpdateReads(userId: string | undefined) {
  return useQuery<Record<string, string>>({
    queryKey: appContentKeys.updateReads(userId ?? ""),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: () => listAppUpdateReads(userId!),
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
    mutationFn: ({ userId, updateIds }: { userId: string; updateIds: string[] }) => markAppUpdatesSeen(userId, updateIds),
    onSuccess: (_d, v) => invalidateAppUpdates(qc, v.userId),
    onError: () => toast.error("Impossible d'enregistrer la lecture"),
  });
}

/** Admin : qui a vu chaque nouveauté. */
export function useAppUpdateStats(enabled: boolean) {
  return useQuery<AppUpdateRead[]>({
    queryKey: appContentKeys.updateStats,
    enabled,
    staleTime: 60_000,
    queryFn: listAppUpdateStats,
  });
}
