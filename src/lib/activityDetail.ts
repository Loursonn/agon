import type { ActivityStream, StrengthSet, WatchLap } from "@shared/activityFiles/stream";
import { timeInZones, type TimeInZones, type ZoneModelKind } from "@shared/domain/hrZones";
import {
  lapsForActivity,
  proposeLaps,
  type ExpectedBlock,
  type ProposedLap,
} from "@shared/domain/hyroxLaps";
import {
  activityMetrics,
  lapMetrics,
  smoothedAltitude,
  type LapMetrics,
  type MetricsContext,
} from "@shared/domain/lapMetrics";
import { downsampleStream, DISPLAY_MAX_POINTS } from "./streamDisplay";

/**
 * Détail d'une séance de montre, assemblé à partir des lignes lues en base
 * (`src/api/activityDetail.ts`). Pur : tout ce que l'écran P40 affiche.
 */

export type LapOrigin = "watch" | "agon_proposal" | "manual";
export type LapStatus = "proposed" | "validated";

/** Un tour, enregistré ou proposé (bornes en secondes depuis le départ). */
export interface DetailLap {
  startS: number;
  endS: number;
  name: string | null;
  exerciseId: string | null;
  plannedBlockRef: string | null;
  distanceOverrideM: number | null;
  reps: number | null;
  loadKg: number | null;
  origin: LapOrigin;
  status: LapStatus;
  needsReview: boolean;
}

export interface DetailLapWithMetrics extends DetailLap {
  metrics: LapMetrics;
}

export interface ActivitySummaryInput {
  id: string;
  athleteId: string;
  source: string;
  sport: string | null;
  startedAt: string;
  localDate: string;
  deviceName: string | null;
  /** Résumé du fournisseur : affiché quand la série n'est pas (encore) là. */
  distanceM?: number | null;
  durationS?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  /** Arrivée dans Agon (« Synchronisée à 19 h 26 »). */
  importedAt?: string | null;
  /** Nom donné à la sortie (Strava, fichier), à défaut de séance prévue. */
  title?: string | null;
}

export interface PlanLinkInfo {
  id: string;
  plannedKind: "energy" | "workout" | "test";
  plannedId: string;
  status: "auto" | "confirmed";
  /** Nom de la séance prévue (« HYROX simulation »), si connu. */
  plannedName: string | null;
  /** Retour de l'athlète sur la séance prévue (RPE 1-10 et commentaire), si saisi. */
  feedbackRpe?: number | null;
  feedbackComment?: string | null;
}

export interface ActivityDetailInput {
  activity: ActivitySummaryInput;
  /** `null` : aucune série reçue (résumé seul). */
  stream: ActivityStream | null;
  watchLaps: readonly WatchLap[];
  laps: readonly DetailLap[];
  lapsVersion: number;
  lapsEdited: boolean;
  sets: readonly StrengthSet[];
  bounds: { modelId: string | null; kind: ZoneModelKind; bounds: number[] } | null;
  link: PlanLinkInfo | null;
  /** Blocs attendus de la séance prévue rattachée (HYROX / WOD / Classique). */
  plannedBlocks: readonly ExpectedBlock[] | null;
}

export interface ActivityDetail {
  activity: ActivitySummaryInput;
  /** « Garmin Forerunner 265 », « COROS », « Import fichier »… (attribution obligatoire). */
  attribution: string;
  /** Série complète : recalcul des métriques après modification des tours. */
  stream: ActivityStream | null;
  /** Série allégée (≤ ~3 000 points, pics conservés) pour les graphiques. */
  display: ActivityStream | null;
  total: LapMetrics | null;
  zones: TimeInZones | null;
  bounds: ActivityDetailInput["bounds"];
  laps: DetailLapWithMetrics[];
  lapsVersion: number;
  lapsEdited: boolean;
  /** Tours nommés d'après la séance prévue, à valider (rien n'est encore enregistré). */
  lapsNamedFromPlan: boolean;
  /** Une proposition de découpage peut être calculée (`proposeDetailLaps`). */
  proposalAvailable: boolean;
  sets: StrengthSet[];
  link: PlanLinkInfo | null;
  plannedBlocks: readonly ExpectedBlock[] | null;
  /** Tours d'origine de la montre (« Revenir aux tours de la montre »). */
  watchLaps: WatchLap[];
}

const PROVIDER_LABEL: Record<string, string> = { garmin: "Garmin", coros: "COROS", garmin_export: "Garmin" };

