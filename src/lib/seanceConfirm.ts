import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import type { DetailLapWithMetrics } from "@/lib/activityDetail";
import { fmtKm, fmtMeters, type LapKind } from "@/lib/seance";
import { blockOf, doneValue } from "@/lib/seanceHyrox";

/**
 * Feuille « C'est bien cette séance » (planche HyroxConfirmerTel) : les courses
 * en une ligne, puis chaque station avec prévu → fait, charge et commentaire.
 * Les stations conformes au prévu (sans mot ni doute) sont repliées en une
 * ligne quand au moins une autre demande l'attention. Pur et testé.
 */

export interface ConfirmStation {
  /** Index du tour dans la liste. */
  index: number;
  name: string;
  /** « 15 m », « 10 » ; null sans prévu. */
  plannedText: string | null;
  field: "reps" | "distanceOverrideM";
  done: number | null;
  unit: "reps" | "m";
  loadKg: number | null;
  /** Fait ≠ prévu : pastille « À corriger ». */
  differs: boolean;
  comment: string | null;
  folded: boolean;
}

export interface ConfirmModel {
  /** « 4 × course 500 m » ; null sans course. */
  runLabel: string | null;
  /** « 2,00 km · montre » */
  runDetail: string | null;
  stations: ConfirmStation[];
  /** « Stations 1 et 2 : conformes au prévu ✓ » ; null si rien n'est replié. */
  foldedLabel: string | null;
}

/** « 1 et 2 », « 1, 2 et 3 ». */
export function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export function confirmModel(
  laps: readonly DetailLapWithMetrics[],
  names: readonly string[],
  kinds: readonly LapKind[],
  blocks: readonly ExpectedBlock[] | null,
  device: string | null = "montre",
): ConfirmModel {
  const runs = laps.map((l, i) => ({ l, i })).filter(({ i }) => kinds[i] === "run");
  let runLabel: string | null = null;
  let runDetail: string | null = null;
  if (runs.length) {
    const planned = new Set(runs.map(({ l }) => blockOf(l, blocks)?.distanceM ?? null));
    const each = planned.size === 1 ? [...planned][0] : null;
    runLabel = `${runs.length} × course${each ? ` ${fmtMeters(each)}` : ""}`;
    const total = runs.reduce((s, { l }) => s + (l.metrics.distanceM ?? 0), 0);
    runDetail = [total > 0 ? `${fmtKm(total, 2)} km` : null, device].filter(Boolean).join(" · ") || null;
  }

  const stations: ConfirmStation[] = laps.flatMap((l, i) => {
    if (kinds[i] !== "station") return [];
    const b = blockOf(l, blocks);
    const d = doneValue(l, "station", b);
    const field = d.field ?? "distanceOverrideM";
    const planned = b ? (field === "reps" ? b.reps : b.distanceM) : null;
    const plannedText = planned == null ? null : field === "reps" ? String(planned) : fmtMeters(planned);
    const differs = d.value != null && planned != null && d.value !== planned;
    const comment = l.comment?.trim() || null;
    return [{
      index: i, name: names[i], plannedText, field, done: d.value, unit: field === "reps" ? "reps" as const : "m" as const,
      loadKg: l.loadKg ?? b?.loadKg ?? null,
      differs,
      comment,
      folded: !l.needsReview && !comment && !differs,
    }];
  });
  const anyLoud = stations.some((s) => !s.folded);
  if (!anyLoud) for (const s of stations) s.folded = false;
  const folded = stations.filter((s) => s.folded);
  return {
    runLabel,
    runDetail,
    stations,
    foldedLabel: folded.length ? `${folded.length > 1 ? "Stations" : "Station"} ${joinFr(folded.map((s) => s.name))} : conforme${folded.length > 1 ? "s" : ""} au prévu ✓` : null,
  };
}
