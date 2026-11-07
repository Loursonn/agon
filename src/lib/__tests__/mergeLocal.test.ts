import { describe, it, expect } from "vitest";
import { mergeLocalIntoServer } from "@/lib/mergeLocal";

type History = Record<string, { score: number; poids?: number }>;

describe("mergeLocalIntoServer", () => {
  it("rien de touché localement → la base fait foi", () => {
    expect(mergeLocalIntoServer({ a: 1 }, {}, {})).toEqual({ a: 1 });
    expect(mergeLocalIntoServer([1, 2], [], [])).toEqual([1, 2]);
    const goalsFb = { sessionsPerWeek: 6, sleepTarget: 8 };
    expect(mergeLocalIntoServer({ sessionsPerWeek: 4, sleepTarget: 9 }, goalsFb, goalsFb))
      .toEqual({ sessionsPerWeek: 4, sleepTarget: 9 });
  });

  it("historique wellness : le jour saisi hors chargement s'ajoute sans effacer l'historique", () => {
    const server: History = { "20261105": { score: 60 }, "20261106": { score: 70 } };
    const local: History = { "20261107": { score: 80 } };
    expect(mergeLocalIntoServer(server, local, {})).toEqual({ ...server, ...local });
  });

  it("même jour déjà en base : champs locaux gagnants, les autres conservés", () => {
    const server: History = { "20261107": { score: 50, poids: 80 } };
    const local: History = { "20261107": { score: 75 } };
    expect(mergeLocalIntoServer(server, local, {})).toEqual({ "20261107": { score: 75, poids: 80 } });
  });

  it("champs laissés au défaut ne remplacent pas la base (poids de corps)", () => {
    const fb = { current: 0, target: 0 };
    expect(mergeLocalIntoServer({ current: 80, target: 75 }, { current: 82, target: 0 }, fb))
      .toEqual({ current: 82, target: 75 });
  });

  it("tableaux à id : fusion par id, la version locale gagne", () => {
    const server = [{ id: "1", zone: "genou" }, { id: "2", zone: "dos" }];
    const local = [{ id: "2", zone: "dos", status: "guérie" }, { id: "3", zone: "épaule" }];
    expect(mergeLocalIntoServer(server, local, [])).toEqual([
      { id: "1", zone: "genou" },
      { id: "2", zone: "dos", status: "guérie" },
      { id: "3", zone: "épaule" },
    ]);
  });

  it("tableaux sans id : union sans doublon", () => {
    const server = [{ date: "d1", kg: 80 }];
    const local = [{ date: "d1", kg: 80 }, { date: "d2", kg: 81 }];
    expect(mergeLocalIntoServer(server, local, [])).toEqual([{ date: "d1", kg: 80 }, { date: "d2", kg: 81 }]);
  });

  it("séances validées par semaine : union des ids", () => {
    expect(mergeLocalIntoServer({ 1: ["a", "b"], 2: ["c"] }, { 1: ["d"] }, {}))
      .toEqual({ 1: ["a", "b", "d"], 2: ["c"] });
  });

  it("base vide (null) → valeur locale", () => {
    expect(mergeLocalIntoServer(null, { date: "20261107", score: 80 }, null))
      .toEqual({ date: "20261107", score: 80 });
  });
});
