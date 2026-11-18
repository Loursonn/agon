/**
 * Observations morpho-anatomiques du coach (table morpho_observations) :
 * observations à l'œil et carte musculaire. Une ligne par athlète.
 */
import type { QueryClient } from "@tanstack/react-query";
import { EMPTY_OBSERVATIONS, type MorphoObservations } from "@/lib/morpho";
import { check, db, unwrap } from "./client";

export const morphoKeys = {
  observations: (athleteId: string) => ["morpho", athleteId, "observations"] as const,
};

export function invalidateMorpho(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: ["morpho", athleteId] });
}

export async function getMorphoObservations(athleteId: string): Promise<MorphoObservations> {
  const row = unwrap(
    await db().from("morpho_observations").select("abdomen, clavicules, cage, coude_valgus, muscles, note")
      .eq("athlete_id", athleteId).maybeSingle(),
    "Lecture du bilan morpho impossible",
  );
  if (!row) return EMPTY_OBSERVATIONS;
  return {
    abdomen: (row.abdomen as MorphoObservations["abdomen"]) ?? null,
    clavicules: (row.clavicules as MorphoObservations["clavicules"]) ?? null,
    cage: (row.cage as MorphoObservations["cage"]) ?? null,
    coude_valgus: (row.coude_valgus as MorphoObservations["coude_valgus"]) ?? null,
    muscles: (row.muscles && typeof row.muscles === "object" ? row.muscles : {}) as MorphoObservations["muscles"],
    note: row.note ?? null,
  };
}

export async function saveMorphoObservations(athleteId: string, coachId: string, obs: MorphoObservations): Promise<void> {
  check(
    await db().from("morpho_observations").upsert(
      {
        athlete_id: athleteId,
        abdomen: obs.abdomen, clavicules: obs.clavicules, cage: obs.cage, coude_valgus: obs.coude_valgus,
        muscles: obs.muscles, note: obs.note,
        updated_by: coachId, updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" },
    ),
    "Bilan morpho non enregistré",
  );
}
