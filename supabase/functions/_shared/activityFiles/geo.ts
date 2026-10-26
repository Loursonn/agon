/**
 * Agrégats calculés depuis une trace : distance et dénivelé.
 *
 * Un FIT porte ses totaux (`total_distance`, `total_ascent`) : la montre les a
 * calculés avec son baromètre et ses propres filtres, et ils valent mieux que
 * tout ce qu'on recalculerait. Un GPX n'en porte aucun, un TCX seulement la
 * distance. Il faut donc les reconstituer depuis les points — en sachant que le
 * résultat n'est pas la même grandeur que celle d'une montre, et en le disant
 * dans les données plutôt que de laisser croire à une mesure.
 */

/** Rayon moyen de la Terre (WGS-84), en mètres. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Vitesse au-delà de laquelle un segment est tenu pour un saut de GPS.
 *
 * 40 m/s = 144 km/h. Aucune activité suivie ici ne l'atteint, alors qu'un seul
 * point aberrant — un départ sous un pont, une reprise de signal — crée deux
 * segments de plusieurs kilomètres. Sans ce garde-fou, une sortie de 10 km
 * s'affiche à 420 km, et rien dans l'interface ne permet de comprendre pourquoi.
 */
const MAX_PLAUSIBLE_SPEED_MS = 40;

/** Vrai si le couple de coordonnées peut décrire une position réelle. */
export function isPlausibleFix(lat: number | null, lon: number | null): boolean {
  if (lat === null || lon === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  /*
    Exactement (0, 0) : c'est le golfe de Guinée, et c'est ce que beaucoup
    d'appareils écrivent quand ils n'ont pas de fix. Personne ne s'entraîne à
    cet endroit, et l'accepter ferait deux allers-retours de 5 000 km.
  */
  if (lat === 0 && lon === 0) return false;
  return true;
}

/** Distance orthodromique entre deux positions, en mètres. */
export function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Longueur d'une trace, point par point.
 *
 * Les segments sont cloisonnés : un `<trkseg>` nouveau signale une coupure
 * (pause, perte de signal, trajet en voiture entre deux boucles). Relier le
 * dernier point d'un segment au premier du suivant ajouterait une corde droite
 * qui n'a pas été parcourue.
 */
export class TrackDistance {
  private total = 0;
  private lastLat: number | null = null;
  private lastLon: number | null = null;
  private lastMs: number | null = null;
  /** Segments écartés comme aberrants, pour pouvoir le signaler. */
  private skipped = 0;

  add(lat: number | null, lon: number | null, atMs: number | null): void {
    if (!isPlausibleFix(lat, lon)) return;

    if (this.lastLat !== null && this.lastLon !== null) {
      const leg = haversineM(this.lastLat, this.lastLon, lat as number, lon as number);
      const dt = this.lastMs !== null && atMs !== null ? (atMs - this.lastMs) / 1000 : null;
      if (dt !== null && dt > 0 && leg / dt > MAX_PLAUSIBLE_SPEED_MS) {
        /*
          Segment refusé, mais la position devient quand même la référence
          suivante : si l'appareil a sauté une fois, les points d'après sont
          corrects et c'est depuis le nouveau lieu qu'il faut mesurer.
        */
        this.skipped++;
      } else {
        this.total += leg;
      }
    }

    this.lastLat = lat as number;
    this.lastLon = lon as number;
    this.lastMs = atMs;
  }

  /** Coupure de trace : le prochain point ne sera relié à rien. */
  breakSegment(): void {
    this.lastLat = null;
    this.lastLon = null;
    this.lastMs = null;
  }

  get meters(): number {
    return Math.round(this.total * 100) / 100;
  }

  get skippedLegs(): number {
    return this.skipped;
  }
}

/**
 * Dénivelé positif et négatif, avec hystérésis.
 *
 * Sommer naïvement les écarts positifs d'altitude donne un nombre trois à
 * quatre fois trop grand : le bruit du GPS ou du baromètre oscille de quelques
 * dizaines de centimètres à chaque point, et sur 50 000 points le bruit *est*
 * le total. Le seuil ne compte une montée qu'une fois trois mètres franchis
 * depuis le dernier palier retenu, ce qui élimine l'oscillation sans perdre les
 * vraies bosses.
 */
export class ElevationTracker {
  private gain = 0;
  private loss = 0;
  private reference: number | null = null;
  private seen = false;

  constructor(private readonly thresholdM = 3) {}

  add(altitudeM: number | null): void {
    if (altitudeM === null || !Number.isFinite(altitudeM)) return;
    // Altitudes au-delà du plausible : des exportateurs écrivent 0 ou -32768
    // en l'absence de mesure, et un seul de ces points ferait un faux col.
    if (altitudeM < -500 || altitudeM > 9000) return;

    this.seen = true;
    if (this.reference === null) {
      this.reference = altitudeM;
      return;
    }
    const delta = altitudeM - this.reference;
    if (delta >= this.thresholdM) {
      this.gain += delta;
      this.reference = altitudeM;
    } else if (delta <= -this.thresholdM) {
      this.loss += -delta;
      this.reference = altitudeM;
    }
  }

  /**
   * Coupure de trace : on repart du prochain point sans compter la marche.
   *
   * Entre deux segments, l'altitude peut changer de cent mètres sans avoir été
   * gravie — c'est le trajet non enregistré entre deux boucles.
   */
  breakSegment(): void {
    this.reference = null;
  }

  get gainM(): number {
    return Math.round(this.gain);
  }

  get lossM(): number {
    return Math.round(this.loss);
  }

  /** Vrai si aucune altitude exploitable n'a été vue : alors `null`, pas `0`. */
  get empty(): boolean {
    return this.reference === null && this.gain === 0 && this.loss === 0;
  }
}
