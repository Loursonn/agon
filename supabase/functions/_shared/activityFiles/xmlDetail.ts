/**
 * Détail des fichiers XML importés (TCX, GPX) : série point par point et, pour
 * le TCX, tours. Même scanner que `parseTcx` / `parseGpx` (xml.ts), mêmes noms
 * locaux d'extensions (préfixes retirés : `ns3:Speed` → `Speed`).
 *
 * Un GPX n'a ni tours ni chronomètre : `laps` vide et `timer` nul. Les points
 * sans heure sont ignorés (on ne peut pas les placer sur l'axe du temps).
 */
import { isoMillis, scanXml, xmlNumber, xmlTextFromBytes } from "./xml.ts";
import { sportFromLabel } from "./sports.ts";
import { type NormalizedActivity, type Sample, StreamBuilder, toStepsPerMinute, type WatchLap } from "./stream.ts";

interface PointAcc {
  ms: number | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
  dist: number | null;
  hr: number | null;
  cadence: number | null;
  speed: number | null;
  power: number | null;
}

const emptyPoint = (): PointAcc => ({
  ms: null,
  lat: null,
  lon: null,
  alt: null,
  dist: null,
  hr: null,
  cadence: null,
  speed: null,
  power: null,
});

interface LapAcc {
  startMs: number | null;
  timerS: number | null;
  distanceM: number | null;
  maxSpeed: number | null;
  avgHr: number | null;
  maxHr: number | null;
  cadence: number | null;
  trigger: string | null;
  intensity: string | null;
}

const TRIGGERS: Record<string, string> = {
  manual: "manual",
  distance: "distance",
  location: "position_lap",
  time: "time",
  heartrate: "heart_rate",
};

function finish(
  source: "tcx" | "gpx",
  points: PointAcc[],
  sportLabel: string | null,
  lapAccs: LapAcc[],
): NormalizedActivity {
  const timed = points.filter((p) => p.ms !== null) as Array<PointAcc & { ms: number }>;
  const firstLapMs = lapAccs.find((l) => l.startMs !== null)?.startMs ?? null;
  const t0Ms = timed.length > 0 ? Math.min(timed[0].ms, firstLapMs ?? Infinity) : firstLapMs;
  if (t0Ms === null) throw new Error("aucun point horodaté dans le fichier");

  const builder = new StreamBuilder();
  for (const p of timed) {
    const s: Sample = {
      t: (p.ms - t0Ms) / 1000,
      hr: p.hr,
      speed: p.speed,
      dist: p.dist,
      alt: p.alt,
      cadence: p.cadence,
      power: p.power,
      lat: p.lat,
      lon: p.lon,
    };
    builder.push(s);
  }
  const stream = builder.build();
  const lastT = stream.t.length > 0 ? stream.t[stream.t.length - 1] : 0;

  const laps: WatchLap[] = lapAccs.map((l, i) => {
    const startS = l.startMs !== null ? Math.max(0, Math.round((l.startMs - t0Ms) / 1000)) : 0;
    const next = lapAccs[i + 1]?.startMs;
    const endS = next !== null && next !== undefined
      ? Math.round((next - t0Ms) / 1000)
      : l.timerS !== null
      ? Math.max(lastT, startS + Math.round(l.timerS))
      : lastT;
    return {
      startS,
      endS: Math.max(startS, endS),
      trigger: l.trigger,
      intensity: l.intensity,
      watch: {
        timerS: l.timerS,
        elapsedS: null,
        distanceM: l.distanceM,
        avgSpeed: l.timerS && l.distanceM !== null ? l.distanceM / l.timerS : null,
        maxSpeed: l.maxSpeed,
        avgHr: l.avgHr,
        maxHr: l.maxHr,
        avgCadence: l.cadence,
        maxCadence: null,
        avgPower: null,
        maxPower: null,
        ascentM: null,
        descentM: null,
        minAltM: null,
        maxAltM: null,
      },
    };
  });

  return toStepsPerMinute({
    source,
    startedAtMs: t0Ms,
    utcOffsetS: null,
    sport: sportFromLabel(sportLabel),
    stream,
    laps,
    sets: [],
    splits: [],
    device: null,
    watchTimeInZone: [],
  });
}

