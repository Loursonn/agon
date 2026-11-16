import { describe, expect, it } from "vitest";
import type { LapMetrics } from "@shared/domain/lapMetrics";
import {
  anchorManualLaps, applyCellEdit, applyOverrides, cellEditFromText, canDeleteLap, canSetDuration, cleanOverrides, deleteLap,
  distanceFromPace, hasValueEdit, insertManualLap, manualLapMetrics, parseCount, parseKm, parsePace,
  parseSpeedAsPace, phaseLabel, setLapDuration, setOverride, timeAfter, timeBefore, totalFromLaps,
} from "@/lib/lapEdits";
import { hasBoundaryAfter, mergeWithNext, moveBoundary, setLapBounds } from "@/lib/seance";

type L = { startS: number; endS: number; name: string | null; distanceOverrideM: number | null; manualDurationS?: number | null; lapType?: "warmup" | "work" | "recovery" | "cooldown" | null; overrides?: Record<string, number> | null };
const lap = (startS: number, endS: number, name: string | null = null): L => ({ startS, endS, name, distanceOverrideM: null });
const manual = (dur: number, name: string | null = "M"): L => ({ startS: 0, endS: 0, name, distanceOverrideM: null, manualDurationS: dur });
const bounds = (ls: readonly L[]) => ls.map((l) => [l.startS, l.endS]);
/** Série de 1 point par seconde, pause (chrono figé) de 100 à 109 s. */
const stream = (() => {
  const t = Array.from({ length: 300 }, (_, i) => i);
  let c = 0;
  const timer = t.map((s) => (s > 100 && s <= 110 ? c : (c = c + (s === 0 ? 0 : 1))));
  return { t, timer };
})();
const plain = { t: Array.from({ length: 300 }, (_, i) => i), timer: null };

const metrics = (p: Partial<LapMetrics>): LapMetrics => ({
  durationS: 0, elapsedS: 0, distanceM: null, avgSpeed: null, maxSpeed: null, avgPaceSPerKm: null, maxPaceSPerKm: null,
  avgHr: null, maxHr: null, avgCadence: null, maxCadence: null, ascentM: null, descentM: null, avgPower: null, maxPower: null,
  timeInZones: null, meanZone: null, source: "computed", ...p,
});

describe("saisie des cases", () => {
  it("distance, allure, vitesse, entiers ; illisible → null", () => {
    expect(parseKm("1,25")).toBe(1250);
    expect(parseKm("1.5 km")).toBe(1500);
    expect(parseKm("400 m")).toBe(400);
    expect(parseKm("abc")).toBeNull();
    expect(parseKm("")).toBeNull();
    expect(parsePace("4'05")).toBe(245);
    expect(parsePace("4:05")).toBe(245);
    expect(parsePace("4.30")).toBe(270);
    expect(parsePace("5")).toBe(300);
    expect(parsePace("4'75")).toBeNull();
    expect(parsePace("vite")).toBeNull();
    expect(parseSpeedAsPace("36")).toBe(100);
    expect(parseSpeedAsPace("0")).toBeNull();
    expect(parseCount("172")).toBe(172);
    expect(parseCount("12,6")).toBe(13);
    expect(parseCount("-3")).toBeNull();
  });

  it("allure tapée → distance sur la durée gardée", () => {
    expect(distanceFromPace(240, 240)).toBe(1000);
    expect(distanceFromPace(300, 250)).toBe(1200);
    expect(distanceFromPace(0, 240)).toBeNull();
  });

  it("types de tour", () => {
    expect(phaseLabel("warmup")).toBe("Échauffement");
    expect(phaseLabel("cooldown", true)).toBe("Calme");
    expect(phaseLabel(null)).toBeNull();
  });
});

