import type { QueryClient } from "@tanstack/react-query";
import { ApiError, db, unwrap } from "./client";

/**
 * Détail d'une activité de montre : série seconde par seconde, tours, séries
 * de muscu (`activity_streams`, `activity_laps`, `activity_sets`).
 *
 * Les tours ne s'écrivent que par RPC, la liste entière d'un bloc, avec la
 * version lue (`lapsVersion`) : si quelqu'un a modifié les tours entre-temps,
 * l'écriture lève `LapsConflictError` au lieu d'écraser son travail.
 */

export const activityDetailKeys = {
  all: (aid: string) => ["activityDetail", aid] as const,
  detail: (aid: string, activityId: string) => ["activityDetail", aid, activityId] as const,
};

/** Après une modification des tours ou une nouvelle synchro. */
export function invalidateActivityDetail(qc: QueryClient, athleteId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: activityDetailKeys.all(athleteId) });
}

export type LapOrigin = "watch" | "agon_proposal" | "manual";
export type LapStatus = "proposed" | "validated";

/** Un tour tel qu'on l'enregistre (bornes en secondes depuis le départ). */
export interface LapDraft {
  startS: number;
  endS: number;
  name?: string | null;
  exerciseId?: string | null;
  plannedBlockRef?: string | null;
  distanceOverrideM?: number | null;
  reps?: number | null;
  loadKg?: number | null;
  origin: LapOrigin;
  status: LapStatus;
  needsReview?: boolean;
}

export class LapsConflictError extends ApiError {
  constructor(message: string) {
    super("tours", { message, code: "40001" });
    this.name = "LapsConflictError";
  }
}

const toRow = (l: LapDraft) => ({
  start_s: Math.round(l.startS),
  end_s: Math.round(l.endS),
  name: l.name ?? null,
  exercise_id: l.exerciseId ?? null,
  planned_block_ref: l.plannedBlockRef ?? null,
  distance_override_m: l.distanceOverrideM ?? null,
  reps: l.reps ?? null,
  load_kg: l.loadKg ?? null,
  origin: l.origin,
  status: l.status,
  needs_review: l.needsReview ?? false,
});

function raiseConflict(res: { error: { message: string; code?: string } | null }): void {
  if (res.error?.code === "40001") throw new LapsConflictError(res.error.message);
}

/**
 * Remplace tous les tours (ajout, découpe, fusion, déplacement, suppression,
 * nom, exercice, distance, reps, charge, validation). Renvoie la nouvelle version.
 */
export async function saveLaps(activityId: string, expectedVersion: number, laps: readonly LapDraft[]): Promise<number> {
  const sorted = [...laps].sort((a, b) => a.startS - b.startS);
  const res = await db().rpc("save_activity_laps", {
    p_activity: activityId,
    p_expected_version: expectedVersion,
    p_laps: sorted.map(toRow),
  });
  raiseConflict(res);
  const v = unwrap(res, "enregistrement des tours");
  if (v === null) throw new ApiError("enregistrement des tours", { message: "aucune version renvoyée" });
  return v;
}

/** Revient aux tours de la montre ; la synchro pourra de nouveau les mettre à jour. */
export async function resetLapsToWatch(activityId: string, expectedVersion: number): Promise<number> {
  const res = await db().rpc("reset_activity_laps_to_watch", {
    p_activity: activityId,
    p_expected_version: expectedVersion,
  });
  raiseConflict(res);
  const v = unwrap(res, "retour aux tours de la montre");
  if (v === null) throw new ApiError("retour aux tours de la montre", { message: "aucune version renvoyée" });
  return v;
}

/** Revient au découpage proposé par Agon (`proposeLaps`, lot F). */
export function resetLapsToProposal(activityId: string, expectedVersion: number, proposal: readonly LapDraft[]): Promise<number> {
  return saveLaps(activityId, expectedVersion, proposal.map((l) => ({ ...l, origin: "agon_proposal" as const })));
}
