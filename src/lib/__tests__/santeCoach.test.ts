import { describe, expect, it } from "vitest";
import { feltMeasuredRows, feltMeasuredSeries, gapSentence } from "../santeCoach";
import type { HealthDay } from "@/api/health";
import type { WellnessHistory } from "@shared/domain/wellness";
import { addDays } from "@shared/domain/dates";

const hd = (d: string, sleepScore: number | null) => ({ day: d, source: "garmin", attribution: "Garmin", sleepScore, bodyBatteryMax: null, stressAvg: null } as unknown as HealthDay);
const start = "2026-10-01";
const today = addDays(start, 28);
const health = [...Array.from({ length: 28 }, (_, i) => hd(addDays(start, i), 76 + (i % 5))), hd(today, 52)];
const wh = {
  [today]: { items: { sommeil: 4, energie: 4, stress: 3, fatigue: 4, doms: 2 } },
  [addDays(today, -1)]: { items: { sommeil: 3, energie: null, stress: null, fatigue: null, doms: null } },
} as unknown as WellnessHistory;

describe("santeCoach", () => {
  it("ligne seulement si ressenti et mesure existent", () => {
    const rows = feltMeasuredRows(health, wh, today);
    expect(rows.map((r) => r.def.key)).toEqual(["sommeil"]);
    expect(rows[0]).toMatchObject({ felt: 4, measured: 52, agr: "ecart", source: "Garmin" });
    expect(rows[0].mean).toBeCloseTo(78, 0);
  });

  it("série 28 j : ressenti × 20, null sans donnée", () => {
    const s = feltMeasuredSeries(health, wh, "sommeil", today, 28);
    expect(s).toHaveLength(28);
    expect(s[27]).toEqual({ day: today, felt: 80, measured: 52 });
    expect(s[26].felt).toBe(60);
    expect(s[0].felt).toBeNull();
    expect(feltMeasuredSeries([], wh, "energie", today, 3)[2]).toEqual({ day: today, felt: 80, measured: null });
  });

  it("phrase d'écart", () => {
    expect(gapSentence("Léa", 4, 3)).toBe("Léa se dit en forme, mais sa nuit est courte et sa récupération basse depuis 3 jours.");
    expect(gapSentence("Léa", 1, 1)).toBe("Léa se dit en forme, mais sa nuit est courte et sa récupération basse.");
    expect(gapSentence("Léa", 2, null)).toBe("Léa se dit en forme, mais ses nuits sont courtes depuis 2 jours.");
    expect(gapSentence("Léa", null, 1)).toBe("Léa se dit en forme, mais sa récupération mesurée est basse ce matin.");
    expect(gapSentence("Léa", null, null)).toBeNull();
  });
});
