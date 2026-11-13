import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExercise,
  createExercises,
  exerciseKeys,
  getExerciseBankPage,
  getExerciseLibrary,
  invalidateExercises,
  searchExercises,
  type ExerciseBankFilters,
  type ExerciseLite,
  type LibraryExercise,
} from "@/api/exercises";

/** Toute la bibliothèque d'exercices (id, nom, vidéo) — pour rapprocher des noms écrits. */
export function useExerciseLibrary(enabled = true) {
  return useQuery<LibraryExercise[]>({
    queryKey: exerciseKeys.library,
    enabled,
    staleTime: 300_000,
    queryFn: getExerciseLibrary,
  });
}

/**
 * Recherche dans la banque (10 résultats, par nom et/ou type). Sans texte ni
 * type : aucune requête, liste vide. Les résultats précédents restent affichés
 * pendant la recherche suivante.
 */
export function useExerciseSearch(search: string, type: string) {
  const term = search.trim();
  const active = !!term || !!type;
  const q = useQuery<ExerciseLite[]>({
    queryKey: exerciseKeys.search(term, type),
    enabled: active,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: () => searchExercises({ search: term, type: type || undefined, limit: 10 }),
  });
  return { results: active ? (q.data ?? []) : [], isFetching: active && q.isFetching };
}

/** Crée un exercice « Communauté » rattaché au coach. */
export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { name: string; createdBy?: string | null }) => createExercise(p),
    onSettled: () => invalidateExercises(qc),
  });
}

/** Crée des exercices (non vérifiés, rattachés au coach). Retourne nom → exercice créé. */
export function useCreateExercises() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ names, coachId }: { names: string[]; coachId: string }) => createExercises(names, coachId),
    onSettled: () => invalidateExercises(qc),
  });
}

/** Une page de la banque (toutes colonnes) avec filtres, et le total filtré. */
export function useExerciseBankPage(f: ExerciseBankFilters) {
  return useQuery({
    queryKey: [...exerciseKeys.all, "bank-page", f] as const,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => getExerciseBankPage(f),
  });
}
