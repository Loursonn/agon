/**
 * Décodeur GPX.
 *
 * C'est le format que Strava met dans ses archives d'export, et le plus pauvre
 * des trois : il décrit une suite de points et rien d'autre. Aucun total, aucun
 * temps de chronomètre, aucune calorie. Tout ce qui est affiché à partir d'un
 * GPX est donc *calculé* — et comme les chiffres de la montre pour la même
 * sortie seront différents, chaque agrégat dit dans `details` d'où il vient.
 *
 * Les deux écarts à connaître, parce qu'ils ne sont pas des bugs :
 *  - la durée est le temps écoulé entre le premier et le dernier point, pauses
 *    comprises. Un FIT donnerait `total_timer_time`, qui les exclut. Sur une
 *    séance fractionnée avec récupérations à l'arrêt, l'écart atteint vingt
 *    minutes. Il n'existe aucun moyen fiable de distinguer une pause d'un
 *    simple échantillonnage espacé : l'enregistrement intelligent de Strava et
 *    de Garmin laisse passer trente secondes entre deux points en pleine
 *    course.
 *  - le dénivelé est reconstitué depuis les altitudes des points, avec un seuil
 *    anti-bruit (voir `geo.ts`). Ce n'est pas la mesure barométrique d'une
 *    montre.
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

interface TrackRaw {
  name: string | null;
  typeLabel: string | null;
  distance: TrackDistance;
  elevation: ElevationTracker;
  firstMs: number | null;
  lastMs: number | null;
  firstTimeIso: string | null;
  pointCount: number;
  segmentCount: number;
  hrSum: number;
  hrCount: number;
  hrMax: number | null;
  cadenceSum: number;
  cadenceCount: number;
  powerSum: number;
  powerCount: number;
}

function emptyTrack(): TrackRaw {
  return {
    name: null,
    typeLabel: null,
    distance: new TrackDistance(),
    elevation: new ElevationTracker(),
    firstMs: null,
    lastMs: null,
    firstTimeIso: null,
    pointCount: 0,
    segmentCount: 0,
    hrSum: 0,
    hrCount: 0,
    hrMax: null,
    cadenceSum: 0,
    cadenceCount: 0,
    powerSum: 0,
    powerCount: 0,
  };
}

/** Fréquence cardiaque gardée seulement si elle est physiologiquement possible. */
function hr(value: number | null): number | null {
  return value !== null && value >= 20 && value <= 250 ? Math.round(value) : null;
}

/**
 * Normalise un GPX en activités.
 *
 * Un `<trk>` par activité. Un fichier peut en contenir plusieurs — c'est rare
 * en export d'activité, courant dans les fichiers d'itinéraires fusionnés — et
 * chacun devient une ligne.
 */