describe("valeurs corrigées : jamais la FC", () => {
  it("nettoie : clés connues, nombres ≥ 0", () => {
    expect(cleanOverrides({ avgCadence: 172, avgHr: 190, maxHr: 200, ascentM: -2, descentM: "3", maxPower: 400 }))
      .toEqual({ avgCadence: 172, maxPower: 400 });
    expect(cleanOverrides({})).toBeNull();
    expect(cleanOverrides(null)).toBeNull();
    expect(setOverride({ avgCadence: 172 }, "avgCadence", null)).toBeNull();
    expect(setOverride(null, "ascentM", 12)).toEqual({ ascentM: 12 });
  });

  it("remplace les valeurs, garde l'ancienne pour le survol, FC intacte", () => {
    const m = metrics({ avgHr: 160, maxHr: 175, avgCadence: 168, maxPaceSPerKm: 230, maxSpeed: 1000 / 230 });
    const r = applyOverrides(m, { avgCadence: 172, maxPaceSPerKm: 200 });
    expect(r.metrics.avgCadence).toBe(172);
    expect(r.metrics.maxPaceSPerKm).toBe(200);
    expect(r.metrics.maxSpeed).toBe(5);
    expect(r.metrics.avgHr).toBe(160);
    expect(r.metrics.maxHr).toBe(175);
    expect(r.original).toEqual({ avgCadence: 168, maxPaceSPerKm: 230 });
    expect(applyOverrides(m, null).metrics).toBe(m);
  });
});

describe("tour tapé à la main (hors courbe)", () => {
  it("métriques : durée et distance saisies, pas de FC", () => {
    const m = manualLapMetrics({ startS: 0, endS: 0, distanceOverrideM: 1200, manualDurationS: 300 });
    expect(m.durationS).toBe(300);
    expect(m.distanceM).toBe(1200);
    expect(m.avgPaceSPerKm).toBe(250);
    expect(m.avgHr).toBeNull();
    expect(m.meanZone).toBeNull();
    expect(manualLapMetrics({ startS: 0, endS: 0, distanceOverrideM: null, manualDurationS: 60 }).avgPaceSPerKm).toBeNull();
  });

  it("s'insère après le tour choisi, posé à sa fin ; en tête, au début du premier", () => {
    const ls = [lap(10, 100, "A"), lap(100, 200, "B")];
    const out = insertManualLap(ls, 0, () => manual(120));
    expect(out.map((l) => l.name)).toEqual(["A", "M", "B"]);
    expect(bounds(out)).toEqual([[10, 100], [100, 100], [100, 200]]);
    expect(bounds(insertManualLap(ls, -1, () => manual(60)))[0]).toEqual([10, 10]);
    expect(bounds(insertManualLap(ls, 1, () => manual(60)))[2]).toEqual([200, 200]);
  });

  it("les limites, la fusion et la coupe sautent les tours manuels", () => {
    const ls = anchorManualLaps([lap(0, 100, "A"), manual(60), lap(100, 200, "B")]);
    expect(hasBoundaryAfter(ls, 0)).toBe(true);
    expect(hasBoundaryAfter(ls, 1)).toBe(false);
    expect(hasBoundaryAfter(ls, 2)).toBe(false);
    expect(bounds(moveBoundary(ls, 0, 140))).toEqual([[0, 140], [140, 140], [140, 200]]);
    expect(moveBoundary(ls, 1, 140)).toEqual(ls);
    const merged = mergeWithNext(ls, 0);
    expect(merged.map((l) => l.name)).toEqual(["A", "M"]);
    expect(bounds(merged)).toEqual([[0, 200], [200, 200]]);
    expect(bounds(setLapBounds(ls, 2, 120, 200))).toEqual([[0, 120], [120, 120], [120, 200]]);
  });
});

describe("supprimer un tour : son temps rejoint le voisin", () => {
  const ls = [lap(0, 100, "A"), lap(100, 160, "B"), lap(160, 300, "C")];

  it("au tour précédent ; le premier va au suivant", () => {
    const d = deleteLap(ls, 1);
    expect(d.map((l) => l.name)).toEqual(["A", "C"]);
    expect(bounds(d)).toEqual([[0, 160], [160, 300]]);
    const f = deleteLap(ls, 0);
    expect(f.map((l) => l.name)).toEqual(["B", "C"]);
    expect(bounds(f)).toEqual([[0, 160], [160, 300]]);
  });

  it("un tour manuel disparaît ; le seul tour de courbe reste", () => {
    const withManual = insertManualLap(ls, 0, () => manual(60));
    expect(deleteLap(withManual, 1).map((l) => l.name)).toEqual(["A", "B", "C"]);
    const one = [lap(0, 300, "Seul"), manual(60)];
    expect(canDeleteLap(one, 0)).toBe(false);
    expect(deleteLap(one, 0)).toEqual(one);
    expect(canDeleteLap(one, 1)).toBe(true);
  });

  it("un tour manuel entre deux se repose après le tour qui grandit", () => {
    const m = anchorManualLaps([lap(0, 100, "A"), lap(100, 160, "B"), manual(60), lap(160, 300, "C")]);
    const d = deleteLap(m, 1);
    expect(d.map((l) => l.name)).toEqual(["A", "M", "C"]);
    expect(bounds(d)).toEqual([[0, 160], [160, 160], [160, 300]]);
  });
});

