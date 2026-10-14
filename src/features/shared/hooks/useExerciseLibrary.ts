import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LibraryExercise } from "@/lib/import/yoxx/matchExercise";

const KEY = ["exercise-library-names"];

/** Toute la bibliothèque d'exercices (id, nom, vidéo) — pour rapprocher des noms écrits. */
export function useExerciseLibrary(enabled = true) {
  return useQuery<LibraryExercise[]>({
    queryKey: KEY,
    enabled,
    staleTime: 300_000,
    queryFn: async () => {
      const all: LibraryExercise[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("exercises")
          .select("id, name, youtube_id")
          .order("name")
          .range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as LibraryExercise[]));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });
}

/** Crée des exercices (non vérifiés, rattachés au coach). Retourne nom → exercice créé. */
export function useCreateExercises() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ names, coachId }: { names: string[]; coachId: string }) => {
      if (names.length === 0) return [] as LibraryExercise[];
      const { data, error } = await supabase
        .from("exercises")
        .insert(names.map((name) => ({ name, created_by: coachId, is_verified: false })))
        .select("id, name, youtube_id");
      if (error) throw error;
      return (data ?? []) as LibraryExercise[];
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
