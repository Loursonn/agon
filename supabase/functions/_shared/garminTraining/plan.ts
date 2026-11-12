/**
 * Rapprochement « ce qu'Agon a programmé » ↔ « ce qui est sur Garmin ».
 * Pur : décide des actions, l'Edge Function `provider-garmin-workouts` les exécute.
 *
 * Règles :
 * - une séance inchangée (même empreinte, déjà envoyée) ne coûte aucun appel ;
 * - une séance modifiée ou déplacée est remplacée (suppression + création) ;
 * - une séance qui sort de la fenêtre (supprimée, déplacée loin, annulée,
 *   envoi coupé) est retirée de Garmin — sauf si elle est passée, réalisée ou
 *   commencée : on ne touche jamais à ce que l'athlète a fait ou est en train
 *   de faire ;
 * - une erreur est réessayée au passage suivant ; après 5 échecs sur la même
 *   version, une fois toutes les 6 h seulement (quota Garmin).
 */
import type { IsoDay } from "../domain/dates.ts";
import type { TranslateResult } from "./types.ts";

export type SourceKind = "energy" | "strength";

export interface DesiredWorkout {
  kind: SourceKind;
  sourceId: string;
  date: IsoDay;
  result: TranslateResult;
  /** Empreinte de ce qui serait envoyé (séance traduite + date, ou raison du refus). */
  hash: string;
}

export interface PushedRow {
  id: string;
  kind: SourceKind;
  sourceId: string;
  date: IsoDay;
  externalWorkoutId: string | null;
  externalScheduleId: string | null;
  hash: string | null;
  status: "sent" | "error" | "rejected";
  attempts: number;
  updatedAt: string;
}

export type PushAction =
  | { type: "create"; item: DesiredWorkout; row: PushedRow | null }
  | { type: "replace"; item: DesiredWorkout; row: PushedRow }
  | { type: "reject"; item: DesiredWorkout; row: PushedRow | null }
  | { type: "remove"; row: PushedRow }
  | { type: "forget"; row: PushedRow };

export const MAX_FAST_ATTEMPTS = 5;
export const SLOW_RETRY_MS = 6 * 3600_000;

export function sourceKey(kind: SourceKind, id: string): string {
  return `${kind}:${id}`;
}

export function planPushActions(input: {
  desired: DesiredWorkout[];
  pushed: PushedRow[];
  /** Séances réalisées ou commencées (clés `sourceKey`) : jamais retirées de Garmin. */
  doneOrStarted: ReadonlySet<string>;
  today: IsoDay;
  now: number;
}): PushAction[] {
  const actions: PushAction[] = [];
  const byKey = new Map(input.pushed.map((r) => [sourceKey(r.kind, r.sourceId), r]));
  const wanted = new Set<string>();

  for (const item of input.desired) {
    const key = sourceKey(item.kind, item.sourceId);
    wanted.add(key);
    const row = byKey.get(key) ?? null;
    const same = !!row && row.hash === item.hash;

    if (!item.result.ok) {
      if (row && row.status === "rejected" && same) continue;
      actions.push({ type: "reject", item, row });
      continue;
    }
    if (row && same && row.status === "sent" && row.externalWorkoutId) continue;
    if (row && same && row.status === "error" && row.attempts >= MAX_FAST_ATTEMPTS) {
      const age = input.now - Date.parse(row.updatedAt);
      if (Number.isFinite(age) && age < SLOW_RETRY_MS) continue;
    }
    if (row?.externalWorkoutId) actions.push({ type: "replace", item, row });
    else actions.push({ type: "create", item, row });
  }

  for (const row of input.pushed) {
    const key = sourceKey(row.kind, row.sourceId);
    if (wanted.has(key)) continue;
    if (!row.externalWorkoutId || row.date < input.today || input.doneOrStarted.has(key)) {
      actions.push({ type: "forget", row });
    } else {
      actions.push({ type: "remove", row });
    }
  }
  return actions;
}
