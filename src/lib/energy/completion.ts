/**
 * Saisie d'une séance énergie appliquée localement (mise à jour optimiste,
 * notamment hors ligne) : mêmes règles que les RPC `complete_energy_assignment`
 * et `set_energy_rpe` (supabase/migrations/20261109130000_energy_rpcs.sql),
 * pour que l'écran montre ce que la base contiendra après l'envoi.
 */
import type { BlockLogs } from "@/types/energy";

/** Champs d'une séance programmée touchés par la saisie de l'athlète. */
export interface EnergyEntryFields {
  status?: string;
  block_logs?: BlockLogs | null;
  notes?: string | null;
  actual_duration_min?: number | null;
  activity_url?: string | null;
  activity_type?: string | null;
  distance_km?: number | null;
  rpe_score?: number | null;
}

export type EnergyCompletionInput = Omit<EnergyEntryFields, "status">;

const blank = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v);

/**
 * Validation : statut « completed », blocs fusionnés bloc par bloc, et chaque
 * champ absent (null / vide) garde la valeur actuelle. Une activité donnée
 * remplace aussi la distance (null = aucune, ex. « vélo »).
 */
export function applyEnergyCompletion<T extends EnergyEntryFields>(row: T, input: EnergyCompletionInput): T {
  const notes = blank(input.notes);
  const url = blank(input.activity_url);
  const activity = input.activity_type ?? null;
  return {
    ...row,
    status: "completed",
    block_logs: { ...(row.block_logs ?? {}), ...(input.block_logs ?? {}) },
    notes: notes != null ? notes.trim() : row.notes ?? null,
    actual_duration_min: input.actual_duration_min ?? row.actual_duration_min ?? null,
    activity_url: url != null ? url.trim() : row.activity_url ?? null,
    activity_type: activity ?? row.activity_type ?? null,
    distance_km: activity != null ? input.distance_km ?? null : input.distance_km ?? row.distance_km ?? null,
    rpe_score: input.rpe_score ?? row.rpe_score ?? null,
  };
}

/** RPE Foster 1-10 ; `null` = retirer. */
export function applyEnergyRpe<T extends EnergyEntryFields>(row: T, rpe: number | null): T {
  return { ...row, rpe_score: rpe };
}

/** Des blocs faits et d'autres non (même règle que le calendrier). */
export function isPartialBlockLogs(logs: BlockLogs | null | undefined): boolean {
  const vals = Object.values(logs ?? {});
  return vals.length > 0 && vals.some((b) => b?.done) && vals.some((b) => !b?.done);
}
