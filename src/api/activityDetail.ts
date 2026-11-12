import type { QueryClient } from "@tanstack/react-query";
import { STREAM_MEASURES, type ActivityStream, type StrengthSet, type WatchLap } from "@shared/activityFiles/stream";
import type { IsoDay } from "@shared/domain/dates";
import { flattenPlannedSession, type ExpectedBlock, type PlanBlock, type PlanStep } from "@shared/domain/hyroxLaps";
import {
  buildActivityDetail,
  proposeDetailLaps,
  type ActivityDetail,
  type DetailLap,
  type LapOrigin,
  type LapStatus,
  type PlanLinkInfo,
} from "@/lib/activityDetail";
import { ApiError, db, unwrap, unwrapRows } from "./client";
import { getBoundsAt } from "./zoneModels";

export type { ActivityDetail, DetailLap, LapOrigin, LapStatus };
export { proposeDetailLaps };

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

// ── Lecture (à l'ouverture d'une séance, jamais dans une liste) ─────────────

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const col = (v: unknown): Array<number | null> | null => (Array.isArray(v) ? v.map(num) : null);

/** Colonne en base (snake_case) de chaque mesure de la série. */
const STREAM_COLUMN: Record<string, string> = { stepLen: "step_len" };

function toStream(r: Record<string, unknown>): ActivityStream {
  const s = { t: (col(r.t) ?? []).map((v) => v ?? 0), timer: col(r.timer) } as ActivityStream;
  for (const m of STREAM_MEASURES) s[m] = col(r[STREAM_COLUMN[m] ?? m]);
  return s;
}

type LapRow = {
  start_s: number; end_s: number; name: string | null; exercise_id: string | null; planned_block_ref: string | null;
  distance_override_m: unknown; reps: number | null; load_kg: unknown; origin: string; status: string; needs_review: boolean | null;
};

const fromLapRow = (r: LapRow): DetailLap => ({
  startS: r.start_s,
  endS: r.end_s,
  name: r.name,
  exerciseId: r.exercise_id,
  plannedBlockRef: r.planned_block_ref,
  distanceOverrideM: num(r.distance_override_m),
  reps: r.reps,
  loadKg: num(r.load_kg),
  origin: r.origin as LapOrigin,
  status: r.status as LapStatus,
  needsReview: r.needs_review ?? false,
});

type SetRow = {
  start_s: number | null; duration_s: unknown; reps: number | null; weight_kg: unknown; set_type: string | null;
  category: number[] | null; category_subtype: number[] | null;
};

const fromSetRow = (r: SetRow): StrengthSet => ({
  startS: r.start_s,
  durationS: num(r.duration_s),
  reps: r.reps,
  weightKg: num(r.weight_kg),
  setType: r.set_type === "active" || r.set_type === "rest" ? r.set_type : null,
  category: r.category ?? null,
  categorySubtype: r.category_subtype ?? null,
});

/** Séance prévue rattachée : nom, blocs attendus (HYROX / WOD / Classique) et retour de l'athlète. */
type PlannedInfo = { name: string | null; blocks: ExpectedBlock[] | null; rpe: number | null; comment: string | null };

async function plannedOf(kind: PlanLinkInfo["plannedKind"], id: string): Promise<PlannedInfo> {
  const none: PlannedInfo = { name: null, blocks: null, rpe: null, comment: null };
  if (kind === "energy") {
    const a = unwrap(
      await db().from("energy_session_assignments").select("energy_session_id, rpe_score, notes").eq("id", id).maybeSingle(),
      "séance prévue",
    );
    if (!a?.energy_session_id) return none;
    const feedback = { rpe: num(a.rpe_score), comment: a.notes?.trim() || null };
    const s = unwrap(
      await db().from("energy_sessions").select("name, format, intervals, classique_structure")
        .eq("id", a.energy_session_id).maybeSingle(),
      "séance prévue",
    );
    if (!s) return { ...none, ...feedback };
    const blocks = flattenPlannedSession({
      format: s.format,
      intervals: (s.intervals as PlanStep[] | null) ?? null,
      classique_structure: (s.classique_structure as { blocks: PlanBlock[] } | null) ?? null,
    });
    return { name: s.name ?? null, blocks: blocks.length ? blocks : null, ...feedback };
  }
  if (kind === "workout") {
    const w = unwrap(
      await db().from("workout_logs").select("session_name, rpe_score, notes").eq("id", id).maybeSingle(),
      "séance prévue",
    );
    return { name: w?.session_name ?? null, blocks: null, rpe: num(w?.rpe_score), comment: w?.notes?.trim() || null };
  }
  const t = unwrap(await db().from("test_sessions").select("title").eq("id", id).maybeSingle(), "test prévu");
  return { ...none, name: t?.title ?? null };
}

