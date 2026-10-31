import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GRID_SET_V1, analyzeTests, gridSetFromRows, gridSetToRows, seedSql, primaryMetric } from "@/lib/hyrox/tests";

const MIGRATION = path.resolve(__dirname, "../../../supabase/migrations/20261101130000_hyrox_tests.sql");
const sql = fs.readFileSync(MIGRATION, "utf8");

describe("Tests HYROX : base", () => {
  it("GridSet -> lignes -> GridSet : aller-retour exact", () => {
    const back = gridSetFromRows("v1", JSON.parse(JSON.stringify(gridSetToRows(GRID_SET_V1))));
    expect(back).toEqual(GRID_SET_V1);
  });

  it("le seed de la migration est exactement seedSql(GRID_SET_V1)", () => {
    const begin = "-- BEGIN SEED v1 (généré par seedSql(gridSetToRows(GRID_SET_V1)), ne pas éditer)\n";
    const i = sql.indexOf(begin), k = sql.indexOf("-- END SEED v1");
    expect(i).toBeGreaterThan(0);
    const seed = sql.slice(i + begin.length, k).trim();
    expect(seed).toBe(seedSql(gridSetToRows(GRID_SET_V1), { active: true, notes: "Seed v1 : grilles, poids et règles du radar bilan YOXX du 31/10/2026." }));
  });

  it("une ligne de grille désactivée est ignorée, le reste du calcul tient", () => {
    const rows = gridSetToRows(GRID_SET_V1);
    rows.grids.forEach(g => { if (g.metric_key === "dead_hang") g.active = false; });
    const set = gridSetFromRows("v1", rows);
    const out = analyzeTests({ dead_hang_s: 75, run_1200m: { duration_s: 270 }, run_12min: { distance_m: 2750 } }, { sex: "H", category: "Open" }, { set });
    expect(out.scores.axes.find(a => a.key === "grip")!.score).toBeNull();
    expect(out.scores.running.cs_kmh).not.toBeNull();
  });

  it("version incomplète : erreur explicite", () => {
    const rows = gridSetToRows(GRID_SET_V1);
    expect(() => gridSetFromRows("v2", rows)).toThrow(/v2/);
  });

  it("métrique principale d'une règle composée", () => {
    expect(primaryMetric({ all: [{ any: [{ metric: "note.row_2000", op: "<=", value: 2 }] }, { metric: "note.cs", op: ">=", value: 3 }] })).toBe("note.row_2000");
  });

  it("anciens presets HYROX conservés, marqués hyrox_legacy ; aucune suppression", () => {
    expect(sql).toMatch(/SET battery = 'hyrox_legacy'/);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/2RSPORT|Rivet/i);
  });

  it("batterie v3 : 21 tests répartis S1 à S5 et W1", () => {
    const ids = [...sql.matchAll(/\('00000000-0000-0000-0000-0000000000(d[1-9a-f]|e[0-5])', '([^']+)', 'hyrox', 'preset', true, 'self', 'hyrox_v3', '(S[1-5]|W1)'/g)];
    expect(ids).toHaveLength(21);
    const sessions = ids.map(m => m[3]);
    expect(new Set(sessions)).toEqual(new Set(["S1", "S2", "S3", "S4", "S5", "W1"]));
    // noms uniques (le trigger de synchro retrouve un test par son nom)
    expect(new Set(ids.map(m => m[2].toLowerCase())).size).toBe(ids.length);
  });
});
