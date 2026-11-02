import { describe, expect, it } from "vitest";
import { addDaysIso, defaultSessionDates, mondayOf, nextMondayIso, planTestWeek } from "@/lib/hyrox/tests";

describe("semaine de tests · dates", () => {
  it("lundi de la semaine, prochain lundi", () => {
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // dimanche
    expect(mondayOf("2026-11-04")).toBe("2026-11-02"); // mercredi
    expect(nextMondayIso("2026-11-01")).toBe("2026-11-02");
    expect(nextMondayIso("2026-11-02")).toBe("2026-11-02"); // lundi : aujourd'hui
    expect(nextMondayIso("2026-11-03")).toBe("2026-11-09");
    expect(addDaysIso("2026-12-28", 6)).toBe("2027-01-03");
  });

  it("semaine type : lun S1 · mar S2 · jeu S3 · ven S4 · dim S5", () => {
    expect(defaultSessionDates("2026-11-02")).toEqual({
      S1: "2026-11-02", S2: "2026-11-03", S3: "2026-11-05", S4: "2026-11-06", S5: "2026-11-08",
    });
  });
});

describe("semaine de tests · plan", () => {
  const tests = [
    { id: "a", name: "Broad jump", battery_session: "S1" as const },
    { id: "b", name: "Rameur 2000 m", battery_session: "S2" as const },
    { id: "c", name: "Sled push · semaine 1", battery_session: "W1" as const },
  ];
  const dates = defaultSessionDates("2026-11-02");

  it("chaque test à la date de sa séance, sans la Semaine 1", () => {
    expect(planTestWeek(tests, dates, [])).toEqual([
      { testId: "a", name: "Broad jump", session: "S1", date: "2026-11-02", alreadyThere: false },
      { testId: "b", name: "Rameur 2000 m", session: "S2", date: "2026-11-03", alreadyThere: false },
    ]);
  });

  it("un test déjà prévu ou fait ce jour-là n'est pas doublé (titre sans casse)", () => {
    const plan = planTestWeek(tests, dates, [{ title: "broad jump", date: "2026-11-02" }, { title: "Rameur 2000 m", date: "2026-11-10" }]);
    expect(plan.map(p => p.alreadyThere)).toEqual([true, false]);
  });

  it("un jour déplacé est pris en compte", () => {
    const plan = planTestWeek(tests, { ...dates, S2: "2026-11-07" }, []);
    expect(plan.find(p => p.testId === "b")!.date).toBe("2026-11-07");
  });
});