/**
 * Tout ce qu'affiche l'écran d'une séance : résumé, attribution, série
 * complète + allégée, métriques de la séance et de chaque tour, temps par
 * zone avec les bornes valides à SA date, séries de muscu, lien planning,
 * tours nommés d'après la séance prévue. Lève si l'activité est introuvable
 * (ou invisible pour l'utilisateur : RLS).
 */
export async function getActivityDetail(activityId: string): Promise<ActivityDetail> {
  const a = unwrap(
    await db().from("provider_activities")
      .select("id, athlete_id, source, sport, started_at, local_date, device_name, distance_m, duration_s, avg_hr, max_hr, imported_at, title")
      .eq("id", activityId).maybeSingle(),
    "séance",
  );
  if (!a) throw new ApiError("séance", { message: "séance introuvable" });

  const [streamRow, lapRows, setRows, linkRow, bounds] = await Promise.all([
    db().from("activity_streams").select("*").eq("activity_id", activityId).maybeSingle()
      .then((r) => unwrap(r, "série de la séance")),
    db().from("activity_laps")
      .select("start_s, end_s, name, exercise_id, planned_block_ref, distance_override_m, reps, load_kg, origin, status, needs_review")
      .eq("activity_id", activityId).order("position", { ascending: true })
      .then((r) => unwrapRows(r, "tours")),
    db().from("activity_sets")
      .select("start_s, duration_s, reps, weight_kg, set_type, category, category_subtype")
      .eq("activity_id", activityId).order("position", { ascending: true })
      .then((r) => unwrapRows(r, "séries de musculation")),
    db().from("activity_plan_links").select("id, planned_kind, planned_id, status")
      .eq("activity_id", activityId).in("status", ["auto", "confirmed"]).maybeSingle()
      .then((r) => unwrap(r, "lien avec le planning")),
    getBoundsAt(a.athlete_id, a.local_date as IsoDay),
  ]);

  let link: PlanLinkInfo | null = null;
  let plannedBlocks: ExpectedBlock[] | null = null;
  if (linkRow) {
    const kind = linkRow.planned_kind as PlanLinkInfo["plannedKind"];
    const p = await plannedOf(kind, linkRow.planned_id);
    link = {
      id: linkRow.id, plannedKind: kind, plannedId: linkRow.planned_id,
      status: linkRow.status as PlanLinkInfo["status"], plannedName: p.name,
      feedbackRpe: p.rpe, feedbackComment: p.comment,
    };
    plannedBlocks = p.blocks;
  }

  const s = streamRow as Record<string, unknown> | null;
  return buildActivityDetail({
    activity: {
      id: a.id, athleteId: a.athlete_id, source: a.source, sport: a.sport ?? (s?.sport as string | null) ?? null,
      startedAt: a.started_at, localDate: a.local_date, deviceName: a.device_name ?? null,
      distanceM: num(a.distance_m), durationS: num(a.duration_s), avgHr: num(a.avg_hr), maxHr: num(a.max_hr),
      importedAt: a.imported_at ?? null, title: a.title ?? null,
    },
    stream: s ? toStream(s) : null,
    watchLaps: Array.isArray(s?.watch_laps) ? (s.watch_laps as WatchLap[]) : [],
    laps: (lapRows as LapRow[]).map(fromLapRow),
    lapsVersion: num(s?.laps_version) ?? 0,
    lapsEdited: s?.laps_edited === true,
    sets: (setRows as SetRow[]).map(fromSetRow),
    bounds,
    link,
    plannedBlocks,
  });
}
