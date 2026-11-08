import type { QueryClient } from "@tanstack/react-query";
import { addDays, isIsoDay, localIsoDay, type IsoDay } from "@shared/domain/dates";
import type { Habit } from "@/features/shared/types/athlete";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Tracker d'habitudes : `habits` (définies pour l'athlète), `habit_logs` (un
 * jour coché = une ligne) et l'interrupteur `profiles.habit_tracker_enabled`.
 */

export const habitKeys = {
  all: (aid: string) => ["habits", aid] as const,
  list: (aid: string) => ["habits", aid, "list"] as const,
  logs: (aid: string, since: IsoDay) => ["habits", aid, "logs", since] as const,
  enabled: (aid: string) => ["habits", aid, "enabled"] as const,
};

export function invalidateHabits(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: habitKeys.all(athleteId) });
}

/** Habitudes actives, dans l'ordre choisi (sans ordre en dernier). Lève si la lecture échoue. */
export async function getHabits(athleteId: string): Promise<Habit[]> {
  const rows = unwrapRows(
    await db().from("habits").select("*").eq("athlete_id", athleteId).eq("is_active", true)
      .order("sort_order", { ascending: true, nullsFirst: false }),
    "Lecture des habitudes impossible",
  );
  return rows as unknown as Habit[];
}

/** Défaut : un an d'historique, en jour local. */
export const defaultHabitSince = (today: IsoDay = localIsoDay()) => addDays(today, -365);

/** Jours cochés par habitude depuis `since` inclus. */
export async function getHabitLogs(athleteId: string, since: IsoDay = defaultHabitSince()): Promise<Record<string, string[]>> {
  const rows = unwrapRows(
    await db().from("habit_logs").select("habit_id, date").eq("athlete_id", athleteId).gte("date", since),
    "Lecture du suivi des habitudes impossible",
  );
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.habit_id] ??= []).push(r.date);
  return out;
}

/** Le tracker est-il activé pour cet athlète ? Faux si la fiche est invisible. */
export async function getHabitTrackerEnabled(athleteId: string): Promise<boolean> {
  const row = unwrap(
    await db().from("profiles").select("habit_tracker_enabled").eq("id", athleteId).maybeSingle(),
    "Lecture du tracker d'habitudes impossible",
  );
  return !!row?.habit_tracker_enabled;
}

export async function setHabitTrackerEnabled(athleteId: string, enabled: boolean): Promise<void> {
  check(
    await db().from("profiles").update({ habit_tracker_enabled: enabled }).eq("id", athleteId),
    "Activation du tracker d'habitudes impossible",
  );
}

function checkDay(day: IsoDay) {
  if (!isIsoDay(day)) throw new ApiError("Jour d'habitude invalide", { message: String(day) });
}

/** Coche un jour. */
export async function logHabit(athleteId: string, habitId: string, day: IsoDay): Promise<void> {
  checkDay(day);
  check(
    await db().from("habit_logs").insert({ habit_id: habitId, athlete_id: athleteId, date: day }),
    "Enregistrement de l'habitude impossible",
  );
}

/** Décoche un jour. */
export async function unlogHabit(athleteId: string, habitId: string, day: IsoDay): Promise<void> {
  checkDay(day);
  check(
    await db().from("habit_logs").delete().eq("athlete_id", athleteId).eq("habit_id", habitId).eq("date", day),
    "Suppression de l'habitude impossible",
  );
}

/**
 * Coche (`done`) ou décoche un jour ; pour `useAthleteLogic.toggleHabitLog`.
 * Renvoie les jours de l'habitude après l'écriture, à partir de `current`
 * (l'état affiché), pour mettre l'état local à jour sans relire.
 */
export async function setHabitDone(
  athleteId: string, habitId: string, day: IsoDay, done: boolean, current: readonly string[] = [],
): Promise<string[]> {
  if (done) {
    if (!current.includes(day)) await logHabit(athleteId, habitId, day);
    return current.includes(day) ? [...current] : [...current, day];
  }
  await unlogHabit(athleteId, habitId, day);
  return current.filter((d) => d !== day);
}
