import { useState, useEffect } from "react";
import { getHabitLogs, getHabits, getHabitTrackerEnabled, setHabitTrackerEnabled } from "@/api/habits";
import type { Habit } from "../types/athlete";

/**
 * Habitudes + jours cochés (un an) + interrupteur du tracker, pour un athlète.
 * État local (pas React Query) : `AthleteContext` expose les setters, et le
 * cochage d'un jour est fait par `useAthleteLogic.toggleHabitLog`.
 * Une lecture qui échoue garde l'état affiché (journalisée).
 */
export function useHabits(athleteId: string) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Record<string, string[]>>({});
  const [habitEnabled, setHabitEnabled] = useState(false);
  const [habitToggling, setHabitToggling] = useState(false);
  const [habitToggleErr, setHabitToggleErr] = useState("");

  useEffect(() => {
    if (!athleteId) return;
    // Réponse d'un athlète précédent (changement d'athlète côté coach) : ignorée.
    let cancelled = false;
    const fail = (what: string) => (e: unknown) => console.error(`[useHabits] ${what}`, e);
    getHabits(athleteId).then((h) => { if (!cancelled) setHabits(h); }, fail("habitudes"));
    getHabitLogs(athleteId).then((l) => { if (!cancelled) setHabitLogs(l); }, fail("suivi"));
    getHabitTrackerEnabled(athleteId).then((on) => { if (!cancelled) setHabitEnabled(on); }, fail("tracker"));
    return () => { cancelled = true; };
  }, [athleteId]);

  const toggleHabitEnabled = async () => {
    setHabitToggling(true);
    setHabitToggleErr('');
    const ne = !habitEnabled;
    setHabitEnabled(ne);
    try {
      await setHabitTrackerEnabled(athleteId, ne);
    } catch (error) {
      setHabitEnabled(!ne);
      setHabitToggleErr('Erreur : migration SQL non appliquée ?');
      console.error('habit toggle:', error);
    }
    setHabitToggling(false);
  };

  return { habits, setHabits, habitLogs, setHabitLogs, habitEnabled, setHabitEnabled, habitToggling, habitToggleErr, toggleHabitEnabled };
}
