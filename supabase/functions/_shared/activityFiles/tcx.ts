/**
 * Décodeur TCX (Training Center XML).
 *
 * C'est le format que Garmin Connect et beaucoup d'exportateurs produisent, et
 * celui qui comble le trou d'historique de l'API Garmin : son programme
 * développeur ne donne accès qu'aux activités *postérieures* à l'autorisation,
 * donc tout ce que l'athlète a couru avant doit entrer par un fichier.
 *
 * Deux différences de fond avec un FIT, qui se retrouvent dans `details` :
 *  - le TCX n'a pas de dénivelé total. Il est donc reconstitué depuis les
 *    altitudes des points, ce qui n'est pas la même grandeur que le chiffre
 *    barométrique d'une montre. Le signaler évite qu'on compare les deux.
 *  - sa durée est `TotalTimeSeconds` par tour, qui exclut les pauses — comme
 *    `total_timer_time` en FIT, et contrairement au GPX. C'est volontaire :
 *    c'est le temps en mouvement qui donne une allure exploitable.
 */
import { ElevationTracker, TrackDistance } from "./geo.ts";
import { sportFromLabel } from "./sports.ts";
import {
  contentFingerprint,
  localDateOf,
  paceFrom,
  type ParsedActivity,
  type ParseResult,
} from "./types.ts";
import {
  isoMillis,
  isoOffsetSeconds,
  scanXml,
  xmlNumber,
  xmlTextFromBytes,
} from "./xml.ts";

/** Au-delà, les tours ne sont plus conservés dans `raw` : voir `parseTcx`. */
const MAX_RAW_LAPS = 200;

interface LapRaw {
  startTime: string | null;
  totalTimeS: number | null;
  distanceM: number | null;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  maxSpeedMs: number | null;
  intensity: string | null;
}

function emptyLap(startTime: string | null): LapRaw {
  return {
    startTime,
    totalTimeS: null,
    distanceM: null,
    calories: null,
    avgHr: null,
    maxHr: null,
    maxSpeedMs: null,
    intensity: null,
  };
}

interface ActivityRaw {
  sportLabel: string | null;
  id: string | null;
  notes: string | null;
  creator: string | null;
  laps: LapRaw[];
  elevation: ElevationTracker;
  distance: TrackDistance;
  firstMs: number | null;
  lastMs: number | null;
  firstTimeIso: string | null;
  maxPointDistanceM: number | null;
  pointCount: number;
  hrSum: number;
  hrCount: number;
  hrMax: number | null;
}

function emptyActivity(sportLabel: string | null): ActivityRaw {
  return {
    sportLabel,
    id: null,
    notes: null,
    creator: null,
    laps: [],
    elevation: new ElevationTracker(),
    distance: new TrackDistance(),
    firstMs: null,
    lastMs: null,
    firstTimeIso: null,
    maxPointDistanceM: null,
    pointCount: 0,
    hrSum: 0,
    hrCount: 0,
    hrMax: null,
  };
}

/** Fréquence cardiaque gardée seulement si elle est physiologiquement possible. */
function hr(value: number | null): number | null {
  return value !== null && value >= 20 && value <= 250 ? Math.round(value) : null;
}

/** Somme des valeurs présentes, ou `null` si aucune ne l'est. */
function sumOrNull(values: Array<number | null>): number | null {
  let total = 0;
  let seen = false;
  for (const v of values) {
    if (v === null) continue;
    total += v;
    seen = true;
  }
  return seen ? total : null;
}

/**
 * Moyenne des tours, pondérée par leur durée.
 *
 * Une séance de 10 × 400 m a onze tours : dix d'une minute trente et un de
 * quarante minutes d'échauffement. La moyenne arithmétique de leurs
 * fréquences cardiaques donnerait presque le poids de l'échauffement à chaque
 * répétition, et une moyenne plus basse que la réalité.
 */
function weightedMean(laps: LapRaw[], pick: (l: LapRaw) => number | null): number | null {
  let sum = 0;
  let weight = 0;
  let plainSum = 0;
  let plainCount = 0;
  for (const lap of laps) {
    const value = pick(lap);
    if (value === null) continue;
    plainSum += value;
    plainCount++;
    const w = lap.totalTimeS;
    if (w !== null && w > 0) {
      sum += value * w;
      weight += w;
    }
  }
  if (weight > 0) return sum / weight;
  return plainCount > 0 ? plainSum / plainCount : null;
}

