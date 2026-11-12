import { describe, expect, it } from "vitest";
import { firstPendingBloc, nextPendingSet, stepValue, supersetChains } from "@/lib/workoutFocus";

const done = { done: true };
const skip = { skipped: true };
const open = { done: false };

describe("nextPendingSet", () => {
  it("exercices seuls : première série restante du premier exercice", () => {
    const exs = [{ id: "a", nbSets: 3 }, { id: "b", nbSets: 2 }];
    expect(nextPendingSet(exs, { a: [done, open, open] })).toEqual({ exId: "a", setIdx: 1, chain: ["a"] });
    expect(nextPendingSet(exs, { a: [done, skip, done] })).toEqual({ exId: "b", setIdx: 0, chain: ["b"] });
    expect(nextPendingSet(exs, { a: [done, done, done], b: [done, done] })).toBeNull();
  });

  it("superset : ex. 1 → ex. 2 → ex. 1…", () => {
    const exs = [{ id: "a", nbSets: 3, supersetWithNext: true }, { id: "b", nbSets: 3 }];
    expect(nextPendingSet(exs, {})?.exId).toBe("a");
    expect(nextPendingSet(exs, { a: [done] })).toEqual({ exId: "b", setIdx: 0, chain: ["a", "b"] });
    expect(nextPendingSet(exs, { a: [done], b: [done] })).toEqual({ exId: "a", setIdx: 1, chain: ["a", "b"] });
  });

  it("ignore les exercices libres ou en clusters, compte les séries bonus", () => {
    const exs = [{ id: "l", nbSets: 1, skip: true }, { id: "a", nbSets: 1 }];
    expect(nextPendingSet(exs, { a: [done, open] })).toEqual({ exId: "a", setIdx: 1, chain: ["a"] });
    expect(nextPendingSet([{ id: "l", nbSets: 1, skip: true }], {})).toBeNull();
  });
});

describe("firstPendingBloc / supersetChains / stepValue", () => {
  it("reprend au premier bloc inachevé", () => {
    const blocs = [[{ id: "a", nbSets: 1 }], [{ id: "b", nbSets: 1 }]];
    expect(firstPendingBloc(blocs, { a: [done] })).toBe(1);
    expect(firstPendingBloc(blocs, { a: [done], b: [done] })).toBe(1);
    expect(firstPendingBloc(blocs, {})).toBe(0);
  });

  it("découpe les chaînes", () => {
    const c = supersetChains([{ id: "a", nbSets: 1, supersetWithNext: true }, { id: "b", nbSets: 1 }, { id: "c", nbSets: 1 }]);
    expect(c.map((x) => x.map((e) => e.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("± sur une valeur texte", () => {
    expect(stepValue("67,5", 2.5)).toBe("70");
    expect(stepValue("", 1)).toBe("1");
    expect(stepValue("1", -2.5)).toBe("0");
  });
});