/** Attribution affichée avec chaque activité (règle Garmin : « Garmin [appareil] »). */
export function attributionOf(source: string, deviceName: string | null): string {
  const brand = PROVIDER_LABEL[source];
  if (!brand) {
    if (source !== "file_import" && source !== "file" && source !== "manual_file") return source;
    const d = deviceName?.trim();
    return d && d.toLowerCase() !== "unknown" ? `Import fichier · ${d}` : "Import fichier";
  }
  const dev = deviceName?.trim();
  if (!dev || dev.toLowerCase() === "unknown") return brand;
  return dev.toLowerCase().startsWith(brand.toLowerCase()) ? dev : `${brand} ${dev}`;
}

const toDetailLap = (l: ProposedLap): DetailLap => ({ ...l });

/** Métriques de chaque tour : valeurs de la montre si le tour est celui de la montre, sinon calculées. */
export function lapsWithMetrics(
  stream: ActivityStream | null,
  laps: readonly DetailLap[],
  ctx: MetricsContext,
  blocks: readonly ExpectedBlock[] | null,
): DetailLapWithMetrics[] {
  if (!stream) return [];
  const kindOf = new Map((blocks ?? []).map((b) => [b.ref, b.kind]));
  const full: MetricsContext = { ...ctx, smoothedAlt: ctx.smoothedAlt ?? smoothedAltitude(stream) };
  return laps.map((l) => ({
    ...l,
    metrics: lapMetrics(
      stream,
      {
        startS: l.startS,
        endS: l.endS,
        distanceOverrideM: l.distanceOverrideM,
        isStation: l.plannedBlockRef ? kindOf.get(l.plannedBlockRef) === "station" : false,
      },
      full,
    ),
  }));
}

export function buildActivityDetail(input: ActivityDetailInput): ActivityDetail {
  const { activity, stream, bounds } = input;
  const b = bounds?.bounds ?? null;
  const ctx: MetricsContext = {
    sport: activity.sport,
    bounds: b,
    watchLaps: input.watchLaps,
    smoothedAlt: stream ? smoothedAltitude(stream) : null,
  };

  // Tours jamais retouchés + séance prévue : nommés d'après les blocs (à valider).
  let laps = input.laps;
  let named = false;
  let proposalAvailable = false;
  if (!input.lapsEdited && input.plannedBlocks?.length) {
    const watchShaped: WatchLap[] = input.laps.map((l) => ({
      startS: l.startS, endS: l.endS, trigger: null, intensity: null, watch: null,
    }));
    const r = lapsForActivity(watchShaped, input.plannedBlocks);
    named = r.named;
    proposalAvailable = r.proposalAvailable && stream !== null;
    if (r.named) laps = r.laps.map((l, i) => ({ ...toDetailLap(l), origin: input.laps[i].origin }));
  } else if (input.plannedBlocks?.length && stream) {
    proposalAvailable = true;
  }

  return {
    activity,
    attribution: attributionOf(activity.source, activity.deviceName),
    stream,
    display: stream ? downsampleStream(stream, DISPLAY_MAX_POINTS) : null,
    total: stream ? activityMetrics(stream, ctx) : null,
    zones: stream ? timeInZones(stream, b) : null,
    bounds,
    laps: lapsWithMetrics(stream, laps, ctx, input.plannedBlocks),
    lapsVersion: input.lapsVersion,
    lapsEdited: input.lapsEdited,
    lapsNamedFromPlan: named,
    proposalAvailable,
    sets: [...input.sets],
    link: input.link,
    plannedBlocks: input.plannedBlocks,
    watchLaps: [...input.watchLaps],
  };
}

/**
 * Métriques recalculées en direct pendant le mode « Modifier les tours » :
 * mêmes règles qu'à la lecture (valeurs de la montre si le tour est le sien).
 */
export function recomputeLaps(
  detail: Pick<ActivityDetail, "stream" | "activity" | "bounds" | "watchLaps" | "plannedBlocks">,
  laps: readonly DetailLap[],
): DetailLapWithMetrics[] {
  if (!detail.stream) return [];
  return lapsWithMetrics(
    detail.stream,
    laps,
    { sport: detail.activity.sport, bounds: detail.bounds?.bounds ?? null, watchLaps: detail.watchLaps, smoothedAlt: null },
    detail.plannedBlocks,
  );
}

/** Découpage proposé par Agon d'après la série et la séance prévue (à enregistrer avec `resetLapsToProposal`). */
export function proposeDetailLaps(detail: Pick<ActivityDetail, "stream" | "plannedBlocks">): DetailLap[] {
  if (!detail.stream || !detail.plannedBlocks?.length) return [];
  return proposeLaps(detail.stream, detail.plannedBlocks).map(toDetailLap);
}
