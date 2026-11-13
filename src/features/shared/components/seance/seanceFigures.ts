import { C } from "@/lib/theme";
import { DASH, fmtClock, fmtInt, fmtKm, fmtPace, fmtUpDown, SERIES_COLORS, sportFamily, zoneColor } from "@/lib/seance";
import type { ActivityDetail, DetailLapWithMetrics } from "@/lib/activityDetail";
import type { LapKind } from "@/lib/seance";

export interface Figure {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}

/** Les chiffres clés de la séance (course) ou de la séance HYROX. */
export function seanceFigures(
  detail: ActivityDetail,
  laps: readonly DetailLapWithMetrics[],
  kinds: readonly LapKind[],
  opts: { noGps: boolean },
): Figure[] {
  const t = detail.total;
  const a = detail.activity;
  const fam = sportFamily(a.sport);
  const avgHr = t?.avgHr ?? a.avgHr ?? null;
  const maxHr = t?.maxHr ?? a.maxHr ?? null;
  const zoneOfHr = (hr: number | null) => {
    if (hr === null || !detail.bounds) return undefined;
    let z = 1;
    for (const b of detail.bounds.bounds) if (hr >= b) z++;
    return zoneColor(z, detail.bounds.bounds.length + 1);
  };
  const hrFigures: Figure[] = [
    { label: "FC moy.", value: fmtInt(avgHr), unit: avgHr !== null ? "bpm" : undefined, color: zoneOfHr(avgHr) },
    { label: "FC max", value: fmtInt(maxHr), unit: maxHr !== null ? "bpm" : undefined, color: zoneOfHr(maxHr) },
  ];

  if (fam === "hyrox" || (detail.plannedBlocks?.some((b) => b.kind === "station") && laps.length)) {
    const runLaps = laps.filter((_, i) => kinds[i] === "run");
    const runDist = runLaps.reduce((s, l) => s + (l.metrics.distanceM ?? 0), 0);
    const runTime = runLaps.reduce((s, l) => s + l.metrics.durationS, 0);
    const stations = kinds.filter((k) => k === "station").length;
    return [
      { label: "Durée", value: fmtClock(t?.durationS ?? a.durationS) },
      { label: "Course", value: runDist > 0 ? fmtKm(runDist) : DASH, unit: runDist > 0 ? "km" : undefined, color: C.ac },
      { label: "Allure course", value: runDist > 0 ? fmtPace((runTime / runDist) * 1000) : DASH, unit: runDist > 0 ? "/km" : undefined, color: SERIES_COLORS.pace },
      { label: "Stations", value: stations ? String(stations) : DASH, color: C.o },
      ...hrFigures,
      { label: "Tours", value: laps.length ? String(laps.length) : DASH },
    ];
  }

  const dist = t?.distanceM ?? a.distanceM ?? null;
  const dur = t?.durationS ?? a.durationS ?? null;
  const speedFig: Figure = fam === "bike"
    ? { label: "Vitesse moy.", value: t?.avgSpeed ? (t.avgSpeed * 3.6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : DASH, unit: t?.avgSpeed ? "km/h" : undefined, color: SERIES_COLORS.pace }
    : { label: "Allure moy.", value: fmtPace(t?.avgPaceSPerKm ?? (dist && dur ? (dur / dist) * 1000 : null)), unit: dist ? "/km" : undefined, color: SERIES_COLORS.pace };
  return [
    { label: "Distance", value: fmtKm(dist), unit: dist !== null ? "km" : undefined },
    { label: "Durée", value: fmtClock(dur) },
    speedFig,
    ...hrFigures,
    { label: opts.noGps ? "Dénivelé" : "D+ / D−", value: opts.noGps ? DASH : fmtUpDown(t?.ascentM, t?.descentM), unit: !opts.noGps && t?.ascentM != null ? "m" : undefined },
    {
      label: fam === "bike" ? "Cadence moy." : "Cadence moy.",
      value: fmtInt(t?.avgCadence),
      unit: t?.avgCadence != null ? (fam === "bike" ? "tr/min" : "pas/min") : undefined,
      color: SERIES_COLORS.cadence,
    },
  ];
}
