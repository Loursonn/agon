/**
 * Nouveautés de l'app (vue coach) : accusés de lecture.
 * Le contenu est dans src/data/releaseNotes.ts ; la base (app_update_reads)
 * ne stocke que « tel coach a vu telle nouveauté, à telle date ».
 * Adaptateurs de `src/api/appContent.ts`.
 */
import { STALE_MS } from "@/lib/queryCache";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  appContentKeys, invalidateAppUpdates, listAppUpdateReads, listAppUpdateStats, markAppUpdatesSeen,
  type AppUpdateRead,
} from "@/api/appContent";
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

// Le texte des nouveautés (~190 kB, ~57 kB compressés) n'est pas dans le
// démarrage coach : il arrive en différé (badge, carte et page Nouveautés).
let loadedNotes: ReleaseNote[] | null = null;
let notesPromise: Promise<ReleaseNote[]> | null = null;
function loadReleaseNotes(): Promise<ReleaseNote[]> {
  notesPromise ??= import("@/data/releaseNotes").then((m) => (loadedNotes = m.RELEASE_NOTES));
  return notesPromise;
}

/** Liste des nouveautés (null tant que le fichier n'est pas chargé). */
export function useReleaseNotes(): ReleaseNote[] | null {
  const [notes, setNotes] = useState(loadedNotes);
  useEffect(() => {
    if (notes) return;
    let alive = true;
    loadReleaseNotes().then((n) => { if (alive) setNotes(n); }, (e) => console.error("[useReleaseNotes]", e));
    return () => { alive = false; };
  }, [notes]);
  return notes;
}

/** Nouveautés non vues (plus récente en tête) + historique. */
export function useAppUpdates(userId: string | undefined) {
  const { data: reads, isLoading, isError } = useAppUpdateReads(userId);
  const notes = useReleaseNotes();
  const all = notes ?? [];
  const unseen: ReleaseNote[] = reads ? all.filter(n => !reads[n.id]) : [];
  return { notes: all, reads: reads ?? {}, unseen, isLoading: isLoading || !notes, isError };
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
    staleTime: STALE_MS,
    queryFn: listAppUpdateStats,
  });
}
