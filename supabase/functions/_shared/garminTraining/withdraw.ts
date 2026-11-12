/**
 * Déconnexion Garmin : avant de révoquer l'accès (après, on ne pourrait plus),
 * retirer du calendrier Garmin les séances Agon à venir. Au mieux : un échec
 * est remonté en avertissement et n'empêche jamais la déconnexion.
 */
import type { Db, FetchLike } from "../oauth.ts";
import { garminTrainingClient } from "./client.ts";

export async function withdrawFutureWorkouts(
  db: Db,
  athleteId: string,
  accessToken: string,
  opts: { fetchImpl?: FetchLike; today?: string } = {},
): Promise<string[]> {
  const warnings: string[] = [];
  const today = opts.today ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { data, error } = await db
    .from("provider_workout_pushes")
    .select("external_workout_id")
    .eq("athlete_id", athleteId)
    .eq("provider", "garmin")
    .gte("scheduled_date", today);
  if (error) return [`séances envoyées illisibles : ${error.message}`];
  const client = garminTrainingClient(accessToken, opts.fetchImpl);
  for (const r of (data ?? []) as Array<{ external_workout_id: string | null }>) {
    if (!r.external_workout_id) continue;
    try {
      await client.deleteWorkout(r.external_workout_id);
    } catch (e) {
      warnings.push(`séance Garmin ${r.external_workout_id} non retirée : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return warnings;
}
