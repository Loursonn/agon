import { describe, expect, it } from "vitest";
import { OBJECTIVE_GRID_V1 } from "../gridData";
import { gridFromRows, gridToRows } from "../grid";
import { objectiveFromRun } from "../model";

describe("grille de l'objectif en base", () => {
  it("grille → lignes → grille : aller-retour exact", () => {
    expect(gridFromRows(JSON.parse(JSON.stringify(gridToRows())))).toEqual(OBJECTIVE_GRID_V1);
  });
  it("une grille relue depuis la base donne le même objectif", () => {
    const grid = gridFromRows(gridToRows());
    expect(objectiveFromRun("women", 312, grid)).toEqual(objectiveFromRun("women", 312));
  });
});
