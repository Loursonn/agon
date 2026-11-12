/**
 * Forme commune du détail d'une activité : série seconde par seconde, tours de
 * la montre, séries de musculation, découpage automatique, appareil.
 *
 * Toutes les sources s'y ramènent (échantillons JSON Garmin, FIT Garmin ou
 * COROS, TCX / GPX importés) : c'est ce qui permet de ranger la même chose en
 * base et de calculer pareil (temps par zone, allure max, D+), quelle que soit
 * la montre.
 *
 * Règle partout : une mesure absente vaut `null`, jamais 0. Une colonne
 * entièrement absente (pas de capteur de puissance) vaut `null` en entier.
 */

/** Une colonne de la série : une valeur par échantillon, `null` si absente. */
export type StreamCol = Array<number | null> | null;

/** Mesures de la série, hors temps. Ordre = ordre des colonnes en base. */
export const STREAM_MEASURES = [
  "hr", // bpm
  "speed", // m/s
  "dist", // m cumulés depuis le départ
  "alt", // m
  "cadence", // pas/min pour la course et la marche, rpm sinon (après normalisation)
  "power", // W
  "lat", // degrés
  "lon", // degrés
  "vosc", // oscillation verticale, mm
  "stance", // temps de contact au sol, ms
  "vratio", // ratio vertical, %
  "stepLen", // longueur de pas, mm
  "temp", // température, °C
] as const;

export type StreamMeasure = typeof STREAM_MEASURES[number];

export type ActivityStream = {
  /** Secondes écoulées depuis le départ (entières, strictement croissantes). */
  t: number[];
  /**
   * Temps du chronomètre (pauses exclues) à chaque échantillon, en secondes.
   * `null` si la source ne permet pas de le savoir (TCX, GPX).
   */
  timer: StreamCol;
} & Record<StreamMeasure, StreamCol>;

/** Valeurs d'un tour telles que la montre les a calculées. */
export interface WatchLapValues {
  timerS: number | null;
  elapsedS: number | null;
  distanceM: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPower: number | null;
  maxPower: number | null;
  ascentM: number | null;
  descentM: number | null;
  minAltM: number | null;
  maxAltM: number | null;
}

/** Tour de la montre (bouton Lap, tour auto, fin de séance…). */
export interface WatchLap {
  /** Début et fin, en secondes depuis le départ de l'activité. */
  startS: number;
  endS: number;
  /** `manual` (bouton Lap), `distance`, `time`, `session_end`… ou `null`. */
  trigger: string | null;
  /** `active`, `rest`, `warmup`… (étape d'entraînement) ou `null`. */
  intensity: string | null;
  /** `null` si la source ne donne que les limites (JSON Garmin). */
  watch: WatchLapValues | null;
}

/** Série de musculation enregistrée par la montre (message FIT `set`). */
export interface StrengthSet {
  startS: number | null;
  durationS: number | null;
  reps: number | null;
  weightKg: number | null;
  /** `active` ou `rest`. */
  setType: "active" | "rest" | null;
  /** Catégories d'exercice Garmin (codes FIT `exercise_category`). */
  category: number[] | null;
  categorySubtype: number[] | null;
}

/** Découpage automatique de la montre (course / marche / arrêt…). */
export interface ActivitySplit {
  type: string | null;
  startS: number;
  endS: number;
  timerS: number | null;
  distanceM: number | null;
  ascentM: number | null;
  descentM: number | null;
}

export interface DeviceInfo {
  manufacturer: number | null;
  product: number | null;
  productName: string | null;
}

/** Ce que la montre dit du temps en zone, avec SES zones (archive, jamais utilisé). */
export interface WatchTimeInZone {
  /** 18 = séance, 19 = tour. */
  referenceMesg: number | null;
  referenceIndex: number | null;
  timeInHrZoneS: Array<number | null> | null;
  hrZoneHighBpm: Array<number | null> | null;
}

/** Résultat commun à toutes les sources, après normalisation. */
export interface NormalizedActivity {
  source: "garmin_json" | "fit" | "tcx" | "gpx";
  /** Instant du point t = 0, en ms epoch. */
  startedAtMs: number;
  /** Décalage local (s) au moment de l'activité, si connu. */
  utcOffsetS: number | null;
  sport: string | null;
  stream: ActivityStream;
  laps: WatchLap[];
  sets: StrengthSet[];
  splits: ActivitySplit[];
  device: DeviceInfo | null;
  watchTimeInZone: WatchTimeInZone[];
}

/** Garde-fous de plausibilité, appliqués à chaque échantillon. */
const BOUNDS: Partial<Record<StreamMeasure, [number, number]>> = {
  hr: [20, 250],
  speed: [0, 40], // 40 m/s = 144 km/h : au-delà, saut GPS (décision 2026-10)
  cadence: [0, 400],
  power: [0, 3000],
  lat: [-90, 90],
  lon: [-180, 180],
  alt: [-500, 9000],
  dist: [0, 2_000_000],
  vosc: [0, 500],
  stance: [0, 2000],
  vratio: [0, 100],
  stepLen: [0, 5000],
  temp: [-50, 70],
};

