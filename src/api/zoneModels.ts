import type { QueryClient } from "@tanstack/react-query";
import type { IsoDay } from "@shared/domain/dates";
import { validBounds, type ZoneModelKind } from "@shared/domain/hrZones";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Modèles de zones de fréquence cardiaque (`hr_zone_models`) et résumé du
 * temps par zone de chaque activité (`activity_zone_summaries`).
 *
 * - `five` : lu dans les références `FCzone_*` (aucune ligne ici) ;
 * - `three` : SV1 / SV2 en bpm, saisis ou proposés par un test ;
 * - `custom` : N − 1 bornes.
 * Une séance utilise les bornes valides à SA date (`hr_zone_bounds_at`).
 * Écritures uniquement par RPC : la base vérifie qui a le droit.
 */

export const zoneModelKeys = {
  all: (aid: string) => ["zoneModels", aid] as const,
  list: (aid: string) => ["zoneModels", aid, "list"] as const,
  boundsAt: (aid: string, day: IsoDay) => ["zoneModels", aid, "boundsAt", day] as const,
  summaries: (aid: string, ids: readonly string[]) => ["zoneModels", aid, "summaries", ids.join(",")] as const,
};

/** Après un enregistrement ou une décision : modèles, bornes datées, résumés. */
export function invalidateZoneModels(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: zoneModelKeys.all(athleteId) }),
    // Charge YOXX (`loadKeys`) : les minutes sont classées avec ces zones.
    qc.invalidateQueries({ queryKey: ["load", athleteId] }),
  ]).then(() => undefined);
}

/** `replaced` : modèle plus ancien écarté par « Appliquer aussi aux séances passées » (gardé pour l'historique). */
export type ZoneModelStatus = "active" | "proposed" | "rejected" | "replaced";

export interface ZoneModelRow {
  id: string;
  kind: ZoneModelKind;
  bounds: number[];
  validFrom: IsoDay;
  status: ZoneModelStatus;
  origin: "manual" | "test";
  testResultId: string | null;
  createdBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export async function getZoneModels(athleteId: string): Promise<ZoneModelRow[]> {
  const rows = unwrapRows(
    await db()
      .from("hr_zone_models")
      .select("id, kind, bounds, valid_from, status, origin, test_result_id, created_by, decided_by, decided_at, created_at")
      .eq("athlete_id", athleteId)
      .order("valid_from", { ascending: false })
      .order("created_at", { ascending: false }),
    "modèles de zones",
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ZoneModelKind,
    bounds: r.bounds ?? [],
    validFrom: r.valid_from as IsoDay,
    status: r.status as ZoneModelStatus,
    origin: r.origin as "manual" | "test",
    testResultId: r.test_result_id,
    createdBy: r.created_by,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  }));
}

export interface BoundsAt {
  /** `null` pour le modèle `five` (lu dans les références). */
  modelId: string | null;
  kind: ZoneModelKind;
  bounds: number[];
}

/** Bornes valides pour l'athlète à une date ; `null` = aucune zone connue (« — »). */
export async function getBoundsAt(athleteId: string, day: IsoDay): Promise<BoundsAt | null> {
  const rows = unwrap(await db().rpc("hr_zone_bounds_at", { p_athlete: athleteId, p_day: day }), "bornes de zones") ?? [];
  const r = rows[0];
  if (!r) return null;
  const bounds = validBounds(r.bounds);
  return bounds ? { modelId: r.model_id ?? null, kind: r.kind as ZoneModelKind, bounds } : null;
}

/** Nouveau modèle actif, enregistré par le coach (référent ou co-coach). Lève si les bornes sont incohérentes. */
export async function saveZoneModel(
  athleteId: string,
  kind: ZoneModelKind,
  bounds: readonly number[],
  validFrom: IsoDay,
): Promise<string> {
  const ok = kind === "five" ? [] : validBounds(bounds);
  if (!ok || (kind === "three" && ok.length !== 2)) {
    throw new ApiError("modèle de zones", { message: "bornes incohérentes" });
  }
  const id = unwrap(
    await db().rpc("save_hr_zone_model", { p_athlete: athleteId, p_kind: kind, p_bounds: ok, p_valid_from: validFrom }),
    "modèle de zones",
  );
  if (!id) throw new ApiError("modèle de zones", { message: "aucun identifiant renvoyé" });
  return id;
}

/** Le coach valide ou refuse une proposition issue d'un test. */
export async function decideZoneModel(id: string, accept: boolean): Promise<void> {
  check(await db().rpc("decide_hr_zone_model", { p_id: id, p_accept: accept }), "décision sur les zones");
}

/**
 * « Appliquer aussi aux séances passées » : le modèle vaut depuis toujours,
 * les plus anciens passent à `replaced` et les temps par zone sont recalculés.
 */
export async function applyZoneModelToPast(id: string): Promise<void> {
  check(await db().rpc("apply_hr_zone_model_to_past", { p_id: id }), "zones sur les séances passées");
}

export interface ZoneSummary {
  activityId: string;
  kind: ZoneModelKind;
  bounds: number[];
  /** Secondes par zone (index 0 = zone 1). */
  seconds: number[];
  noHrS: number;
}

/** Résumés stockés (planning, semaine). Activité absente = pas de FC ou pas de bornes. */
export async function getZoneSummaries(athleteId: string, activityIds: readonly string[]): Promise<ZoneSummary[]> {
  if (activityIds.length === 0) return [];
  const rows = unwrapRows(
    await db()
      .from("activity_zone_summaries")
      .select("activity_id, kind, bounds, seconds, no_hr_s")
      .eq("athlete_id", athleteId)
      .in("activity_id", [...activityIds]),
    "temps par zone",
  );
  return rows.map((r) => ({
    activityId: r.activity_id,
    kind: r.kind as ZoneModelKind,
    bounds: r.bounds ?? [],
    seconds: r.seconds ?? [],
    noHrS: r.no_hr_s ?? 0,
  }));
}