describe("durée tapée : la limite se déplace sur la courbe", () => {
  it("chrono : les pauses ne comptent pas", () => {
    expect(timeAfter(plain, 0, 60)).toBe(60);
    expect(timeAfter(stream, 90, 30)).toBe(130);
    expect(timeBefore(plain, 200, 50)).toBe(150);
    expect(timeBefore(stream, 130, 30)).toBe(90);
  });

  it("fin du tour déplacée, le suivant suit ; dernier tour : son début avance", () => {
    const ls = [lap(0, 100, "A"), lap(100, 200, "B"), lap(200, 300, "C")];
    expect(bounds(setLapDuration(ls, 0, 80, plain))).toEqual([[0, 80], [80, 200], [200, 300]]);
    // Le dernier point de la série (299 s) ne compte pas de chrono : 179 → 300 = 120 s, comme lapMetrics.
    expect(bounds(setLapDuration(ls, 2, 120, plain))).toEqual([[0, 100], [100, 179], [179, 300]]);
    // Bornée : le voisin garde 1 s.
    expect(bounds(setLapDuration(ls, 0, 500, plain))).toEqual([[0, 199], [199, 200], [200, 300]]);
    expect(setLapDuration(ls, 0, 0, plain)).toEqual(ls);
  });

  it("tour manuel : sa durée ; tour seul : impossible", () => {
    const ls = [lap(0, 300, "A"), manual(60)];
    expect(setLapDuration(ls, 1, 95, plain)[1].manualDurationS).toBe(95);
    expect(canSetDuration(ls, 0)).toBe(false);
    expect(setLapDuration(ls, 0, 100, plain)).toEqual(ls);
    expect(canSetDuration(ls, 1)).toBe(true);
  });
});

describe("une case modifiée", () => {
  const ls = [lap(0, 100, "A"), lap(100, 200, "B")];

  it("nom, type, distance, allure, valeurs ; FC impossible à écrire", () => {
    expect(applyCellEdit(ls, 0, { field: "name", value: "  Effort 1 " }, plain)[0].name).toBe("Effort 1");
    expect(applyCellEdit(ls, 0, { field: "name", value: "  " }, plain)[0].name).toBeNull();
    expect(applyCellEdit(ls, 1, { field: "phase", value: "recovery" }, plain)[1].lapType).toBe("recovery");
    expect(applyCellEdit(ls, 0, { field: "distance", value: 1003.4 }, plain)[0].distanceOverrideM).toBe(1003);
    expect(applyCellEdit(ls, 0, { field: "pace", value: 250, durationS: 300 }, plain)[0].distanceOverrideM).toBe(1200);
    const withDist = applyCellEdit(ls, 0, { field: "distance", value: 900 }, plain);
    expect(applyCellEdit(withDist, 0, { field: "pace", value: null, durationS: 100 }, plain)[0].distanceOverrideM).toBeNull();
    expect(applyCellEdit(ls, 0, { field: "avgCadence", value: 175 }, plain)[0].overrides).toEqual({ avgCadence: 175 });
    expect(bounds(applyCellEdit(ls, 0, { field: "duration", value: 90 }, plain))).toEqual([[0, 90], [90, 200]]);
    // Rien ne permet d'écrire la FC : la clé est ignorée.
    expect(cleanOverrides({ avgHr: 150 })).toBeNull();
  });

  it("correction de valeur détectée (le total suit alors les tours)", () => {
    expect(hasValueEdit(ls[0])).toBe(false);
    expect(hasValueEdit({ ...ls[0], distanceOverrideM: 1000 })).toBe(true);
    expect(hasValueEdit({ ...ls[0], overrides: { avgCadence: 170 } })).toBe(true);
    expect(hasValueEdit(manual(60))).toBe(true);
    expect(hasValueEdit({ ...ls[0], overrides: {} })).toBe(false);
  });
});

