/**
 * Grille de l'objectif HYROX en base (`hyrox_objective_grid`) : une ligne par
 * version, division et palier de run moyen. Conversion lignes ↔ grille et seed
 * SQL de la migration (le test vérifie que la migration contient exactement la
 * grille validée). Pur et testé.
 */
import { GRID_DIVISIONS, GRID_STATIONS, OBJECTIVE_GRID_SOURCE, OBJECTIVE_GRID_V1, OBJECTIVE_GRID_VERSION, type GridDivision, type GridRow } from "./gridData";
import type { ObjectiveGrid } from "./model";

export interface ObjectiveGridDbRow {
  version: string;
  division: string;
  run_avg_s: number;
  ski_s: number;
  sled_push_s: number;
  sled_pull_s: number;
  bbj_s: number;
  row_s: number;
  farmers_s: number;
  lunges_s: number;
  wall_balls_s: number;
  roxzone_s: number;
  run_shape: number[];
  source: string;
  is_estimate: boolean;
}

const COLS = GRID_STATIONS.map((k) => `${k}_s` as const);

export function gridToRows(grid: ObjectiveGrid = OBJECTIVE_GRID_V1, version = OBJECTIVE_GRID_VERSION, source = OBJECTIVE_GRID_SOURCE): ObjectiveGridDbRow[] {
  return GRID_DIVISIONS.flatMap((division) => grid[division].map((r) => {
    const row = { version, division, run_avg_s: r.run, roxzone_s: r.roxzone, run_shape: [...r.shape], source, is_estimate: false } as ObjectiveGridDbRow;
    COLS.forEach((c, j) => { (row as unknown as Record<string, number>)[c] = r.stations[j]; });
    return row;
  }));
}

/** Lignes d'une version → grille, triée par run moyen. Une division sans ligne reste vide. */
export function gridFromRows(rows: readonly ObjectiveGridDbRow[]): ObjectiveGrid {
  const out = Object.fromEntries(GRID_DIVISIONS.map((d) => [d, [] as GridRow[]])) as Record<GridDivision, GridRow[]>;
  for (const r of rows) {
    if (!(GRID_DIVISIONS as readonly string[]).includes(r.division)) continue;
    out[r.division as GridDivision].push({
      run: Number(r.run_avg_s),
      stations: COLS.map((c) => Number((r as unknown as Record<string, number>)[c])),
      roxzone: Number(r.roxzone_s),
      shape: r.run_shape.map(Number),
    });
  }
  for (const d of GRID_DIVISIONS) out[d].sort((a, b) => a.run - b.run);
  return out;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Seed SQL de la grille (versions + lignes), idempotent. */
export function objectiveSeedSql(rows: readonly ObjectiveGridDbRow[], opts: { active: boolean; notes: string }): string {
  const v = rows[0]?.version ?? OBJECTIVE_GRID_VERSION;
  const head = `INSERT INTO public.hyrox_objective_versions (version, active, notes) VALUES (${q(v)}, ${opts.active}, ${q(opts.notes)})\nON CONFLICT (version) DO NOTHING;`;
  const body =
    "INSERT INTO public.hyrox_objective_grid (version, division, run_avg_s, ski_s, sled_push_s, sled_pull_s, bbj_s, row_s, farmers_s, lunges_s, wall_balls_s, roxzone_s, run_shape, source, is_estimate) VALUES\n" +
    rows.map((r) =>
      `  (${q(r.version)}, ${q(r.division)}, ${r.run_avg_s}, ${COLS.map((c) => (r as unknown as Record<string, number>)[c]).join(", ")}, ${r.roxzone_s}, ARRAY[${r.run_shape.map((x) => x.toFixed(2)).join(", ")}]::numeric[], ${q(r.source)}, ${r.is_estimate})`,
    ).join(",\n") +
    "\nON CONFLICT (version, division, run_avg_s) DO NOTHING;";
  return `${head}\n\n${body}`;
}
