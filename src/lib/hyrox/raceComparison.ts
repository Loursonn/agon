/**
 * Comparer deux courses HYROX côte à côte (demande d'Hugo, 15/11/2026) :
 * chrono, runs, stations, Roxzone, avec ce qui a progressé et ce qui a reculé.
 *
 * Règles :
 * - « avant » = la course la plus ancienne, « après » = la plus récente ;
 *   un écart négatif est un progrès.
 * - Le run 1 s'affiche mais n'est jamais jugé (départ et longueur changent
 *   d'une course à l'autre).
 * - Solo, duo et relais : les stations ne se comparent pas (partagées en duo,
 *   réparties en relais). Open / pro / mixte : une station chargée ne se
 *   compare que si la charge est la même. Le chrono se compare toujours par
 *   la position dans sa propre catégorie.
 *
 * Pur et testé, aucune IA.
 */
import { DIVISION_LOADS, RUN_KEYS, STATION_KEYS, STATION_META, type HyroxResult, type StationKey } from "@/features/shared/types/hyrox";
import { roxzoneTotal, type RefLookup } from "./calc";
import { CATEGORY_LABEL, RACE_FORMAT_LABEL, categoryFormat, raceCategory } from "./categories";
import { ownTotalPct, raceCruise } from "./raceDebrief";
import { wallBallNoReps } from "./noReps";

/** En dessous (s), un écart n'est ni un progrès ni un recul. */
export const COMPARE_NOTABLE_S = 5;

export type CompareGroup = "chrono" | "runs" | "stations" | "roxzone";

export interface CompareRow {
  key: string;
  label: string;
  group: CompareGroup;
  before: number | null;
  after: number | null;
  /** après − avant (s) ; négatif = progrès. `null` si une valeur manque. */
  deltaS: number | null;
  /** `true` progrès, `false` recul, `null` écart faible, non jugé ou non comparable. */
  better: boolean | null;
  /** Ligne affichée mais non jugée (run 1, station non comparable). */
  judged: boolean;
  note: string | null;
  /** Format d'affichage : temps (m:ss), allure (s/km) ou nombre (no reps). */
  unit: "time" | "pace" | "count";
}

export interface RaceComparison {
  before: HyroxResult;
  after: HyroxResult;
  sameFormat: boolean;
  sameCategory: boolean;
  /** Avertissements de comparabilité, à afficher en clair. */
  warnings: string[];
  rows: CompareRow[];
  positionBefore: number | null;
  positionAfter: number | null;
  improved: CompareRow[];
  regressed: CompareRow[];
}

const seg = (r: HyroxResult, k: string): number | null => {
  const v = (r as unknown as Record<string, number | null | undefined>)[`${k}_s`];
  return typeof v === "number" && v > 0 ? v : null;
};

/** Range deux courses : la plus ancienne d'abord. */
export function orderRaces(a: HyroxResult, b: HyroxResult): [HyroxResult, HyroxResult] {
  return a.date <= b.date ? [a, b] : [b, a];
}

/** Courses proposées pour comparer : toutes les autres terminées, la plus récente d'abord. */
export function compareCandidates(race: HyroxResult, races: readonly HyroxResult[]): HyroxResult[] {
  return races.filter((r) => r.id !== race.id && r.status === "finished" && r.total_s > 0).sort((a, b) => b.date.localeCompare(a.date));
}

function row(group: CompareGroup, key: string, label: string, before: number | null, after: number | null, judged: boolean, note: string | null, unit: CompareRow["unit"] = "time"): CompareRow {
  const deltaS = before != null && after != null ? Math.round(after - before) : null;
  // Nombre (no reps) : un d'écart compte ; temps : 5 s.
  const notable = unit === "count" ? 1 : COMPARE_NOTABLE_S;
  const better = !judged || deltaS == null || Math.abs(deltaS) < notable ? null : deltaS < 0;
  return { key, label, group, before, after, deltaS, better, judged, note, unit };
}