describe("total de la séance quand des tours sont corrigés", () => {
  it("durée, distance, allure, cadence, D+ suivent ; FC et zones de la montre", () => {
    const watch = metrics({ durationS: 600, distanceM: 2000, avgHr: 150, maxHr: 182, meanZone: 2, avgCadence: 170 });
    const t = totalFromLaps(
      [
        { metrics: metrics({ durationS: 300, elapsedS: 300, distanceM: 1000, avgCadence: 170, maxCadence: 180, ascentM: 5, maxSpeed: 4.5, avgHr: 140 }) },
        { metrics: metrics({ durationS: 300, elapsedS: 300, distanceM: 1400, avgCadence: 180, maxCadence: 186, ascentM: 7, maxSpeed: 5 }) },
        { metrics: manualLapMetrics({ startS: 0, endS: 0, distanceOverrideM: 600, manualDurationS: 200 }) },
      ],
      watch,
    )!;
    expect(t.durationS).toBe(800);
    expect(t.distanceM).toBe(3000);
    expect(t.avgPaceSPerKm).toBeCloseTo(266.67, 1);
    expect(t.maxPaceSPerKm).toBe(200);
    expect(t.avgCadence).toBe(175);
    expect(t.maxCadence).toBe(186);
    expect(t.ascentM).toBe(12);
    expect(t.descentM).toBeNull();
    expect(t.avgHr).toBe(150);
    expect(t.maxHr).toBe(182);
    expect(t.meanZone).toBe(2);
    expect(totalFromLaps([], watch)).toBe(watch);
  });
});

describe("texte tapé → modification", () => {
  const ctx = { speed: false, durationS: 300 };
  it("chaque case ; vide = valeur de la montre ; illisible = refus", () => {
    expect(cellEditFromText("duration", "4:05", ctx)).toEqual({ field: "duration", value: 245 });
    expect(cellEditFromText("duration", "4:75", ctx)).toBeNull();
    expect(cellEditFromText("duration", "", ctx)).toBeNull();
    expect(cellEditFromText("distance", "1,2", ctx)).toEqual({ field: "distance", value: 1200 });
    expect(cellEditFromText("distance", "", ctx)).toEqual({ field: "distance", value: null });
    expect(cellEditFromText("pace", "4'10", ctx)).toEqual({ field: "pace", value: 250, durationS: 300 });
    expect(cellEditFromText("pace", "", ctx)).toEqual({ field: "pace", value: null, durationS: 300 });
    expect(cellEditFromText("pace", "vite", ctx)).toBeNull();
    expect(cellEditFromText("maxPace", "36", { speed: true, durationS: 300 })).toEqual({ field: "maxPaceSPerKm", value: 100 });
    expect(cellEditFromText("avgCadence", "172", ctx)).toEqual({ field: "avgCadence", value: 172 });
    expect(cellEditFromText("ascent", "", ctx)).toEqual({ field: "ascentM", value: null });
    expect(cellEditFromText("descent", "x", ctx)).toBeNull();
    expect(cellEditFromText("name", " Bloc 1 ", ctx)).toEqual({ field: "name", value: "Bloc 1" });
  });
});

describe("tour tapé à la main : valeurs tapées appliquées", () => {
  it("cadence et D+ tapés sur un tour sans montre", () => {
    const r = applyOverrides(manualLapMetrics({ startS: 0, endS: 0, distanceOverrideM: 1000, manualDurationS: 300 }), { avgCadence: 176, ascentM: 4 });
    expect(r.metrics.avgCadence).toBe(176);
    expect(r.metrics.ascentM).toBe(4);
    expect(r.metrics.avgHr).toBeNull();
  });
});
