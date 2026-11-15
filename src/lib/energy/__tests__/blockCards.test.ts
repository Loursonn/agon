import { describe, expect, it } from "vitest";
import type { EnergyGroup, EnergyInterval, EnergyStep } from "@/types/energy";
import {
  blockCardKind, blockSummary, blockZone, newBlock, orderedRange, parseClock, parseDistance, parsePace, parseSpeedKmh, parseWhole,
  patchMain, setRepeat, setRest,
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

describe("saisie telle qu'un coach l'écrit (retour d'Hugo du 2026-11-15)", () => {
  it("allure : toutes les écritures courantes de 4'05", () => {
    for (const s of ["4'05", "4’05", "4:05", "4.05", "4,05", "4'05''", "4'05\"", "4’05”", "4 05", "4min05", "4 min 05", "405", "4'05/km", "4'05 /km", "4′05", "4'5"]) {
      expect(parsePace(s), s).toBe(245);
    }
    expect(parsePace("4")).toBe(240);
    expect(parsePace("4 min")).toBe(240);
    expect(parsePace("12'30")).toBe(750);
  });

  it("allure : illisible ou absurde → null (le champ passe en rouge)", () => {
    for (const s of ["", "abc", "4'60", "460", "0", "0'30", "45'00", "4-05"]) expect(parsePace(s), s).toBeNull();
  });

  it("vitesse en km/h stockée en secondes par km", () => {
    expect(parseSpeedKmh("15")).toBe(240);
    expect(parseSpeedKmh("15,5")).toBe(232);
    expect(parseSpeedKmh("15.5 km/h")).toBe(232);
    expect(parseSpeedKmh("0")).toBeNull();
    expect(parseSpeedKmh("255")).toBeNull();
  });

  it("durées", () => {
    expect(parseClock("2'30''")).toBe(150);
    expect(parseClock("2m30")).toBe(150);
    expect(parseClock("45\"")).toBe(45);
    expect(parseClock("1h")).toBe(3600);
    expect(parseClock("1h30")).toBe(5400);
    expect(parseClock("1 h 05 min")).toBe(3900);
    expect(parseClock("1:05:00")).toBe(3900);
    expect(parseClock("2:75")).toBeNull();
    expect(parseClock("0")).toBeNull();
  });

  it("distances et nombres", () => {
    expect(parseDistance("1 000 m")).toBe(1000);
    expect(parseDistance("5k")).toBe(5000);
    expect(parseDistance("0")).toBeNull();
    expect(parseWhole("165")).toBe(165);
    expect(parseWhole("165 bpm")).toBe(165);
    expect(parseWhole("250W")).toBe(250);
    expect(parseWhole("abc")).toBeNull();
  });

  it("bornes remises dans l'ordre", () => {
    expect(orderedRange(265, 255)).toEqual([255, 265]);
    expect(orderedRange(255, 265)).toEqual([255, 265]);
    expect(orderedRange(255, 0)).toEqual([255, 0]);
  });
});
