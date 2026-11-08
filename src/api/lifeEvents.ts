import type { QueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/queryKeys";
import type { LifeEvent, LifeEventInsert } from "@/types/planning";
import { check, db, unwrap, unwrapRows } from "./client";

/**
 * Événements de vie saisis par l'athlète (`athlete_life_events` : vacances,
 * déplacement, examens…), affichés dans sa semaine et dans le planning coach.
 *
 * Après toute écriture : `invalidateLifeEvents(qc, athleteId)`.
 */

export type { LifeEvent, LifeEventInsert };

export const lifeEventKeys = {
  athlete: (athleteId: string) => ["lifeEvents", athleteId] as const,
  list: (athleteId: string) => ["lifeEvents", athleteId, "list"] as const,
};

/** Listes de l'athlète et calendrier unifié du planning coach. */
export function invalidateLifeEvents(qc: QueryClient, athleteId: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: lifeEventKeys.athlete(athleteId) }),
    qc.invalidateQueries({ queryKey: QK.cal(athleteId) }),
    // Ancienne clé (écrans pas encore migrés)
    qc.invalidateQueries({ queryKey: ["life_events", athleteId] }),
  ]);
}

/** Événements d'un athlète, par date de début croissante. */
export async function listLifeEvents(athleteId: string): Promise<LifeEvent[]> {
  const rows = unwrapRows(
    await db().from("athlete_life_events").select("*").eq("athlete_id", athleteId).order("date_start", { ascending: true }),
    "Événements non chargés",
  );
  return rows as unknown as LifeEvent[];
}

export async function createLifeEvent(evt: LifeEventInsert): Promise<LifeEvent> {
  const row = unwrap(
    await db().from("athlete_life_events").insert(evt as never).select().single(),
    "Événement non enregistré",
  );
  if (!row) throw new Error("Événement non enregistré");
  return row as unknown as LifeEvent;
}

export async function deleteLifeEvent(id: string): Promise<void> {
  check(await db().from("athlete_life_events").delete().eq("id", id), "Événement non supprimé");
}