const DECIMALS: Partial<Record<StreamMeasure, number>> = {
  speed: 3,
  dist: 2,
  alt: 2,
  cadence: 1,
  lat: 6,
  lon: 6,
  vosc: 1,
  stance: 1,
  vratio: 2,
  stepLen: 1,
  temp: 1,
};

function clean(m: StreamMeasure, v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const b = BOUNDS[m];
  if (b && (v < b[0] || v > b[1])) return null;
  const d = DECIMALS[m];
  if (d === undefined) return Math.round(v);
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

export type Sample = { t: number; timer?: number | null } & Partial<Record<StreamMeasure, number | null>>;

/**
 * Construit une série colonne par colonne.
 *
 * Les échantillons arrivent dans l'ordre du fichier. Deux échantillons à la
 * même seconde sont fusionnés (le second complète le premier) ; un échantillon
 * qui recule dans le temps est ignoré plutôt que de casser l'ordre.
 */
export class StreamBuilder {
  private t: number[] = [];
  private timer: Array<number | null> = [];
  private cols: Record<StreamMeasure, Array<number | null>>;

  constructor() {
    this.cols = Object.fromEntries(STREAM_MEASURES.map((m) => [m, []])) as unknown as Record<
      StreamMeasure,
      Array<number | null>
    >;
  }

  get length(): number {
    return this.t.length;
  }

  push(s: Sample): void {
    const t = Math.round(s.t);
    if (!Number.isFinite(t) || t < 0) return;
    const n = this.t.length;
    // Position (0,0) = absence de fix, pas le golfe de Guinée.
    const noFix = s.lat === 0 && s.lon === 0;
    if (n > 0 && t === this.t[n - 1]) {
      const i = n - 1;
      for (const m of STREAM_MEASURES) {
        if (this.cols[m][i] === null) {
          this.cols[m][i] = noFix && (m === "lat" || m === "lon") ? null : clean(m, s[m]);
        }
      }
      if (this.timer[i] === null && s.timer !== undefined && s.timer !== null) this.timer[i] = Math.round(s.timer);
      return;
    }
    if (n > 0 && t < this.t[n - 1]) return;
    this.t.push(t);
    this.timer.push(s.timer === undefined || s.timer === null || !Number.isFinite(s.timer) ? null : Math.round(s.timer));
    for (const m of STREAM_MEASURES) {
      this.cols[m].push(noFix && (m === "lat" || m === "lon") ? null : clean(m, s[m]));
    }
  }

  build(): ActivityStream {
    const allNull = (a: Array<number | null>) => a.every((v) => v === null);
    const out = {
      t: this.t,
      timer: allNull(this.timer) ? null : this.timer,
    } as ActivityStream;
    for (const m of STREAM_MEASURES) out[m] = allNull(this.cols[m]) ? null : this.cols[m];
    return out;
  }
}

/** Série vide (activité sans échantillons : saisie à la main, muscu sans FC). */
export function emptyStream(): ActivityStream {
  return new StreamBuilder().build();
}

/*
  Sports dont la cadence se compte en pas : les montres enregistrent la cadence
  d'UN pied (65 à 0,8 m/s soit 130 pas/min). Agon stocke et affiche des
  pas/min, donc ×2. Le vélo (rpm) et le rameur (coups/min) restent tels quels.
*/
const STEP_SPORT = /run|walk|hik|trail|treadmill|track|mountaineering|snowshoe/i;

export function isStepSport(sport: string | null | undefined): boolean {
  return !!sport && STEP_SPORT.test(sport);
}

/**
 * Passe la cadence d'un pied (valeur brute des montres) en pas/min pour les
 * sports à pied : série et valeurs de tours. À appeler une seule fois, par le
 * décodeur, quand le sport est connu.
 */
export function toStepsPerMinute(a: NormalizedActivity): NormalizedActivity {
  if (!isStepSport(a.sport)) return a;
  const x2 = (v: number | null) => (v === null ? null : Math.round(v * 2 * 10) / 10);
  const cadence = a.stream.cadence ? a.stream.cadence.map(x2) : null;
  return {
    ...a,
    stream: { ...a.stream, cadence },
    laps: a.laps.map((l) =>
      l.watch
        ? { ...l, watch: { ...l.watch, avgCadence: x2(l.watch.avgCadence), maxCadence: x2(l.watch.maxCadence) } }
        : l
    ),
  };
}

/**
 * Charge utile de `activity_detail_upsert` (RPC SQL) : la forme normalisée,
 * sérialisée telle que la fonction SQL la lit.
 */
export function detailPayload(a: NormalizedActivity): Record<string, unknown> {
  return {
    source: a.source,
    started_at: new Date(a.startedAtMs).toISOString(),
    utc_offset_s: a.utcOffsetS,
    sport: a.sport,
    stream: a.stream,
    laps: a.laps,
    sets: a.sets,
    splits: a.splits,
    watch_time_in_zone: a.watchTimeInZone,
    device: a.device,
  };
}
