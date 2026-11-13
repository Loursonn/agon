import { describe, expect, it } from "vitest";
import { addDays } from "@shared/domain/dates";
import type { WellnessEntry, WellnessHistory } from "@shared/domain/wellness";
import { domsByWorkout, domsByZone, domsMaxLevels, feltSummary, itemGrid } from "../coachWellness";

const entry = (day: string, v: number, extra: Partial<WellnessEntry> = {}): WellnessEntry =>
  ({
    day,
    items: { fatigue: v, sommeil: v, stress: v, energie: v, doms: v },
    sleep: {},
    domsZones: [],
    domsPoints: [],
    domsLevels: {},
    domsWorkout: null,
    envie: v,
    pain: null,
    ...extra,
  }) as unknown as WellnessEntry;

const TODAY = "2026-11-13";

describe("feltSummary", () => {
  it("7 jours face aux 28 jours d'avant", () => {
    const h: WellnessHistory = {};
    for (let i = 7; i < 35; i++) { const d = addDays(TODAY, -i); h[d] = entry(d, 4); }
    for (let i = 0; i < 7; i++) { const d = addDays(TODAY, -i); h[d] = entry(d, 2, { items: { fatigue: 3, sommeil: 3, stress: 1, energie: 3, doms: 3 } } as Partial<WellnessEntry>); }
    const s = feltSummary(h, TODAY);
    expect(s.envie7).toBe(2);
    expect(s.envieHabit).toBe(4);
    expect(s.envieLowDays).toBe(7);
    expect(s.lowestItem?.item).toBe("stress");
    expect(s.score7!).toBeLessThan(s.scoreHabit!);
  });

  it("sans saisie : tout à null", () => {
    const s = feltSummary({}, TODAY);
    expect(s.score7).toBeNull();
    expect(s.envie7).toBeNull();
    expect(s.lowestItem).toBeNull();
  });
});

describe("itemGrid", () => {
  it("6 lignes de 28 jours, z null tant qu'il y a moins de 7 saisies", () => {
    const h: WellnessHistory = { [TODAY]: entry(TODAY, 3) };
    const g = itemGrid(h, TODAY);
    expect(g).toHaveLength(6);
    expect(g[0].cells).toHaveLength(28);
    expect(g[0].cells[27]).toEqual({ day: TODAY, value: 3, z: null });
    expect(g[0].cells[0].value).toBeNull();
  });

  it("une valeur basse ressort en z négatif", () => {
    const h: WellnessHistory = {};
    for (let i = 1; i < 10; i++) { const d = addDays(TODAY, -i); h[d] = entry(d, 4); }
    h[TODAY] = entry(TODAY, 1);
    const last = itemGrid(h, TODAY)[0].cells[27];
    expect(last.z!).toBeLessThan(-1.5);
  });
});

describe("domsByZone", () => {
  it("compte les jours par zone, garde le niveau max et la séance", () => {
    const h: WellnessHistory = {
      [TODAY]: entry(TODAY, 3, { domsLevels: { ischios: 2 }, domsWorkout: { id: "w", name: "SDT roumain" } } as Partial<WellnessEntry>),
      [addDays(TODAY, -1)]: entry(addDays(TODAY, -1), 3, { domsLevels: { ischios: 1, fessiers: 1 } } as Partial<WellnessEntry>),
      [addDays(TODAY, -9)]: entry(addDays(TODAY, -9), 3, { domsLevels: { epaules: 3 } } as Partial<WellnessEntry>),
    };
    const z = domsByZone(h, TODAY);
    expect(z.map((x) => x.id)).toEqual(["ischios", "fessiers"]);
    expect(z[0]).toMatchObject({ days: 2, maxLevel: 2, workouts: ["SDT roumain"] });
    expect(domsMaxLevels(z)).toEqual({ ischios: 2, fessiers: 1 });
  });
});

describe("domsByWorkout", () => {
  it("regroupe les courbatures par séance de la veille", () => {
    const h: WellnessHistory = {
      [TODAY]: entry(TODAY, 3, { domsLevels: { ischios: 2 }, domsWorkout: { id: "a", name: "SDT" } } as Partial<WellnessEntry>),
      [addDays(TODAY, -3)]: entry(addDays(TODAY, -3), 3, { domsLevels: { ischios: 3, fessiers: 1 }, domsWorkout: { id: "b", name: "SDT" } } as Partial<WellnessEntry>),
      [addDays(TODAY, -2)]: entry(addDays(TODAY, -2), 3, { domsLevels: {}, domsWorkout: { id: "c", name: "VO2" } } as Partial<WellnessEntry>),
    };
    const r = domsByWorkout(h, TODAY);
    expect(r.map((x) => x.name)).toEqual(["SDT", "VO2"]);
    expect(r[0].zones).toEqual([{ id: "ischios", label: expect.any(String), level: 3 }, { id: "fessiers", label: expect.any(String), level: 1 }]);
    expect(r[1].zones).toEqual([]);
  });
});
