import { describe, expect, it } from "vitest";
import { linkFreeActivities, watchOthersAsFreeActivities, watchRunsAsFreeActivities } from "@/lib/watchFreeRuns";
import type { RunMatch, RunOuting } from "@/lib/watchRunMatching";

const outing = (p: Partial<RunOuting>): RunOuting => ({
  key: p.activityId ?? "k", date: "2026-11-18", km: 8.2, source: "watch", provider: "garmin", device: "Garmin Forerunner 265",
  origin: "activity", label: null, activityId: "a1", sport: "running", startedAt: "2026-11-18T07:00:00Z",
  durationS: 2700, elevationGainM: null, paceSPerKm: 329, ...p,
});

describe("watchRunsAsFreeActivities", () => {
  it("transforme une sortie de montre sans séance en activité libre du jour", () => {
    const [a] = watchRunsAsFreeActivities([outing({})], new Map(), "2026-11-16", "2026-11-22");
    expect(a).toMatchObject({
      id: "watch:a1", activityId: "a1", date: "2026-11-18", name: "Course · 8,2 km", sport: "course", duration: 45,
      note: "5'29/km · détectée par Garmin Forerunner 265",
    });
  });

  it("ignore les sorties rattachées à une séance prévue, les saisies et hors semaine", () => {
    const matched = new Map<string, RunMatch>([["a2", { plannedId: "p" } as RunMatch]]);
    const list = watchRunsAsFreeActivities([
      outing({ activityId: "a2" }),
      outing({ activityId: "a3", label: "Footing du coach" }),
      outing({ activityId: null, origin: "free" }),
      outing({ activityId: "a4", date: "2026-11-30" }),
    ], matched, "2026-11-16", "2026-11-22");
    expect(list).toEqual([]);
  });

  it("activité de montre hors course : affichée et ouvrable ; fusionnée avec l'activité libre saisie le même jour", () => {
    const velo = { id: "v1", source: "garmin", localDate: "2026-11-19", startedAt: "", sport: "cycling", distanceM: 32000, durationS: 4200, deviceName: "Garmin Edge" };
    expect(watchOthersAsFreeActivities([velo], "2026-11-16", "2026-11-22")[0]).toMatchObject({ activityId: "v1", name: "Vélo · 32 km", duration: 70 });
    const { free, usedOtherIds } = linkFreeActivities([{ id: "f1", name: "Vélo route", date: "2026-11-19" }], [], [velo]);
    expect(free[0].activityId).toBe("v1");
    expect(usedOtherIds.has("v1")).toBe(true);
  });
});
