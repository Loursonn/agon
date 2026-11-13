import { useMemo, useState } from "react";
import { matchExercise, nameKey, type ExerciseMatch, type LibraryExercise } from "@/lib/import/yoxx/matchExercise";
import { useExerciseLibrary, useCreateExercises } from "@/features/shared/hooks/useExerciseLibrary";

export const CREATE = "__create__";

/**
 * @param names noms tels qu'écrits dans le texte (doublons et zones « ⚠ » ignorés)
 */
export function useExerciseChoices(names: string[]) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const { data: library = [], isLoading } = useExerciseLibrary();
  const createExercises = useCreateExercises();

  const matches = useMemo(() => {
    const out = new Map<string, { name: string; match: ExerciseMatch }>();
    for (const name of names) {
      const key = nameKey(name);
      if (!key || name.startsWith("⚠") || out.has(key)) continue;
      out.set(key, { name, match: matchExercise(name, library) });
    }
    return out;
  }, [names, library]);

  /** Choix effectif : celui du coach, sinon exact / meilleur candidat / création */
  const choiceFor = (name: string): string => {
    const key = nameKey(name);
    const m = matches.get(key)?.match;
    if (!m) return CREATE;
    if (m.exact) return m.exact.id;
    return choices[key] ?? m.candidates[0]?.exercise.id ?? CREATE;
  };

  /** Exercice retenu (sans création) — pour l'aperçu */
  const previewFor = (name: string): LibraryExercise | undefined => {
    const id = choiceFor(name);
    return id === CREATE ? undefined : library.find((e) => e.id === id);
  };

  const toCreate = [...matches.values()].filter(({ name }) => choiceFor(name) === CREATE).map(({ name }) => name);

  /** Crée les exercices manquants puis renvoie l'exercice retenu pour chaque nom (clé normalisée). */
  async function resolveAll(coachId: string): Promise<{ byKey: Map<string, LibraryExercise>; created: LibraryExercise[] }> {
    const created = await createExercises.mutateAsync({ names: toCreate, coachId });
    const byKey = new Map<string, LibraryExercise>();
    const createdByKey = new Map(created.map((e) => [nameKey(e.name), e]));
    for (const [key, { name }] of matches) {
      const id = choiceFor(name);
      const ex = id === CREATE ? createdByKey.get(key) : library.find((e) => e.id === id);
      if (ex) byKey.set(key, ex);
    }
    return { byKey, created };
  }

  return {
    library, matches, choiceFor, previewFor, toCreate, resolveAll, isLoading,
    setChoice: (name: string, value: string) => setChoices((c) => ({ ...c, [nameKey(name)]: value })),
  };
}
