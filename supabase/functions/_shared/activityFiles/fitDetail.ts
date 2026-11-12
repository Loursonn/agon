/**
 * Détail complet d'un FIT : série seconde par seconde, tours, séries de muscu,
 * découpage automatique, appareil, temps en zone selon la montre.
 *
 * Messages lus (profil FIT 21.x) : `file_id` (0), `session` (18), `lap` (19),
 * `record` (20), `event` (21), `device_info` (23), `activity` (34),
 * `time_in_zone` (216), `set` (225), `split` (312).
 * `user_profile` (3) est volontairement ignoré : poids, âge, sexe — données
 * personnelles qui ne servent à aucun calcul ici.
 *
 * Champs `enhanced_*` prioritaires (plus de précision, pas de plafond à
 * 65 m/s ni à 13 000 m d'altitude). Un FIT multisport n'est lu que pour sa
 * première session : le détail d'un enchaînement viendra s'il y a un besoin.
 */
import { FIT_EPOCH_MS, type FitMessage, walkFit } from "./fitReader.ts";
import { sportFromFitCode } from "./sports.ts";
import {
  type ActivitySplit,
  type DeviceInfo,
  type NormalizedActivity,
  type StrengthSet,
  StreamBuilder,
  toStepsPerMinute,
  type WatchLap,
  type WatchLapValues,
  type WatchTimeInZone,
} from "./stream.ts";

const LAP_TRIGGERS: Record<number, string> = {
  0: "manual",
  1: "time",
  2: "distance",
  3: "position_start",
  4: "position_lap",
  5: "position_waypoint",
  6: "position_marked",
  7: "session_end",
  8: "fitness_equipment",
};

const INTENSITIES: Record<number, string> = {
  0: "active",
  1: "rest",
  2: "warmup",
  3: "cooldown",
  4: "recovery",
  5: "interval",
  6: "other",
};

const SPLIT_TYPES: Record<number, string> = {
  1: "ascent",
  2: "descent",
  3: "interval_active",
  4: "interval_rest",
  5: "interval_warmup",
  6: "interval_cooldown",
  7: "interval_recovery",
  8: "interval_other",
  9: "climb_active",
  10: "climb_rest",
  12: "run_active",
  13: "run_rest",
  14: "workout_round",
  17: "run",
  18: "walk",
  22: "stand",
  23: "transition",
};

const scaled = (v: number | null, scale: number, offset = 0): number | null =>
  v === null ? null : v / scale - offset;

/** Préfère le champ `enhanced` s'il est présent et valide. */
const pick = (m: FitMessage, enhanced: number, plain: number, scale: number, offset = 0): number | null =>
  scaled(m.get(enhanced), scale, offset) ?? scaled(m.get(plain), scale, offset);

const semicircles = (v: number | null): number | null => (v === null ? null : v * (180 / 2 ** 31));

const hrOk = (v: number | null): number | null => (v !== null && v >= 20 && v <= 250 ? v : null);

/** Cadence brute + fraction (1/128) : un pied, en rpm. */
const cadenceOf = (whole: number | null, fraction: number | null): number | null =>
  whole === null ? null : whole + (fraction ?? 0) / 128;

interface PendingLap {
  start: number | null;
  end: number | null;
  trigger: string | null;
  intensity: string | null;
  watch: WatchLapValues;
}

interface PendingSplit {
  type: string | null;
  start: number | null;
  end: number | null;
  timerS: number | null;
  distanceM: number | null;
  ascentM: number | null;
  descentM: number | null;
}

/**
 * Décode le détail d'un FIT. Lève si le fichier est illisible (même règle que
 * `parseFit` : un détail partiel silencieux serait pire qu'un refus).
 */
