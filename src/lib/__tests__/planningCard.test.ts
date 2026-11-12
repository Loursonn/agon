import { describe, expect, it } from "vitest";
import type { DoneActivity, PlannedItem, PlannedVsDoneDay } from "@/lib/plannedVsDone";
import { associableOf, freeCard, isSyncing, plannedCard, watchCardsOfDay } from "@/lib/planningCard";

const NOW = Date.parse("2026-11-10T19:30:00Z");

const act = (p: Partial<DoneActivity> = {}): DoneActivity => ({
  id: "a1", date: "2026-11-10", startedAt: "2026-11-10T17:34:00Z", source: "garmin", sport: "running",
  distanceM: 7400, durationS: 2890, deviceName: "Forerunner 265", zoneShares: [20, 60, 20],
  avgPaceSPerKm: 390, avgHr: 152, hasStream: true, ...p,
});

const planned = (p: Partial<PlannedItem> = {}): PlannedItem => ({
  kind: "energy", id: "e1", date: "2026-11-10", label: "Fractionné 2 × 1 000 m", status: "planned",
  activity: null, linkId: null, linkStatus: null, done: false, rpe: null, ...p,
});

describe("planningCard", () => {
  it("prévue sans activité : rien de la montre", () => {
    const c = plannedCard(planned(), NOW);
    expect(c).toMatchObject({ state: "planned", badge: "Énergie", activityId: null, summary: "—", attribution: null });
  });

  it("lien auto → à confirmer, avec résumé, allure, attribution Garmin et heure de départ", () => {
    const c = plannedCard(planned({ activity: act(), linkId: "l1", linkStatus: "auto", done: true }), NOW);
    expect(c.state).toBe("toConfirm");
    expect(c.badge).toBe("Course");
    expect(c.summary).toBe("7,4 km · 48:10");
    expect(c.pace).toBe("6'30");
    expect(c.paceUnit).toBe("/km");
    expect(c.attribution).toBe("Garmin Forerunner 265");
    expect(c.brand).toBe("Garmin");
    expect(c.linkId).toBe("l1");
    expect(c.planned).toEqual({ kind: "energy", id: "e1" });
  });

  it("lien confirmé → réalisée (une seule carte)", () => {
    const c = plannedCard(planned({ activity: act(), linkId: "l1", linkStatus: "confirmed", done: true }), NOW);
    expect(c.state).toBe("done");
    expect(c.zoneShares).toEqual([20, 60, 20]);
  });

  it("synchro en cours : montre connectée, pas de fichier, fini depuis moins de 3 h", () => {
    expect(isSyncing(act({ hasStream: false }), NOW)).toBe(true);
    expect(isSyncing(act({ hasStream: false }), NOW + 4 * 3600_000)).toBe(false);
    expect(isSyncing(act({ hasStream: false, source: "file_import" }), NOW)).toBe(false);
    expect(isSyncing(act({ hasStream: undefined }), NOW)).toBe(false);
    const c = plannedCard(planned({ activity: act({ hasStream: false }), linkId: "l1", linkStatus: "auto" }), NOW);
    expect(c.state).toBe("syncing");
  });

  it("vélo : vitesse en km/h ; mesures absentes → « — », pas d'allure", () => {
    const bike = freeCard(act({ sport: "cycling", avgPaceSPerKm: 133, distanceM: 27000, durationS: 3600 }), NOW);
    expect(bike.pace).toBe("27,1");
    expect(bike.paceUnit).toBe("km/h");
    expect(bike.title).toBe("Vélo libre");
    const empty = freeCard(act({ distanceM: null, durationS: null, avgPaceSPerKm: null }), NOW);
    expect(empty.summary).toBe("—");
    expect(empty.pace).toBeNull();
  });

  it("activité libre : titre de la sortie sinon « Course libre », import fichier attribué", () => {
    expect(freeCard(act({ title: "Sortie du dimanche" }), NOW).title).toBe("Sortie du dimanche");
    const c = freeCard(act({ source: "file_import", deviceName: null }), NOW);
    expect(c).toMatchObject({ state: "free", badge: "Séance libre", title: "Course libre", attribution: "Import fichier", brand: "Import" });
  });

  it("cartes du jour : séances rattachées puis activités libres ; séances associables", () => {
    const day: PlannedVsDoneDay = {
      date: "2026-11-10",
      planned: [
        planned({ id: "e1", activity: act(), linkId: "l1", linkStatus: "auto" }),
        planned({ id: "e2" }),
        planned({ id: "w1", kind: "workout", status: "completed" }),
      ],
      free: [act({ id: "a2" })],
    };
    expect(watchCardsOfDay(day, NOW).map((c) => [c.key, c.state])).toEqual([["energy:e1", "toConfirm"], ["activity:a2", "free"]]);
    expect(associableOf(day).map((p) => p.id)).toEqual(["e2", "w1"]);
    expect(watchCardsOfDay(undefined, NOW)).toEqual([]);
  });
});
