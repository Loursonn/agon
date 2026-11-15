import { describe, expect, it } from "vitest";
import type { EnergyStep } from "@/types/energy";
import { getWorkIntervals } from "@/features/athlete/components/today/todayEnergyUtils";
import { logBlocks, stepMinutes } from "../energyLog";

const iv = (id: string, role: string, s: number, target: unknown = { kind: "none" }) =>
  ({ type: "interval", id, role, duration: { kind: "time", value: s }, target }) as unknown as EnergyStep;

describe("logBlocks", () => {
  it("nomme chaque bloc par son contenu (« Z1/Z2 » : 20 + 40 min)", () => {
    const steps = [iv("a", "work", 1200, { kind: "hr_zone", zone: 1 }), iv("b", "work", 2400, { kind: "hr_zone", zone: 2 })];
    expect(logBlocks(steps).map((b) => [b.id, b.phrase, b.rep])).toEqual([
      ["a", "20 min à Z1", null],
      ["b", "40 min à Z2", null],
    ]);
  });

  it("déplie les répétitions avec les mêmes clés que block_logs", () => {
    const steps = [
      iv("wu", "warmup", 600),
      { type: "group", id: "g", role: "work", repeat: 4, children: [iv("w", "work", 360), iv("r", "recovery", 120)] } as unknown as EnergyStep,
      iv("cd", "cooldown", 600),
    ];
    const blocks = logBlocks(steps);
    expect(blocks.map((b) => b.id)).toEqual(getWorkIntervals(steps).map((b) => b.id));
    expect(blocks.map((b) => b.rep)).toEqual(["1 / 4", "2 / 4", "3 / 4", "4 / 4"]);
    expect(blocks[0].phrase).toBe("6 min");
  });

  it("groupe dans un groupe : répétitions multipliées", () => {
    const inner = { type: "group", id: "gi", role: "work", repeat: 3, children: [iv("w", "work", 60)] };
    const steps = [{ type: "group", id: "go", role: "work", repeat: 2, children: [inner] }] as unknown as EnergyStep[];
    const blocks = logBlocks(steps);
    expect(blocks.map((b) => b.id)).toEqual(getWorkIntervals(steps).map((b) => b.id));
    expect(blocks).toHaveLength(6);
    expect(blocks[5].rep).toBe("6 / 6");
  });

  it("ignore échauffement, récup et retour au calme", () => {
    expect(logBlocks([iv("wu", "warmup", 600), iv("cd", "cooldown", 600)])).toEqual([]);
  });
});

describe("stepMinutes", () => {
  it("ajoute ou retire des minutes", () => {
    expect(stepMinutes("45", 5)).toBe("50");
    expect(stepMinutes("45", -5)).toBe("40");
  });
  it("part du prévu quand le champ est vide", () => {
    expect(stepMinutes("", 5, 60)).toBe("65");
  });
  it("reste entre 1 et 600 min", () => {
    expect(stepMinutes("3", -5)).toBe("1");
    expect(stepMinutes("598", 5)).toBe("600");
  });
});
