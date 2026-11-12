import { describe, expect, it } from "vitest";
import { buildTestValueCards, formatPace, formatTestDelta, formatTestValue, groupTestCards, paceAtVma } from "../athleteTestValues";
import type { AthleteTestResult } from "@/features/shared/types/tests";

const v = (id: string, label: string, value: number, extra: Record<string, unknown> = {}) => ({
  id: id + value, result_id: "r", variable_id: id, value,
  test_variables: { id, key: label, label, unit: "km/h", value_type: "number", better_when: "higher", ...extra },
});
const res = (id: string, date: string, category: string | null, values: unknown[], battery: string | null = null): AthleteTestResult =>
  ({ id, athlete_id: "a", test_definition_id: "d", performed_at: date, notes: null, created_at: date, updated_at: date,
    test_definitions: { name: "Test " + id, category, battery }, athlete_test_values: values } as unknown as AthleteTestResult);

describe("athleteTestValues", () => {
  it("dernière valeur, écart avec la précédente, record", () => {
    const cards = buildTestValueCards([
      res("r3", "2026-10-21", "endurance", [v("vma", "VMA", 15.5)]),
      res("r1", "2026-02-03", "endurance", [v("vma", "VMA", 16)]),
      res("r2", "2026-09-02", "endurance", [v("vma", "VMA", 15)]),
    ]);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.latest.value).toBe(15.5);
    expect(c.delta).toBeCloseTo(0.5);
    expect(c.improved).toBe(true);
    expect(c.best.value).toBe(16);
    expect(c.history.map((p) => p.date)).toEqual(["2026-02-03", "2026-09-02", "2026-10-21"]);
  });

  it("plus bas = mieux pour un temps", () => {
    const t = { value_type: "duration", better_when: "lower", unit: "" };
    const [c] = buildTestValueCards([
      res("a", "2026-09-01", "endurance", [v("t3", "3 km", 742, t)]),
      res("b", "2026-10-01", "endurance", [v("t3", "3 km", 724, t)]),
    ]);
    expect(c.improved).toBe(true);
    expect(formatTestDelta(c.delta, "duration")).toBe("−18 s");
    expect(formatTestValue(c.latest.value, "duration")).toBe("12:04");
  });

  it("range par dominante, HYROX à part, un seul test = pas d'écart", () => {
    const cards = buildTestValueCards([
      res("a", "2026-11-04", "force", [v("sq", "Back squat", 95)]),
      res("b", "2026-11-04", null, [v("wb", "Wall balls", 62)], "hyrox_v3"),
      res("c", "2026-11-04", null, [v("x", "Autre", 1)]),
    ]);
    const groups = groupTestCards(cards);
    expect(groups.map((g) => g.group)).toEqual(["force", "hyrox", "autres"]);
    expect(groups[0].cards[0].delta).toBeNull();
    expect(groups[0].cards[0].improved).toBeNull();
  });

  it("formats", () => {
    expect(formatTestValue(15.5, "number")).toBe("15,5");
    expect(formatTestValue(null, "number")).toBe("—");
    expect(formatTestDelta(-0.4, "number")).toBe("−0,4");
    expect(formatPace(paceAtVma(15.5, 1))).toBe("3'52");
    expect(formatPace(paceAtVma(15.5, 0.7))).toBe("5'32");
    expect(paceAtVma(0, 1)).toBeNull();
  });
});
