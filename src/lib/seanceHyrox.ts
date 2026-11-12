import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import type { DetailLap, DetailLapWithMetrics } from "@/lib/activityDetail";
import { DASH, fmtKm, fmtMeters, fmtPace, stationRhythm, type LapKind } from "@/lib/seance";

/**
 * Tableau des tours HYROX (P33) : réalisé, rythme et totaux par type.
 * Pur et testé ; les composants ne font qu'afficher.
 */

export const blockOf = (l: Pick<DetailLap, "plannedBlockRef">, blocks: readonly ExpectedBlock[] | null): ExpectedBlock | null =>
  l.plannedBlockRef ? blocks?.find((b) => b.ref === l.plannedBlockRef) ?? null : null;

/** Réalisé d'un tour : distance GPS (course), distance ou reps saisies (station). */
export function doneValue(l: DetailLapWithMetrics, kind: LapKind, b: ExpectedBlock | null): { text: string; field: "reps" | "distanceOverrideM" | null; value: number | null; unit: string } {
  if (kind === "run") return { text: l.metrics.distanceM != null ? `${fmtKm(l.metrics.distanceM, 2)} km` : DASH, field: null, value: null, unit: "" };
  if (b?.reps || l.reps) {
    const v = l.reps ?? b?.reps ?? null;
    return { text: v != null ? `${v} reps` : DASH, field: "reps", value: v, unit: "reps" };
  }
  const v = l.distanceOverrideM ?? b?.distanceM ?? null;
  return { text: v != null ? fmtMeters(v) : DASH, field: "distanceOverrideM", value: v, unit: "m" };
}

/** Allure (course) ou rythme (station) d'un tour. */
export function rhythmOf(l: DetailLapWithMetrics, kind: LapKind, b: ExpectedBlock | null): string {
  if (kind === "run") return l.metrics.avgPaceSPerKm ? `${fmtPace(l.metrics.avgPaceSPerKm)} /km` : DASH;
  const reps = l.reps ?? b?.reps ?? null;
  const dist = l.distanceOverrideM ?? b?.distanceM ?? null;
  return stationRhythm(l.metrics.durationS, reps ? null : dist, reps) ?? DASH;
}

/** Ligne de total par type : course, chaque station, transitions. */
export function groupTotals(
  laps: readonly DetailLapWithMetrics[],
  names: string[],
  kinds: readonly LapKind[],
  blocks: readonly ExpectedBlock[] | null,
) {
  const map = new Map<string, number[]>();
  laps.forEach((l, i) => {
    const kind = kinds[i];
    if (kind === "rest") return;
    const key = kind === "run" ? "Course" : kind === "transition" ? "Transitions" : (blockOf(l, blocks)?.name ?? names[i]).replace(/\s+\d+(?:[.,]\d+)?\s*k?m$/i, "").replace(/\s+\d+$/, "");
    map.set(key, [...(map.get(key) ?? []), i]);
  });
  const out = [...map.entries()].map(([key, idx]) => {
    const ls = idx.map((i) => laps[i]);
    const durationS = ls.reduce((s, l) => s + l.metrics.durationS, 0);
    const w = ls.reduce((s, l) => s + (l.metrics.avgHr != null ? l.metrics.durationS : 0), 0);
    const avgHr = w > 0 ? ls.reduce((s, l) => s + (l.metrics.avgHr ?? 0) * (l.metrics.avgHr != null ? l.metrics.durationS : 0), 0) / w : null;
    const maxHrs = ls.map((l) => l.metrics.maxHr).filter((v): v is number => v != null);
    const isRun = kinds[idx[0]] === "run";
    const bl = idx.map((i) => blockOf(laps[i], blocks));
    let planned = DASH;
    let done = DASH;
    let rhythm = DASH;
    if (isRun) {
      const pd = bl.reduce((s, b) => s + (b?.distanceM ?? 0), 0);
      const dd = ls.reduce((s, l) => s + (l.metrics.distanceM ?? 0), 0);
      planned = pd ? fmtMeters(pd) : DASH;
      done = dd ? `${fmtKm(dd, 2)} km` : DASH;
      rhythm = dd ? `${fmtPace((ls.reduce((s, l) => s + l.metrics.durationS, 0) / dd) * 1000)} /km` : DASH;
    } else {
      const repsMode = bl.some((b) => b?.reps) || ls.some((l) => l.reps);
      if (repsMode) {
        const pr = bl.reduce((s, b) => s + (b?.reps ?? 0), 0);
        const dr = ls.reduce((s, l, k) => s + (l.reps ?? bl[k]?.reps ?? 0), 0);
        planned = pr ? `${pr} reps` : DASH;
        done = dr ? `${dr} reps` : DASH;
        rhythm = stationRhythm(durationS, null, dr) ?? DASH;
      } else {
        const pd = bl.reduce((s, b) => s + (b?.distanceM ?? 0), 0);
        const dd = ls.reduce((s, l, k) => s + (l.distanceOverrideM ?? bl[k]?.distanceM ?? 0), 0);
        planned = pd ? fmtMeters(pd) : DASH;
        done = dd ? fmtMeters(dd) : DASH;
        rhythm = stationRhythm(durationS, dd, null) ?? DASH;
      }
    }
    const loads = ls.map((l, k) => l.loadKg ?? bl[k]?.loadKg ?? null).filter((v): v is number => v != null);
    return {
      label: `${key} · ${idx.length}${isRun ? " tours" : ""}`,
      planned, done, rhythm, durationS, avgHr,
      maxHr: maxHrs.length ? Math.max(...maxHrs) : null,
      load: loads.length ? `${Math.max(...loads)} kg` : DASH,
    };
  });
  const total = laps.reduce((s, l) => s + l.metrics.durationS, 0);
  const allMax = laps.map((l) => l.metrics.maxHr).filter((v): v is number => v != null);
  const w = laps.reduce((s, l) => s + (l.metrics.avgHr != null ? l.metrics.durationS : 0), 0);
  out.push({
    label: "Total", planned: "", done: "", rhythm: "", load: "", durationS: total,
    avgHr: w ? laps.reduce((s, l) => s + (l.metrics.avgHr ?? 0) * (l.metrics.avgHr != null ? l.metrics.durationS : 0), 0) / w : null,
    maxHr: allMax.length ? Math.max(...allMax) : null,
  });
  return out;
}

