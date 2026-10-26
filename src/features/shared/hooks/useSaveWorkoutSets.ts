import { useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AthleteModifications } from "../types/athlete";
import { QK } from "@/lib/queryKeys";

const DEBOUNCE_MS = 600;

export interface SaveWorkoutSets {
  /** Écriture différée (600 ms) — pour la frappe et les clics en rafale. */
  save: (modifications: AthleteModifications) => void;
  /**
   * Écriture immédiate, sans debounce.
   *
   * À utiliser dès que la page peut disparaître (passage en arrière-plan,
   * démontage). Le debounce s'appuie sur setTimeout, or les navigateurs
   * mobiles gèlent les timers d'un onglet caché : un `save()` déclenché sur
   * `visibilitychange` n'était jamais exécuté si le système tuait l'onglet
   * ensuite, et la séance était perdue.
   */
  flushNow: (modifications?: AthleteModifications) => void;
}

export function useSaveWorkoutSets(workoutLogId: string | undefined, athleteId?: string | null): SaveWorkoutSets {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingRef = useRef<AthleteModifications | null>(null);
  // Id figée dans un ref : au démontage (ou au changement de séance) la purge
  // doit viser la séance d'origine. Sans ça, naviguer d'une séance à l'autre
  // en moins de 600 ms faisait atterrir les séries de la séance A sur l'id B.
  const idRef = useRef(workoutLogId);
  const athleteRef = useRef(athleteId);
  athleteRef.current = athleteId;

  // Écriture volontairement hors `useMutation` : `flushNow` est appelé pendant
  // le démontage, moment où l'observateur React Query est déjà détaché et où
  // `mutate` peut ne rien déclencher. Ici l'appel réseau part quoi qu'il
  // arrive — c'est précisément le filet de sécurité de fin de séance.
  const write = useCallback(
    async (id: string, modifications: AthleteModifications) => {
      // `.select()` permet de détecter le cas "0 ligne mise à jour" : sans lui,
      // un UPDATE sur une séance disparue (supprimée entre-temps) réussit
      // silencieusement et la saisie de l'athlète est perdue sans aucun signal.
      const { data, error } = await supabase
        .from("workout_logs")
        .update({ athlete_modifications: modifications })
        .eq("id", id)
        .select("id");

      if (error || !data || data.length === 0) {
        toast.error("Saisie non enregistrée — vérifie ta connexion");
        return;
      }
      qc.invalidateQueries({ queryKey: ["workout-log-detail", id] });
      // Le planning coach lit athlete_modifications (séries, ajouts, commentaires)
      const aid = athleteRef.current;
      if (aid) {
        qc.invalidateQueries({ queryKey: QK.cal(aid) });
        qc.invalidateQueries({ queryKey: QK.athleteModifications(aid) });
      }
    },
    [qc],
  );

  const flushNow = useCallback(
    (modifications?: AthleteModifications) => {
      clearTimeout(timerRef.current);
      const payload = modifications ?? pendingRef.current;
      pendingRef.current = null;
      const id = idRef.current;
      if (!payload || !id) return;
      void write(id, payload);
    },
    [write],
  );

  const save = useCallback(
    (modifications: AthleteModifications) => {
      if (!workoutLogId) return;
      pendingRef.current = modifications;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushNow(), DEBOUNCE_MS);
    },
    [workoutLogId, flushNow],
  );

  // Au changement de séance et au démontage : on écrit ce qui reste en attente
  // pour la séance qu'on quitte, puis on repart propre. Le cleanup s'exécute
  // avant la mise à jour de idRef, donc il vise bien l'ancienne id.
  useEffect(() => {
    idRef.current = workoutLogId;
    return () => { flushNow(); };
  }, [workoutLogId, flushNow]);

  return { save, flushNow };
}
