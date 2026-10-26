/**
 * Les agrégats calculés depuis une trace.
 *
 * Ce qui est vérifié ici, ce n'est pas la formule de Haversine — elle est
 * connue — mais les garde-fous : le point sans fix à (0, 0), le saut de GPS, le
 * bruit d'altitude, la coupure entre deux segments. Chacun, laissé passer,
 * produit un chiffre faux mais plausible, c'est-à-dire la pire sorte.
 */
import { describe, expect, it } from "vitest";
import {
  ElevationTracker,
  haversineM,
  isPlausibleFix,
  TrackDistance,
} from "../activityFiles/geo";

describe("haversineM", () => {
  it("mesure une distance connue", () => {
    // Paris Notre-Dame → Lyon Bellecour : environ 392 km.
    const d = haversineM(48.8530, 2.3499, 45.7578, 4.8320);
    expect(d / 1000).toBeGreaterThan(390);
    expect(d / 1000).toBeLessThan(394);
  });

  it("mesure zéro entre deux fois le même point", () => {
    expect(haversineM(45.1, 5.7, 45.1, 5.7)).toBe(0);
  });

  it("mesure un degré de latitude à environ 111 km", () => {
    expect(haversineM(45, 5, 46, 5) / 1000).toBeCloseTo(111.2, 0);
  });
});

describe("isPlausibleFix", () => {
  it("accepte une position réelle", () => {
    expect(isPlausibleFix(45.1, 5.7)).toBe(true);
  });

  it("refuse exactement (0, 0)", () => {
    // Beaucoup d'appareils écrivent ça quand ils n'ont pas de fix. Accepté, un
    // seul de ces points ajoute deux trajets de 5 000 km.
    expect(isPlausibleFix(0, 0)).toBe(false);
  });

  it("accepte une position proche de l'équateur qui n'est pas (0, 0)", () => {
    expect(isPlausibleFix(0.0001, 0)).toBe(true);
  });

  it("refuse des coordonnées hors bornes ou absentes", () => {
    expect(isPlausibleFix(91, 5)).toBe(false);
    expect(isPlausibleFix(45, 181)).toBe(false);
    expect(isPlausibleFix(null, 5)).toBe(false);
    expect(isPlausibleFix(Number.NaN, 5)).toBe(false);
  });
});