export async function parseGpx(bytes: Uint8Array, name = "activité.gpx"): Promise<ParseResult> {
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

  const collected: TrackRaw[] = [];
  let root: string | null = null;
  let creator: string | null = null;
  let metadataTimeIso: string | null = null;

  const stack: string[] = [];
  let trk: TrackRaw | null = null;
  let inTrkpt = false;
  let inExtensions = false;

  let pointLat: number | null = null;
  let pointLon: number | null = null;
  let pointAlt: number | null = null;
  let pointMs: number | null = null;
  let pointIso: string | null = null;
  let pointHr: number | null = null;
  let pointCadence: number | null = null;
  let pointPower: number | null = null;

  try {
    scanXml(source, {
      open(tag, attrs) {
        stack.push(tag);
        if (root === null) {
          root = tag;
          if (tag === "gpx" && attrs.creator) creator = attrs.creator;
        }

        switch (tag) {
          case "trk": {
            const fresh = emptyTrack();
            trk = fresh;
            collected.push(fresh);
            return;
          }
          case "trkseg": {
            const current = trk;
            if (current === null) return;
            current.segmentCount++;
            /*
              Un segment nouveau marque une coupure d'enregistrement : pause,
              perte de signal, ou trajet non enregistré entre deux boucles.
              Relier son premier point au dernier du segment précédent ajouterait
              une corde droite jamais parcourue, et une marche d'altitude
              comptée comme une montée.
            */
            current.distance.breakSegment();
            current.elevation.breakSegment();
            return;
          }
          case "trkpt": {
            /*
              Seuls les `trkpt` comptent. Un `wpt` (point d'intérêt) et un
              `rtept` (point d'itinéraire) portent les mêmes attributs `lat` et
              `lon` : les additionner mélangerait un parcours prévu avec une
              sortie faite.
            */
            if (trk === null) return;
            inTrkpt = true;
            pointLat = xmlNumber(attrs.lat);
            pointLon = xmlNumber(attrs.lon);
            pointAlt = null;
            pointMs = null;
            pointIso = null;
            pointHr = null;
            pointCadence = null;
            pointPower = null;
            return;
          }
          case "extensions":
            inExtensions = true;
            return;
        }
      },

      close(tag) {
        if (stack[stack.length - 1] === tag) stack.pop();
        else {
          const at = stack.lastIndexOf(tag);
          if (at >= 0) stack.length = at;
        }

        switch (tag) {
          case "trk":
            trk = null;
            return;
          case "extensions":
            inExtensions = false;
            return;
          case "trkpt": {
            if (!inTrkpt) return;
            inTrkpt = false;
            const t = trk;
            if (t === null) return;
            t.pointCount++;
            t.distance.add(pointLat, pointLon, pointMs);
            t.elevation.add(pointAlt);
            if (pointMs !== null) {
              if (t.firstMs === null || pointMs < t.firstMs) {
                t.firstMs = pointMs;
                t.firstTimeIso = pointIso;
              }
              if (t.lastMs === null || pointMs > t.lastMs) t.lastMs = pointMs;
            }
            const beat = hr(pointHr);
            if (beat !== null) {
              t.hrSum += beat;
              t.hrCount++;
              if (t.hrMax === null || beat > t.hrMax) t.hrMax = beat;
            }
            if (pointCadence !== null && pointCadence >= 0 && pointCadence < 300) {
              t.cadenceSum += pointCadence;
              t.cadenceCount++;
            }
            if (pointPower !== null && pointPower >= 0 && pointPower < 3000) {
              t.powerSum += pointPower;
              t.powerCount++;
            }
            return;
          }
        }
      },

      text(value) {
        const tag = stack[stack.length - 1];
        if (!tag) return;
        const t = trk;

        if (inTrkpt) {
          switch (tag) {
            case "ele":
              pointAlt = xmlNumber(value);
              return;
            case "time":
              pointIso = value.trim();
              pointMs = isoMillis(pointIso);
              return;
            // Noms locaux des extensions, préfixes retirés : `gpxtpx:hr`
            // devient `hr`, et `ns3:cad` devient `cad`. Les exportateurs ne
            // s'accordent pas sur les préfixes, seulement sur ces noms.
            case "hr":
            case "heartrate":
              if (inExtensions) pointHr = xmlNumber(value);
              return;
            case "cad":
            case "cadence":
              if (inExtensions) pointCadence = xmlNumber(value);
              return;
            case "power":
            case "watts":
              if (inExtensions) pointPower = xmlNumber(value);
              return;
          }
          return;
        }

        if (t !== null) {
          switch (tag) {
            case "name":
              t.name ??= value.trim();
              return;
            case "type":
              // `<type>` existe aussi dans un `<link>` de métadonnées, où il
              // désigne un type MIME. Ici on est forcément dans le `<trk>`.
              if (!inExtensions) t.typeLabel ??= value.trim();
              return;
          }
          return;
        }

        // Hors trace : la seule chose utile est l'heure des métadonnées, qui
        // sert de repli quand les points n'en portent pas.
        if (tag === "time" && stack.includes("metadata")) {
          metadataTimeIso ??= value.trim();
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
    const reason = root === "TrainingCenterDatabase"
      ? "racine <TrainingCenterDatabase> : ce fichier est un TCX, pas un GPX"
      : root === null
      ? "document vide"
      : `aucune trace <trk> dans le fichier (racine <${root}>)`;
    return { activities: [], rejected: [{ name, reason }] };
  }

  const fingerprint = await contentFingerprint(bytes, "gpx");
  const activities: ParsedActivity[] = [];

  for (const [index, t] of collected.entries()) {
    const startIso = t.firstTimeIso ?? metadataTimeIso;
    const startedAtMs = isoMillis(startIso);
    if (startedAtMs === null) {
      /*
        Une trace sans horodatage est un itinéraire, pas une sortie : un
        parcours tracé à la main, ou un fichier de reconnaissance. Le refuser
        avec cette raison évite qu'une trace prévue se glisse dans la charge
        d'entraînement réelle.
      */
      rejected.push({
        name,
        reason: collected.length > 1
          ? `trace ${index + 1} sans horodatage (itinéraire, pas une sortie)`
          : "trace sans horodatage (itinéraire, pas une sortie)",
      });
      continue;
    }

    // Le décalage que porte le fichier, et rien d'autre : voir la note
    // équivalente dans `tcx.ts`. Les GPX de Strava n'écrivent que des `Z`.
    const offsetS = startIso ? isoOffsetSeconds(startIso) : null;

    const elapsedS = t.firstMs !== null && t.lastMs !== null
      ? Math.round((t.lastMs - t.firstMs) / 1000)
      : null;
    const durationS = elapsedS !== null && elapsedS > 0 ? elapsedS : null;

    const distanceM = t.distance.meters > 0 ? t.distance.meters : null;

    activities.push({
      externalId: collected.length > 1 ? `${fingerprint}#${index + 1}` : fingerprint,
      startedAt: new Date(startedAtMs).toISOString(),
      localDate: localDateOf(startedAtMs, offsetS ?? 0),
      sport: sportFromLabel(t.typeLabel),
      durationS,
      distanceM,
      elevationGainM: t.elevation.empty ? null : t.elevation.gainM,
      avgHr: t.hrCount > 0 ? hr(t.hrSum / t.hrCount) : null,
      maxHr: t.hrMax,
      avgPaceSPerKm: paceFrom(distanceM, durationS),
      // Un GPX ne porte jamais de calories. `null` plutôt qu'une estimation :
      // un chiffre calculé à côté de chiffres mesurés aurait le même poids
      // visuel sans avoir la même valeur.
      calories: null,
      details: {
        trackName: t.name,
        trackpointCount: t.pointCount,
        segmentCount: t.segmentCount,
        elapsedS,
        descentM: t.elevation.empty ? null : t.elevation.lossM,
        avgCadence: t.cadenceCount > 0
          ? Math.round((t.cadenceSum / t.cadenceCount) * 10) / 10
          : null,
        avgPowerW: t.powerCount > 0 ? Math.round(t.powerSum / t.powerCount) : null,
        // D'où viennent les chiffres. Indispensable ici : aucun n'est lu, tous
        // sont calculés, et les écarts avec la montre sont donc attendus.
        distanceSource: distanceM === null ? null : "calculée depuis les positions",
        durationSource: "temps écoulé, pauses comprises (le GPX ne les distingue pas)",
        elevationSource: t.elevation.empty ? null : "calculé depuis les altitudes",
        avgHrSource: t.hrCount > 0 ? "moyenne des points" : null,
        localDateSource: offsetS !== null
          ? "décalage porté par le fichier"
          : "UTC, le fichier ne donne pas de fuseau",
        // Segments écartés comme sauts de GPS. Remonté plutôt qu'avalé : c'est
        // ce qui explique une distance plus courte que celle annoncée ailleurs.
        skippedLegs: t.distance.skippedLegs,
        activityIndex: index + 1,
        activityCount: collected.length,
      },
      raw: {
        format: "gpx",
        fileName: name,
        creator,
        typeLabel: t.typeLabel,
        trackName: t.name,
        utcOffsetS: offsetS,
        startIso,
        metadataTimeIso,
        hrSampleCount: t.hrCount,
      },
    });
  }

  return { activities, rejected };
}

/** Vrai si le contenu ressemble à un GPX. Décidé sur la racine, pas l'extension. */
export function looksLikeGpx(bytes: Uint8Array): boolean {
  const head = xmlTextFromBytes(bytes.subarray(0, 2048));
  return /<\s*(\w+:)?gpx[\s>]/i.test(head);
}