export function compareRaces(x: HyroxResult, y: HyroxResult, refs: RefLookup | null): RaceComparison {
  const [before, after] = orderRaces(x, y);
  const catB = raceCategory(before);
  const catA = raceCategory(after);
  const fmtB = categoryFormat(catB);
  const fmtA = categoryFormat(catA);
  const sameFormat = fmtB === fmtA;
  const sameCategory = catB === catA;
  const warnings: string[] = [];
  if (!sameFormat) {
    warnings.push(`${RACE_FORMAT_LABEL[fmtB]} contre ${RACE_FORMAT_LABEL[fmtA].toLowerCase()} : les stations ne se comparent pas (partagées en duo, réparties en relais). Seuls le chrono (par la position dans chaque catégorie), les runs et la Roxzone se comparent.`);
  } else if (!sameCategory) {
    warnings.push(`${CATEGORY_LABEL[catB]} contre ${CATEGORY_LABEL[catA].toLowerCase()} : les stations à charge différente ne sont pas jugées. Le chrono se compare par la position dans chaque catégorie.`);
  }

  const rows: CompareRow[] = [];
  const positionBefore = refs ? ownTotalPct(before, refs) : null;
  const positionAfter = refs ? ownTotalPct(after, refs) : null;
  rows.push(row("chrono", "total", "Chrono", before.total_s, after.total_s, sameCategory,
    sameCategory ? null : "Catégories différentes : compare plutôt la position."));

  rows.push(row("runs", "cruise", "Croisière (runs 2 à 7)", raceCruise(before), raceCruise(after), true, null, "pace"));
  for (const k of RUN_KEYS) {
    const first = k === "run_1";
    rows.push(row("runs", k, `Run ${k.slice(4)}`, seg(before, k), seg(after, k), !first,
      first ? "Départ : change d'une course à l'autre, non jugé." : k === "run_8" ? "Parcours parfois différent." : null));
  }

  const loadsB = DIVISION_LOADS[catB];
  const loadsA = DIVISION_LOADS[catA];
  for (const k of STATION_KEYS) {
    const sameLoad = loadsB?.[k] != null && loadsB[k] === loadsA?.[k];
    const ok = sameFormat && sameLoad;
    const note = !sameFormat ? "Format différent : non comparable." : !sameLoad ? `Charge différente (${loadsB?.[k] ?? "—"} contre ${loadsA?.[k] ?? "—"}).` : null;
    rows.push(row("stations", k, STATION_META[k as StationKey].label, seg(before, k), seg(after, k), ok, note));
  }
  // No reps wall balls (saisie manuelle) : moins = mieux ; jugé comme la station (même format et même charge).
  const nrB = wallBallNoReps(before)?.total ?? null;
  const nrA = wallBallNoReps(after)?.total ?? null;
  if (nrB != null || nrA != null) {
    const wbOk = sameFormat && loadsB?.wall_balls != null && loadsB.wall_balls === loadsA?.wall_balls;
    rows.push(row("stations", "wall_balls_no_reps", "No reps wall balls", nrB, nrA, wbOk,
      nrB == null || nrA == null ? "Non saisi sur une des deux courses." : wbOk ? null : "Ballon ou cible différents : non jugé.", "count"));
  }
  rows.push(row("roxzone", "roxzone", "Roxzone", roxzoneTotal(before), roxzoneTotal(after), true, null));

  // Progrès / reculs : runs détaillés hors croisière (déjà résumés par elle) et hors run 1.
  const judgedRows = rows.filter((r) => r.better != null && r.key !== "total");
  const improved = judgedRows.filter((r) => r.better).sort((a, b) => (a.deltaS ?? 0) - (b.deltaS ?? 0));
  const regressed = judgedRows.filter((r) => r.better === false).sort((a, b) => (b.deltaS ?? 0) - (a.deltaS ?? 0));
  return { before, after, sameFormat, sameCategory, warnings, rows, positionBefore, positionAfter, improved, regressed };
}