describe("TrackDistance", () => {
  /** Avance de `meters` vers l'est depuis une latitude donnée. */
  const eastOf = (lat: number, lon: number, meters: number) =>
    lon + (meters / (111_320 * Math.cos((lat * Math.PI) / 180)));

  it("additionne les segments d'une trace", () => {
    const d = new TrackDistance();
    let lon = 5.7;
    const t0 = Date.parse("2026-10-03T07:00:00Z");
    d.add(45.1, lon, t0);
    for (let i = 1; i <= 10; i++) {
      lon = eastOf(45.1, lon, 100);
      d.add(45.1, lon, t0 + i * 20_000);
    }
    expect(d.meters).toBeGreaterThan(995);
    expect(d.meters).toBeLessThan(1005);
    expect(d.skippedLegs).toBe(0);
  });

  it("ne relie pas deux segments séparés", () => {
    /*
      Entre deux `<trkseg>`, l'athlète a pu se déplacer sans enregistrer. Relier
      les deux bouts ajouterait une corde droite jamais parcourue.
    */
    const d = new TrackDistance();
    const t0 = Date.parse("2026-10-03T07:00:00Z");
    d.add(45.1, 5.7, t0);
    d.add(45.1, eastOf(45.1, 5.7, 100), t0 + 20_000);
    d.breakSegment();
    d.add(46.1, 6.7, t0 + 3_600_000);
    d.add(46.1, eastOf(46.1, 6.7, 100), t0 + 3_620_000);
    expect(d.meters).toBeGreaterThan(195);
    expect(d.meters).toBeLessThan(205);
  });

  it("écarte un saut de GPS mais repart du nouveau point", () => {
    const d = new TrackDistance();
    const t0 = Date.parse("2026-10-03T07:00:00Z");
    d.add(45.1, 5.7, t0);
    // 2 km en une seconde : impossible. Sans garde-fou, une sortie de 10 km
    // s'afficherait à 420 km et rien n'expliquerait pourquoi.
    d.add(45.1, eastOf(45.1, 5.7, 2000), t0 + 1000);
    d.add(45.1, eastOf(45.1, 5.7, 2100), t0 + 21_000);
    expect(d.skippedLegs).toBe(1);
    expect(d.meters).toBeGreaterThan(95);
    expect(d.meters).toBeLessThan(105);
  });

  it("compte un segment long si le temps le rend plausible", () => {
    // Enregistrement intelligent : trente secondes entre deux points en pleine
    // course. 300 m en 30 s est normal, et doit compter.
    const d = new TrackDistance();
    const t0 = Date.parse("2026-10-03T07:00:00Z");
    d.add(45.1, 5.7, t0);
    d.add(45.1, eastOf(45.1, 5.7, 300), t0 + 30_000);
    expect(d.skippedLegs).toBe(0);
    expect(d.meters).toBeGreaterThan(295);
  });

  it("ignore les points sans fix sans casser la suite", () => {
    const d = new TrackDistance();
    const t0 = Date.parse("2026-10-03T07:00:00Z");
    d.add(45.1, 5.7, t0);
    d.add(0, 0, t0 + 20_000);
    d.add(45.1, eastOf(45.1, 5.7, 100), t0 + 40_000);
    expect(d.meters).toBeGreaterThan(95);
    expect(d.meters).toBeLessThan(105);
  });

  it("rend zéro sur une trace sans position", () => {
    expect(new TrackDistance().meters).toBe(0);
  });
});

describe("ElevationTracker", () => {
  it("ignore le bruit sous le seuil", () => {
    /*
      Le point de tout ce fichier : 200 oscillations d'un mètre sur un terrain
      plat donnent 100 m de dénivelé si on somme naïvement les écarts positifs.
      Sur 50 000 points, le bruit *est* le total.
    */
    const e = new ElevationTracker();
    for (let i = 0; i < 200; i++) e.add(100 + (i % 2));
    expect(e.gainM).toBe(0);
    expect(e.lossM).toBe(0);
    expect(e.empty).toBe(false);
  });

  it("compte une vraie montée", () => {
    const e = new ElevationTracker();
    for (let alt = 100; alt <= 200; alt += 5) e.add(alt);
    expect(e.gainM).toBe(100);
    expect(e.lossM).toBe(0);
  });

  it("compte montée et descente séparément", () => {
    const e = new ElevationTracker();
    for (let alt = 100; alt <= 150; alt += 10) e.add(alt);
    for (let alt = 140; alt >= 100; alt -= 10) e.add(alt);
    expect(e.gainM).toBe(50);
    expect(e.lossM).toBe(50);
  });

  it("ne compte pas la marche d'altitude entre deux segments", () => {
    const e = new ElevationTracker();
    e.add(100);
    e.add(110);
    e.breakSegment();
    // Cent mètres plus haut, mais non gravis : trajet non enregistré.
    e.add(210);
    e.add(220);
    expect(e.gainM).toBe(20);
  });

  it("ignore les altitudes sentinelles", () => {
    const e = new ElevationTracker();
    e.add(100);
    e.add(-32768);
    e.add(110);
    expect(e.gainM).toBe(10);
  });

  it("se déclare vide quand aucune altitude n'a été vue", () => {
    // Important : alimente un `null` et non un `0`. Un GPX sans altitude ne
    // décrit pas une sortie plate, il ne décrit rien.
    const e = new ElevationTracker();
    e.add(null);
    expect(e.empty).toBe(true);
  });
});
