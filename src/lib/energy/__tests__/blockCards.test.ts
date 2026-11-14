import { describe, expect, it } from "vitest";
import type { EnergyGroup, EnergyInterval, EnergyStep } from "@/types/energy";
import {
  blockCardKind, blockSummary, blockZone, newBlock, parseClock, parseDistance, parsePace, patchMain, setRepeat, setRest,
} from "../blockCards";
import { computeTotals, expandIntervals } from "../index";
import { makeRootGroup } from "../treeUtils";

const work: EnergyInterval = {
  type: "interval", id: "w", role: "work", duration: { kind: "time", value: 480 },
  target: { kind: "pace", min_s_per_unit: 255, max_s_per_unit: 265, unit: "min_per_km" }, notes: "relâché",
};
const intervals: EnergyGroup = {
  type: "group", id: "g", role: "work", repeat: 3, children: [work], instructions: "Garde la foulée",
  rest_between: { type: "interval", id: "r", role: "recovery", duration: { kind: "time", value: 120 }, target: { kind: "hr_zone", zone: 1 } },
};

describe("blockCardKind", () => {
  it("intervalle seul = simple, groupe d'un effort = intervalles", () => {
    expect(blockCardKind(work)).toBe("simple");
    expect(blockCardKind(intervals)).toBe("intervals");
  });
  it("groupe imbriqué, plusieurs pas, départ fixe ou exercice = avancé (gardé tel quel)", () => {
    expect(blockCardKind({ ...intervals, children: [work, work] })).toBe("advanced");
    expect(blockCardKind({ ...intervals, children: [intervals] })).toBe("advanced");
    expect(blockCardKind({ ...intervals, departure_every_s: 60 })).toBe("advanced");
    expect(blockCardKind({ type: "exercise", id: "e", role: "work", exercise_id: "x", exercise_name: "Burpees", target: { kind: "none" } })).toBe("advanced");
  });
});

describe("résumé", () => {
  it("lit comme la planche", () => {
    expect(blockSummary(intervals)).toBe("3 × 8 min à 4'15–4'25 /km · récup 2 min");
    expect(blockSummary(newBlock("warmup"))).toBe("15 min · zone 1");
    expect(blockZone(newBlock("intervals"))).toBe(3);
    expect(blockZone(intervals)).toBeNull();
  });
});

describe("écritures : même format en base", () => {
  it("modifier l'effort garde ids, notes, consignes et récup", () => {
    const next = patchMain(intervals, { duration: { kind: "distance", value: 1000 } }) as EnergyGroup;
    expect(next.id).toBe("g");
    expect(next.instructions).toBe("Garde la foulée");
    expect(next.rest_between).toBe(intervals.rest_between);
    expect(next.children[0]).toEqual({ ...work, duration: { kind: "distance", value: 1000 } });
    expect(intervals.children[0]).toBe(work);
  });
  it("répétitions bornées, récup retirée puis remise", () => {
    expect((setRepeat(intervals, 0) as EnergyGroup).repeat).toBe(1);
    const noRest = setRest(intervals, null) as EnergyGroup;
    expect("rest_between" in noRest).toBe(false);
    const back = setRest(noRest, { duration: { kind: "distance", value: 200 } }) as EnergyGroup;
    expect(back.rest_between).toMatchObject({ type: "interval", role: "recovery", duration: { kind: "distance", value: 200 } });
  });
  it("un bloc avancé n'est jamais touché", () => {
    const adv: EnergyStep = { ...intervals, children: [work, work] };
    expect(patchMain(adv, { duration: { kind: "time", value: 1 } })).toBe(adv);
  });
  it("les nouveaux blocs passent par les calculs existants (durée, zones)", () => {
    const root = { ...makeRootGroup(), children: [newBlock("warmup"), newBlock("intervals"), newBlock("cooldown")] };
    const totals = computeTotals(expandIntervals(root));
    // 15 min + 6 × 3 min + récups + 10 min
    expect(totals.durationS).toBeGreaterThanOrEqual((15 + 18 + 10) * 60);
    expect(JSON.parse(JSON.stringify(root.children))).toEqual(root.children);
  });
});

describe("saisie", () => {
  it("allure, temps, distance", () => {
    expect(parsePace("4'15")).toBe(255);
    expect(parsePace("4:05")).toBe(245);
    expect(parsePace("4'75")).toBeNull();
    expect(parseClock("8 min 00 s")).toBe(480);
    expect(parseClock("1:30")).toBe(90);
    expect(parseClock("45 s")).toBe(45);
    expect(parseClock("8")).toBe(480);
    expect(parseDistance("200 m")).toBe(200);
    expect(parseDistance("1,5 km")).toBe(1500);
    expect(parseDistance("abc")).toBeNull();
  });
});
