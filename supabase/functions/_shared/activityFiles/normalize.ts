/**
 * `normalizeActivity` : toutes les sources de détail d'activité → une seule
 * forme (`NormalizedActivity`, stream.ts).
 *
 * Sources :
 * - `garmin_json` : échantillons `activityDetails` de Garmin (`samples` + `laps`
 *   + `summary`), tels que stockés dans le bucket `provider-raw` ;
 * - `fit` : fichier FIT (Garmin `activityFiles`, COROS, import manuel) ;
 * - `tcx` / `gpx` : fichiers importés.
 *
 * Pur, sans réseau : importé par le navigateur (import manuel) et par les Edge
 * Functions (réception Garmin, synchro COROS, rattrapage).
 */
import { decodeFitDetail } from "./fitDetail.ts";
import { haversineM, isPlausibleFix } from "./geo.ts";
import { garminSport } from "../providers/garmin.ts";
import { type NormalizedActivity, StreamBuilder, toStepsPerMinute, type WatchLap } from "./stream.ts";
import { decodeGpxDetail, decodeTcxDetail } from "./xmlDetail.ts";

export type ActivitySource =
  | { kind: "fit"; bytes: Uint8Array }
  | { kind: "tcx"; bytes: Uint8Array }
  | { kind: "gpx"; bytes: Uint8Array }
  | {
    kind: "garmin_json";
    samples: Array<Record<string, unknown>>;
    laps?: Array<Record<string, unknown>> | null;
    summary?: Record<string, unknown> | null;
  };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Échantillons JSON Garmin (Activity API, `activityDetails.samples`). */
export function normalizeGarminSamples(
  samples: Array<Record<string, unknown>>,
  laps: Array<Record<string, unknown>> | null | undefined,
  summary: Record<string, unknown> | null | undefined,
): NormalizedActivity {
  const start = num(summary?.startTimeInSeconds) ??
    samples.reduce<number | null>((m, s) => {
      const t = num(s.startTimeInSeconds);
      return t === null ? m : m === null ? t : Math.min(m, t);
    }, null);
  if (start === null) throw new Error("échantillons Garmin sans horodatage");

  const sport = garminSport(summary?.activityType);
  const builder = new StreamBuilder();
  for (const s of samples) {
    const ts = num(s.startTimeInSeconds);
    if (ts === null) continue;
    builder.push({
      t: ts - start,
      timer: num(s.timerDurationInSeconds),
      hr: num(s.heartRate),
      speed: num(s.speedMetersPerSecond),
      dist: num(s.totalDistanceInMeters),
      alt: num(s.elevationInMeters),
      // `stepsPerMinute` = cadence d'UN pied (comme le FIT) ; ×2 plus bas.
      cadence: num(s.stepsPerMinute) ?? num(s.bikeCadenceInRPM) ?? num(s.swimCadenceInStrokesPerMinute),
      power: num(s.powerInWatts),
      lat: num(s.latitudeInDegree),
      lon: num(s.longitudeInDegree),
      temp: num(s.airTemperatureCelcius),
    });
  }
  const stream = builder.build();
  const lastT = stream.t.length ? stream.t[stream.t.length - 1] : num(summary?.durationInSeconds) ?? 0;

  // Les tours JSON ne portent que leur heure de départ : valeurs montre nulles.
  const starts = (laps ?? [])
    .map((l) => num(l.startTimeInSeconds))
    .filter((v): v is number => v !== null)
    .map((v) => Math.max(0, v - start))
    .sort((a, b) => a - b);
  const watchLaps: WatchLap[] = starts.map((s, i) => ({
    startS: s,
    endS: Math.max(s, i + 1 < starts.length ? starts[i + 1] : lastT),
    trigger: null,
    intensity: null,
    watch: null,
  }));

  const offset = num(summary?.startTimeOffsetInSeconds);
  return toStepsPerMinute({
    source: "garmin_json",
    startedAtMs: start * 1000,
    utcOffsetS: offset,
    sport,
    stream,
    laps: watchLaps,
    sets: [],
    splits: [],
    device: null,
    watchTimeInZone: [],
  });
}

/**
 * Distance cumulée reconstruite depuis le GPS quand la source n'en donne pas
 * (GPX). Segments à plus de 40 m/s ignorés (saut GPS), position (0,0) ignorée.
 */
export function fillDistanceFromGps(a: NormalizedActivity): NormalizedActivity {
  const { lat, lon, t } = a.stream;
  if (a.stream.dist || !lat || !lon) return a;
  const dist: Array<number | null> = [];
  let total = 0;
  let pLat: number | null = null;
  let pLon: number | null = null;
  let pT: number | null = null;
  let any = false;
  for (let i = 0; i < t.length; i++) {
    const la = lat[i];
    const lo = lon[i];
    if (isPlausibleFix(la, lo)) {
      if (pLat !== null && pLon !== null && pT !== null) {
        const leg = haversineM(pLat, pLon, la as number, lo as number);
        const dt = t[i] - pT;
        if (!(dt > 0 && leg / dt > 40)) total += leg;
      }
      pLat = la;
      pLon = lo;
      pT = t[i];
      any = true;
    }
    dist.push(any ? Math.round(total * 100) / 100 : null);
  }
  return { ...a, stream: { ...a.stream, dist: any ? dist : null } };
}

/** Point d'entrée unique. Lève si la source est illisible. */
export function normalizeActivity(source: ActivitySource): NormalizedActivity {
  switch (source.kind) {
    case "fit":
      return decodeFitDetail(source.bytes);
    case "tcx":
      return fillDistanceFromGps(decodeTcxDetail(source.bytes));
    case "gpx":
      return fillDistanceFromGps(decodeGpxDetail(source.bytes));
    case "garmin_json":
      return normalizeGarminSamples(source.samples, source.laps, source.summary);
  }
}
