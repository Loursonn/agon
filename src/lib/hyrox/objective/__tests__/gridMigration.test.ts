import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { gridToRows, objectiveSeedSql } from "../grid";

const MIGRATION = path.resolve(__dirname, "../../../../../supabase/migrations/20261116180000_hyrox_objective.sql");
// Windows : le checkout peut mettre des CRLF ; le contenu SQL reste le même.
const sql = fs.readFileSync(MIGRATION, "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

describe("migration de la grille de l'objectif", () => {
  it("le seed de la migration est exactement objectiveSeedSql(gridToRows())", () => {
    const begin = "-- BEGIN SEED obj@1 (généré par objectiveSeedSql(gridToRows()), ne pas éditer)\n";
    const i = sql.indexOf(begin);
    const k = sql.indexOf("-- END SEED obj@1");
    expect(i).toBeGreaterThan(0);
    expect(sql.slice(i + begin.length, k).trim()).toBe(
      objectiveSeedSql(gridToRows(), { active: true, notes: "Grille v1 validée par Hugo le 15/11/2026 (docs/HYROX_OBJECTIF_CONCEPTION.md §3.4)." }),
    );
  });
});
