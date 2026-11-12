import type { ImportActivity, NormalizedActivity } from "@shared/activityFiles/index.ts";

/**
 * Import de fichiers : ce que le navigateur envoie à la fusion en base
 * (`merge_provider_activities`), et comment il lit la réponse.
 *
 * Plus de tri « nouveau / doublon » ici (P42) : c'est la base qui décide,
 * sous verrou, si la sortie existe déjà et ce que la nouvelle source
 * complète. Deux règles locales ne peuvent pas voir ce qu'un autre onglet ou
 * la synchro Garmin vient d'écrire ; la base, si.
 */

/** Étiquette de provenance, gardée dans `provider_activities.sources`. */
export type ImportTag = "file" | "strava_archive" | "garmin_export";

/** Charge utile d'une sortie pour `merge_provider_activity`. */
export function mergePayload(act: ImportActivity): Record<string, unknown> {
  const raw = act.raw as Record<string, unknown> | null;
  return {
    external_id: act.externalId,
    started_at: act.startedAt,
    local_date: act.localDate,
    sport: act.sport,
    duration_s: act.durationS,
    distance_m: act.distanceM,
    elevation_gain_m: act.elevationGainM,
    avg_hr: act.avgHr,
    max_hr: act.maxHr,
    avg_pace_s_per_km: act.avgPaceSPerKm,
    calories: act.calories,
    details: act.details,
    raw,
    origin_quality: act.quality,
    title: act.extras?.title ?? null,
    description: act.extras?.description ?? null,
    rpe: act.extras?.rpe ?? null,
    gear: act.extras?.gear ?? null,
    commute: act.extras?.commute ?? null,
    strava_activity_id: act.extras?.stravaActivityId ?? null,
    // `ai_allowed` absent : posé en base (politique de la source, appareil).
  };
}

export type MergeStatus = "created" | "merged" | "unchanged" | "error";

export interface MergeResult {
  id?: string;
  status: MergeStatus;
  /** Qualité de la série déjà en base (0 = aucune) : `stream_quality_rank`. */
  streamRank: number;
  error?: string;
}

export function parseMergeResult(raw: unknown): MergeResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = r.status === "created" || r.status === "merged" || r.status === "unchanged" ? r.status : "error";
  return {
    id: typeof r.id === "string" ? r.id : undefined,
    status,
    streamRank: typeof r.stream_rank === "number" ? r.stream_rank : 0,
    error: typeof r.error === "string" ? r.error : undefined,
  };
}

/** Même ordre que `public.stream_quality_rank`. */
export function streamQualityRank(source: NormalizedActivity["source"] | string | null | undefined): number {
  switch (source) {
    case "fit": return 3;
    case "garmin_json":
    case "tcx": return 2;
    case "gpx": return 1;
    default: return 0;
  }
}

/** Envoyer la série ? Seulement si elle est meilleure que celle déjà rangée. */
export function wantsDetail(detail: NormalizedActivity | null, result: MergeResult): boolean {
  if (!detail || !result.id || result.status === "error") return false;
  return streamQualityRank(detail.source) > result.streamRank;
}

/** Compte rendu d'un dépôt : « X nouvelles · Y complétées · Z déjà complètes · N erreurs ». */
export interface ImportReport {
  created: number;
  merged: number;
  unchanged: number;
  /** Séries (courbes) ajoutées ou remplacées par une meilleure. */
  detailsSaved: number;
  /** Fichiers d'activité examinés. */
  files: number;
  /** Membres d'archive ignorés sans examen (profil, médias). */
  ignored: number;
  /** Fichiers illisibles et sorties refusées par la base. */
  rejected: Array<{ name: string; reason: string }>;
  /** Problème de lecture d'`activities.csv` (titres, RPE non importés). */
  csvError: string | null;
}

export const emptyReport = (): ImportReport => ({
  created: 0,
  merged: 0,
  unchanged: 0,
  detailsSaved: 0,
  files: 0,
  ignored: 0,
  rejected: [],
  csvError: null,
});

export function countResult(report: ImportReport, name: string, r: MergeResult): void {
  if (r.status === "error") report.rejected.push({ name, reason: r.error ?? "refusée par la base" });
  else report[r.status]++;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Résumé d'une ligne pour l'écran. */
export function reportSummary(r: ImportReport): string {
  const parts = [
    plural(r.created, "nouvelle", "nouvelles"),
    plural(r.merged, "complétée", "complétées"),
    plural(r.unchanged, "déjà complète", "déjà complètes"),
    plural(r.rejected.length, "erreur", "erreurs"),
  ];
  return parts.join(" · ");
}