/**
 * Normalise un TCX en activités.
 *
 * Un fichier peut contenir plusieurs `<Activity>` — c'est le cas des exports
 * groupés et des enchaînements multisport. Chacune devient une activité à
 * part, parce que fusionner une heure de vélo et vingt minutes de course en une
 * ligne produirait une allure moyenne qui ne décrit rien.
 */
export async function parseTcx(bytes: Uint8Array, name = "activité.tcx"): Promise<ParseResult> {
  const rejected: Array<{ name: string; reason: string }> = [];

  let source: string;
  try {
    source = xmlTextFromBytes(bytes);
  } catch (e) {
    return {
      activities: [],
      rejected: [{ name, reason: `fichier illisible (${e instanceof Error ? e.message : String(e)})` }],
    };
  }

  const collected: ActivityRaw[] = [];
  let root: string | null = null;

  // État de lecture. Des drapeaux plutôt qu'un chemin complet : `DistanceMeters`
  // et `Value` existent à deux niveaux différents et ne veulent pas dire la
  // même chose, c'est le contexte qui les départage.
  const stack: string[] = [];
  let act: ActivityRaw | null = null;
  let lap: LapRaw | null = null;
  let inTrackpoint = false;
  let inCreator = false;
  let inPosition = false;
  let hrSlot: "avg" | "max" | "point" | null = null;

  let pointLat: number | null = null;
  let pointLon: number | null = null;
  let pointAlt: number | null = null;
  let pointMs: number | null = null;
  let pointIso: string | null = null;
  let pointHr: number | null = null;

  try {
    scanXml(source, {
      open(tag, attrs) {
        stack.push(tag);
        root ??= tag;

        switch (tag) {
          case "Activity": {
            const fresh = emptyActivity(attrs.Sport ?? null);
            act = fresh;
            collected.push(fresh);
            return;
          }
          case "Lap":
            if (act !== null) lap = emptyLap(attrs.StartTime ?? null);
            return;
          case "Trackpoint":
            inTrackpoint = true;
            pointLat = null;
            pointLon = null;
            pointAlt = null;
            pointMs = null;
            pointIso = null;
            pointHr = null;
            return;
          case "Track":
            /*
              Un `<Track>` nouveau est une reprise d'enregistrement. Sans
              coupure, le dernier point du précédent serait relié au premier du
              suivant : une corde droite qui n'a pas été parcourue, et une
              marche d'altitude comptée comme une montée.
            */
            act?.distance.breakSegment();
            act?.elevation.breakSegment();
            return;
          case "Creator":
            inCreator = true;
            return;
          case "Position":
            inPosition = true;
            return;
          case "AverageHeartRateBpm":
            hrSlot = "avg";
            return;
          case "MaximumHeartRateBpm":
            hrSlot = "max";
            return;
          case "HeartRateBpm":
            hrSlot = "point";
            return;
        }
      },

      close(tag) {
        // Fermeture dépareillée (fichier tronqué recollé) : on se replace sur
        // la balise nommée plutôt que de décaler toute la pile.
        if (stack[stack.length - 1] === tag) stack.pop();
        else {
          const at = stack.lastIndexOf(tag);
          if (at >= 0) stack.length = at;
        }

        switch (tag) {
          case "Activity":
            act = null;
            return;
          case "Lap": {
            const current = act;
            const done = lap;
            if (current !== null && done !== null) current.laps.push(done);
            lap = null;
            return;
          }
          case "Trackpoint": {
            inTrackpoint = false;
            const a = act;
            if (a === null) return;
            a.pointCount++;
            a.distance.add(pointLat, pointLon, pointMs);
            a.elevation.add(pointAlt);
            if (pointMs !== null) {
              if (a.firstMs === null || pointMs < a.firstMs) {
                a.firstMs = pointMs;
                a.firstTimeIso = pointIso;
              }
              if (a.lastMs === null || pointMs > a.lastMs) a.lastMs = pointMs;
            }
            const beat = hr(pointHr);
            if (beat !== null) {
              a.hrSum += beat;
              a.hrCount++;
              if (a.hrMax === null || beat > a.hrMax) a.hrMax = beat;
            }
            return;
          }
          case "Creator":
            inCreator = false;
            return;
          case "Position":
            inPosition = false;
            return;
          case "AverageHeartRateBpm":
          case "MaximumHeartRateBpm":
          case "HeartRateBpm":
            hrSlot = null;
            return;
        }
      },

      text(value) {
        const a = act;
        const l = lap;
        if (a === null) return;
        const tag = stack[stack.length - 1];
        if (!tag) return;

        switch (tag) {
          case "Id":
            // `<Id>` d'une activité est son horodatage de début. Le premier
            // gagne : un TCX groupé en a un par activité.
            a.id ??= value.trim();
            return;
          case "Notes":
            a.notes ??= value.trim();
            return;
          case "Name":
            if (inCreator) a.creator ??= value.trim();
            return;
          case "Value": {
            const beats = xmlNumber(value);
            if (hrSlot === "point") pointHr = beats;
            else if (hrSlot === "avg" && l !== null) l.avgHr = beats;
            else if (hrSlot === "max" && l !== null) l.maxHr = beats;
            return;
          }
          case "Time":
            if (inTrackpoint) {
              pointIso = value.trim();
              pointMs = isoMillis(pointIso);
            }
            return;
          case "AltitudeMeters":
            if (inTrackpoint) pointAlt = xmlNumber(value);
            return;
          case "LatitudeDegrees":
            if (inPosition) pointLat = xmlNumber(value);
            return;
          case "LongitudeDegrees":
            if (inPosition) pointLon = xmlNumber(value);
            return;
          case "DistanceMeters": {
            const meters = xmlNumber(value);
            if (inTrackpoint) {
              /*
                Dans un point, `DistanceMeters` est cumulé depuis le début de
                l'activité. On en garde le maximum : il sert de repli quand les
                tours ne portent pas de distance, ce qui arrive sur les TCX
                produits par les simulateurs d'intérieur.
              */
              if (meters !== null && (a.maxPointDistanceM === null || meters > a.maxPointDistanceM)) {
                a.maxPointDistanceM = meters;
              }
            } else if (l !== null) l.distanceM = meters;
            return;
          }
          case "TotalTimeSeconds":
            if (l !== null) l.totalTimeS = xmlNumber(value);
            return;
          case "Calories":
            if (l !== null) l.calories = xmlNumber(value);
            return;
          case "MaximumSpeed":
            if (l !== null) l.maxSpeedMs = xmlNumber(value);
            return;
          case "Intensity":
            if (l !== null) l.intensity = value.trim();
            return;
        }
      },
    });
  } catch (e) {
    return {
      activities: [],
      rejected: [{ name, reason: `XML invalide : ${e instanceof Error ? e.message : String(e)}` }],
    };
  }

  if (collected.length === 0) {
    /*
      Message explicite sur la racine : un athlète qui dépose un dossier
      mélange GPX et TCX, et « ce fichier est un GPX » se comprend tout seul,
      là où « aucune activité » laisse croire que le fichier est vide.
    */
    const reason = root === "gpx"
      ? "racine <gpx> : ce fichier est un GPX, pas un TCX"
      : root === null
      ? "document vide"
      : `aucune <Activity> dans le fichier (racine <${root}>)`;
    return { activities: [], rejected: [{ name, reason }] };
  }

  const fingerprint = await contentFingerprint(bytes, "tcx");
  const activities: ParsedActivity[] = [];

  for (const [index, a] of collected.entries()) {
    const startIso = a.id ?? a.laps.find((l) => l.startTime)?.startTime ?? a.firstTimeIso;
    const startedAtMs = isoMillis(startIso);
    if (startedAtMs === null) {
      rejected.push({
        name,
        reason: `activité ${index + 1} sans horodatage de début exploitable`,
      });
      continue;
    }

    /*
      Décalage horaire : celui que porte le fichier, et rien d'autre. Beaucoup
      de TCX n'écrivent que des `Z`, donc aucune information de fuseau ; on
      retient alors UTC et on le dit dans `details`. La tentation serait de
      prendre le fuseau de l'appareil qui fait l'import, mais il serait faux
      pour un voyage et surtout différent entre le navigateur et une Edge
      Function — soit deux jours locaux pour le même fichier.
    */
    const offsetS = startIso ? isoOffsetSeconds(startIso) : null;

    const lapDuration = sumOrNull(a.laps.map((l) => l.totalTimeS));
    const elapsedS = a.firstMs !== null && a.lastMs !== null
      ? Math.round((a.lastMs - a.firstMs) / 1000)
      : null;
    const durationRaw = lapDuration ?? elapsedS;
    const durationS = durationRaw !== null && durationRaw > 0 ? Math.round(durationRaw) : null;

    const lapDistance = sumOrNull(a.laps.map((l) => l.distanceM));
    const trackDistance = a.distance.meters > 0 ? a.distance.meters : null;
    const distanceSource = lapDistance !== null && lapDistance > 0
      ? "tours"
      : a.maxPointDistanceM !== null && a.maxPointDistanceM > 0
      ? "points cumulés"
      : trackDistance !== null
      ? "calculée depuis les positions"
      : null;
    const distanceRaw = lapDistance !== null && lapDistance > 0
      ? lapDistance
      : a.maxPointDistanceM !== null && a.maxPointDistanceM > 0
      ? a.maxPointDistanceM
      : trackDistance;
    const distanceM = distanceRaw !== null && distanceRaw >= 0
      ? Math.round(distanceRaw * 100) / 100
      : null;

    const lapAvgHr = hr(weightedMean(a.laps, (l) => l.avgHr));
    const pointAvgHr = a.hrCount > 0 ? hr(a.hrSum / a.hrCount) : null;
    const lapMaxHr = hr(
      a.laps.reduce<number | null>(
        (max, l) => (l.maxHr !== null && (max === null || l.maxHr > max) ? l.maxHr : max),
        null,
      ),
    );

    activities.push({
      // Plusieurs activités dans un même fichier partagent son empreinte : le
      // rang les distingue sans casser la déduplication par contenu.
      externalId: collected.length > 1 ? `${fingerprint}#${index + 1}` : fingerprint,
      startedAt: new Date(startedAtMs).toISOString(),
      localDate: localDateOf(startedAtMs, offsetS ?? 0),
      sport: sportFromLabel(a.sportLabel),
      durationS,
      distanceM,
      elevationGainM: a.elevation.empty ? null : a.elevation.gainM,
      avgHr: lapAvgHr ?? pointAvgHr,
      maxHr: lapMaxHr ?? a.hrMax,
      avgPaceSPerKm: paceFrom(distanceM, durationS),
      calories: sumOrNull(a.laps.map((l) => l.calories)),
      details: {
        lapCount: a.laps.length,
        trackpointCount: a.pointCount,
        elapsedS,
        descentM: a.elevation.empty ? null : a.elevation.lossM,
        // Deux chiffres qu'un FIT porterait tels quels et qu'on reconstitue
        // ici : dire comment on les a obtenus est le seul moyen de comprendre
        // un écart avec ce qu'affiche la montre.
        elevationSource: a.elevation.empty ? null : "calculé depuis les altitudes",
        distanceSource,
        durationSource: lapDuration !== null ? "somme des tours (hors pauses)" : "temps écoulé",
        avgHrSource: lapAvgHr !== null
          ? "moyenne des tours pondérée par leur durée"
          : pointAvgHr !== null
          ? "moyenne des points"
          : null,
        localDateSource: offsetS !== null
          ? "décalage porté par le fichier"
          : "UTC, le fichier ne donne pas de fuseau",
        skippedLegs: a.distance.skippedLegs,
        activityIndex: index + 1,
        activityCount: collected.length,
      },
      raw: {
        format: "tcx",
        fileName: name,
        sportLabel: a.sportLabel,
        id: a.id,
        notes: a.notes,
        creator: a.creator,
        utcOffsetS: offsetS,
        startIso,
        /*
          Les tours tels que lus. Plafonnés : une séance de fractionné en
          contient quelques dizaines, mais un simulateur d'intérieur peut en
          écrire des milliers, et la colonne `raw` n'est pas un lieu pour
          stocker un fichier entier.
        */
        laps: a.laps.slice(0, MAX_RAW_LAPS),
        lapsTruncated: a.laps.length > MAX_RAW_LAPS,
      },
    });
  }

  return { activities, rejected };
}

/** Vrai si le contenu ressemble à un TCX. Décidé sur la racine, pas l'extension. */
export function looksLikeTcx(bytes: Uint8Array): boolean {
  const head = xmlTextFromBytes(bytes.subarray(0, 2048));
  return /<\s*(\w+:)?TrainingCenterDatabase[\s>]/i.test(head);
}