/** Détail d'un TCX (première activité du fichier). */
export function decodeTcxDetail(bytes: Uint8Array): NormalizedActivity {
  const source = xmlTextFromBytes(bytes);
  const points: PointAcc[] = [];
  const laps: LapAcc[] = [];
  const stack: string[] = [];
  let activities = 0;
  let sport: string | null = null;
  let point: PointAcc | null = null;
  let lap: LapAcc | null = null;

  scanXml(source, {
    open(tag, attrs) {
      stack.push(tag);
      if (tag === "Activity") {
        activities++;
        if (activities === 1) sport = attrs.Sport ?? null;
      }
      if (activities !== 1) return;
      if (tag === "Lap") {
        lap = {
          startMs: isoMillis(attrs.StartTime),
          timerS: null,
          distanceM: null,
          maxSpeed: null,
          avgHr: null,
          maxHr: null,
          cadence: null,
          trigger: null,
          intensity: null,
        };
        laps.push(lap);
      } else if (tag === "Trackpoint") {
        point = emptyPoint();
      }
    },
    close(tag) {
      if (stack[stack.length - 1] === tag) stack.pop();
      else {
        const at = stack.lastIndexOf(tag);
        if (at >= 0) stack.length = at;
      }
      if (tag === "Trackpoint" && point) {
        points.push(point);
        point = null;
      } else if (tag === "Lap") {
        lap = null;
      }
    },
    text(value) {
      if (activities !== 1) return;
      const tag = stack[stack.length - 1];
      const parent = stack[stack.length - 2];
      if (point) {
        switch (tag) {
          case "Time":
            point.ms = isoMillis(value.trim());
            return;
          case "LatitudeDegrees":
            point.lat = xmlNumber(value);
            return;
          case "LongitudeDegrees":
            point.lon = xmlNumber(value);
            return;
          case "AltitudeMeters":
            point.alt = xmlNumber(value);
            return;
          case "DistanceMeters":
            point.dist = xmlNumber(value);
            return;
          case "Value":
            if (parent === "HeartRateBpm") point.hr = xmlNumber(value);
            return;
          case "Cadence":
          case "RunCadence":
            point.cadence ??= xmlNumber(value);
            return;
          case "Speed":
            point.speed = xmlNumber(value);
            return;
          case "Watts":
            point.power = xmlNumber(value);
            return;
        }
        return;
      }
      if (lap) {
        switch (tag) {
          case "TotalTimeSeconds":
            lap.timerS = xmlNumber(value);
            return;
          case "DistanceMeters":
            lap.distanceM = xmlNumber(value);
            return;
          case "MaximumSpeed":
            lap.maxSpeed = xmlNumber(value);
            return;
          case "Value":
            if (parent === "AverageHeartRateBpm") lap.avgHr = xmlNumber(value);
            if (parent === "MaximumHeartRateBpm") lap.maxHr = xmlNumber(value);
            return;
          case "Cadence":
            lap.cadence = xmlNumber(value);
            return;
          case "TriggerMethod":
            lap.trigger = TRIGGERS[value.trim().toLowerCase()] ?? null;
            return;
          case "Intensity":
            lap.intensity = value.trim().toLowerCase() === "resting" ? "rest" : "active";
            return;
        }
      }
    },
  });

  return finish("tcx", points, sport, laps);
}

/** Détail d'un GPX (toutes les traces, mises bout à bout dans l'ordre du temps). */
export function decodeGpxDetail(bytes: Uint8Array): NormalizedActivity {
  const source = xmlTextFromBytes(bytes);
  const points: PointAcc[] = [];
  const stack: string[] = [];
  let point: PointAcc | null = null;
  let inExtensions = false;
  let typeLabel: string | null = null;

  scanXml(source, {
    open(tag, attrs) {
      stack.push(tag);
      if (tag === "trkpt") {
        point = emptyPoint();
        point.lat = xmlNumber(attrs.lat);
        point.lon = xmlNumber(attrs.lon);
      } else if (tag === "extensions") {
        inExtensions = true;
      }
    },
    close(tag) {
      if (stack[stack.length - 1] === tag) stack.pop();
      else {
        const at = stack.lastIndexOf(tag);
        if (at >= 0) stack.length = at;
      }
      if (tag === "trkpt" && point) {
        points.push(point);
        point = null;
      } else if (tag === "extensions") {
        inExtensions = false;
      }
    },
    text(value) {
      const tag = stack[stack.length - 1];
      if (point) {
        switch (tag) {
          case "ele":
            point.alt = xmlNumber(value);
            return;
          case "time":
            point.ms = isoMillis(value.trim());
            return;
          case "hr":
          case "heartrate":
            if (inExtensions) point.hr = xmlNumber(value);
            return;
          case "cad":
          case "cadence":
            if (inExtensions) point.cadence = xmlNumber(value);
            return;
          case "power":
          case "watts":
            if (inExtensions) point.power = xmlNumber(value);
            return;
          case "speed":
            if (inExtensions) point.speed = xmlNumber(value);
            return;
        }
        return;
      }
      if (tag === "type" && stack.includes("trk") && !inExtensions) typeLabel ??= value.trim();
    },
  });

  points.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));
  return finish("gpx", points, typeLabel, []);
}