export function decodeFitDetail(bytes: Uint8Array): NormalizedActivity {
  const builder = new StreamBuilder();
  /** Horodatages FIT des échantillons, pour placer t et le chronomètre à la fin. */
  const recordTs: number[] = [];
  const rawSamples: Array<Record<string, number | null>> = [];

  let sessionStart: number | null = null;
  let sessionSport: number | null = null;
  let sessionsSeen = 0;
  let utcTs: number | null = null;
  let localTs: number | null = null;
  let device: DeviceInfo | null = null;

  const laps: PendingLap[] = [];
  const sets: Array<StrengthSet & { startTs: number | null }> = [];
  const splits: PendingSplit[] = [];
  const zones: WatchTimeInZone[] = [];
  /** Pauses du chronomètre : [arrêt, reprise] en horodatage FIT. */
  const pauses: Array<[number, number | null]> = [];

  walkFit(
    bytes,
    (n) => n === 0 || n === 18 || n === 19 || n === 20 || n === 21 || n === 23 || n === 34 || n === 216 ||
      n === 225 || n === 312,
    (m) => {
      switch (m.globalNum) {
        case 0: {
          device = {
            manufacturer: m.get(1),
            product: m.get(2),
            productName: m.getString(8),
          };
          return;
        }
        case 23: {
          // device_index 0 = l'appareil qui a créé le fichier.
          const idx = m.get(0);
          if (idx !== 0) return;
          const name = m.getString(27);
          device = {
            manufacturer: m.get(2) ?? device?.manufacturer ?? null,
            product: m.get(4) ?? device?.product ?? null,
            productName: name ?? device?.productName ?? null,
          };
          return;
        }
        case 20: {
          const ts = m.timestamp;
          if (ts === null) return;
          const sample = {
            hr: hrOk(m.get(3)),
            speed: pick(m, 73, 6, 1000),
            dist: scaled(m.get(5), 100),
            alt: pick(m, 78, 2, 5, 500),
            cadence: cadenceOf(m.get(4), m.get(53)),
            power: m.get(7),
            lat: semicircles(m.get(0)),
            lon: semicircles(m.get(1)),
            vosc: scaled(m.get(39), 10),
            stance: scaled(m.get(41), 10),
            vratio: scaled(m.get(83), 100),
            stepLen: scaled(m.get(85), 10),
            temp: m.get(13),
          };
          recordTs.push(ts);
          rawSamples.push(sample);
          return;
        }
        case 21: {
          // Événement chronomètre : 0 = timer ; type 0 = start, 1 = stop, 4 = stop_all.
          if (m.get(0) !== 0 || m.timestamp === null) return;
          const type = m.get(1);
          if (type === 1 || type === 4) {
            const open = pauses[pauses.length - 1];
            if (!open || open[1] !== null) pauses.push([m.timestamp, null]);
          } else if (type === 0) {
            const open = pauses[pauses.length - 1];
            if (open && open[1] === null) open[1] = m.timestamp;
          }
          return;
        }
        case 19: {
          const start = m.get(2);
          const end = m.timestamp;
          laps.push({
            start,
            end,
            trigger: LAP_TRIGGERS[m.get(24) ?? -1] ?? null,
            intensity: INTENSITIES[m.get(23) ?? -1] ?? null,
            watch: {
              timerS: scaled(m.get(8), 1000),
              elapsedS: scaled(m.get(7), 1000),
              distanceM: scaled(m.get(9), 100),
              avgSpeed: pick(m, 110, 13, 1000),
              maxSpeed: pick(m, 111, 14, 1000),
              avgHr: hrOk(m.get(15)),
              maxHr: hrOk(m.get(16)),
              avgCadence: cadenceOf(m.get(17), m.get(80)),
              maxCadence: m.get(18),
              avgPower: m.get(19),
              maxPower: m.get(20),
              ascentM: m.get(21),
              descentM: m.get(22),
              minAltM: scaled(m.get(113), 5, 500),
              maxAltM: scaled(m.get(114), 5, 500),
            },
          });
          return;
        }
        case 18: {
          sessionsSeen++;
          if (sessionsSeen > 1) return;
          sessionStart = m.get(2) ?? null;
          sessionSport = m.get(5);
          return;
        }
        case 34: {
          utcTs = m.get(253);
          localTs = m.get(5);
          return;
        }
        case 225: {
          const type = m.get(5);
          sets.push({
            startTs: m.get(6),
            startS: null,
            durationS: scaled(m.get(0), 1000),
            reps: m.get(3),
            weightKg: scaled(m.get(4), 16),
            setType: type === 0 ? "rest" : type === 1 ? "active" : null,
            category: (m.getArray(7) ?? []).filter((v): v is number => v !== null),
            categorySubtype: (m.getArray(8) ?? []).filter((v): v is number => v !== null),
          });
          return;
        }
        case 312: {
          splits.push({
            type: SPLIT_TYPES[m.get(0) ?? -1] ?? null,
            start: m.get(9),
            end: m.get(27),
            timerS: scaled(m.get(2), 1000),
            distanceM: scaled(m.get(3), 100),
            ascentM: m.get(13),
            descentM: m.get(14),
          });
          return;
        }
        case 216: {
          zones.push({
            referenceMesg: m.get(0),
            referenceIndex: m.get(1),
            timeInHrZoneS: (m.getArray(2) ?? null)?.map((v) => (v === null ? null : v / 1000)) ?? null,
            hrZoneHighBpm: m.getArray(6),
          });
          return;
        }
      }
    },
  );

  const t0 = sessionStart ?? recordTs[0] ?? laps[0]?.start ?? null;
  if (t0 === null) throw new Error("aucun horodatage de départ dans le fichier");

  /** Secondes de pause entre t0 et `ts`. */
  const pausedBefore = (ts: number): number => {
    let total = 0;
    for (const [stop, resume] of pauses) {
      if (stop >= ts) break;
      const until = resume === null ? ts : Math.min(resume, ts);
      if (until > stop) total += until - stop;
    }
    return total;
  };

  for (let i = 0; i < recordTs.length; i++) {
    const ts = recordTs[i];
    builder.push({ t: ts - t0, timer: pauses.length > 0 ? ts - t0 - pausedBefore(ts) : ts - t0, ...rawSamples[i] });
  }

  const rel = (ts: number | null): number | null => (ts === null ? null : Math.max(0, ts - t0));

  const watchLaps: WatchLap[] = [];
  for (let i = 0; i < laps.length; i++) {
    const l = laps[i];
    const startS = rel(l.start) ?? (i === 0 ? 0 : watchLaps[i - 1]?.endS ?? 0);
    const endFromElapsed = l.watch.elapsedS !== null ? startS + l.watch.elapsedS : null;
    const endS = rel(l.end) ?? endFromElapsed ?? startS;
    watchLaps.push({ startS, endS: Math.max(startS, endS), trigger: l.trigger, intensity: l.intensity, watch: l.watch });
  }

  const activity: NormalizedActivity = {
    source: "fit",
    startedAtMs: FIT_EPOCH_MS + t0 * 1000,
    utcOffsetS: utcTs !== null && localTs !== null ? localTs - utcTs : null,
    sport: sportFromFitCode(sessionSport),
    stream: builder.build(),
    laps: watchLaps,
    sets: sets.map(({ startTs, ...s }) => ({ ...s, startS: rel(startTs) })),
    splits: splits.map((s) => {
      const startS = rel(s.start) ?? 0;
      return {
        type: s.type,
        startS,
        endS: Math.max(startS, rel(s.end) ?? startS),
        timerS: s.timerS,
        distanceM: s.distanceM,
        ascentM: s.ascentM,
        descentM: s.descentM,
      } satisfies ActivitySplit;
    }),
    device,
    watchTimeInZone: zones,
  };
  return toStepsPerMinute(activity);
}
