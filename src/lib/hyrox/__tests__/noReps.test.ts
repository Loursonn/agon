import { describe, expect, it } from "vitest";
import { fmtNoReps, parseNoRepInput, wallBallNoReps } from "../noReps";

describe("no reps wall balls", () => {
  it("rien de renseigné : null et « — », jamais 0", () => {
    expect(wallBallNoReps({ wall_balls_no_rep_target: null, wall_balls_no_rep_depth: null })).toBeNull();
    expect(wallBallNoReps({})).toBeNull();
    expect(fmtNoReps(null)).toBe("—");
  });
  it("les deux compteurs : total et détail", () => {
    const nr = wallBallNoReps({ wall_balls_no_rep_target: 4, wall_balls_no_rep_depth: 2 });
    expect(nr).toEqual({ target: 4, depth: 2, total: 6 });
    expect(fmtNoReps(nr)).toBe("6 no reps : 4 cible, 2 parallèle");
    expect(fmtNoReps(wallBallNoReps({ wall_balls_no_rep_target: 1, wall_balls_no_rep_depth: 0 }))).toBe("1 no rep : 1 cible, 0 parallèle");
    expect(fmtNoReps(wallBallNoReps({ wall_balls_no_rep_target: 0, wall_balls_no_rep_depth: 0 }))).toBe("0 no rep");
  });
  it("un seul compteur : pas de total, l'autre en « — »", () => {
    const nr = wallBallNoReps({ wall_balls_no_rep_target: 3, wall_balls_no_rep_depth: null });
    expect(nr?.total).toBeNull();
    expect(fmtNoReps(nr)).toBe("No reps : 3 cible, parallèle —");
  });
  it("saisie", () => {
    expect(parseNoRepInput("")).toBeNull();
    expect(parseNoRepInput(" 7 ")).toBe(7);
    expect(parseNoRepInput("0")).toBe(0);
    expect(parseNoRepInput("-1")).toBeUndefined();
    expect(parseNoRepInput("2.5")).toBeUndefined();
    expect(parseNoRepInput("900")).toBeUndefined();
  });
});
