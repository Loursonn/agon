/**
 * Doublons inter-sources : la règle (pure) et la requête (base simulée).
 *
 * L'erreur à éviter en priorité est la sortie avalée — elle disparaît du
 * suivi sans message — plus que le doublon affiché, qui se voit et s'efface.
 */
import { describe, expect, it } from "vitest";
import { findCrossSourceDuplicate, isSameOuting } from "../activityDedup";

const T0 = "2026-11-06T07:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(T0) + sec * 1000).toISOString();

describe("isSameOuting", () => {
  it("rapproche deux départs à moins de 2 min, même sport", () => {
    expect(isSameOuting({ startedAt: T0, sport: "running" }, { startedAt: at(90), sport: "running" })).toBe(true);
  });

  it("borne incluse : 120 s pile est encore la même sortie", () => {
    expect(isSameOuting({ startedAt: T0, sport: "running" }, { startedAt: at(120), sport: "running" })).toBe(true);
    expect(isSameOuting({ startedAt: T0, sport: "running" }, { startedAt: at(-121), sport: "running" })).toBe(false);
  });

  it("deux sports connus et différents ne sont jamais un doublon (transition de triathlon)", () => {
    expect(isSameOuting({ startedAt: T0, sport: "swimming" }, { startedAt: at(60), sport: "cycling" })).toBe(false);
  });

  it("un sport inconnu d'un côté est compatible avec tout", () => {
    expect(isSameOuting({ startedAt: T0, sport: null }, { startedAt: at(30), sport: "cycling" })).toBe(true);
    expect(isSameOuting({ startedAt: T0, sport: "running" }, { startedAt: at(30), sport: null })).toBe(true);
  });

  it("compare les sports sans tenir compte de la casse ni des espaces", () => {
    expect(isSameOuting({ startedAt: T0, sport: "RUNNING " }, { startedAt: at(10), sport: "running" })).toBe(true);
  });

  it("une date illisible ne rapproche rien", () => {
    expect(isSameOuting({ startedAt: "pas une date", sport: null }, { startedAt: T0, sport: null })).toBe(false);
  });

  it("respecte une tolérance personnalisée", () => {
    expect(isSameOuting({ startedAt: T0, sport: null }, { startedAt: at(200), sport: null }, 300)).toBe(true);
    expect(isSameOuting({ startedAt: T0, sport: null }, { startedAt: at(200), sport: null }, 60)).toBe(false);
  });
});

// ─────────────────────────── Base simulée minimale ───────────────────────────

type Row = { id: string; athlete_id: string; source: string; external_id: string; sport: string | null; started_at: string };

function fake(rows: Row[], fail?: "external" | "time") {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      expect(table).toBe("provider_activities");
      const filters: Array<(r: Row) => boolean> = [];
      let kind: "external" | "time" = "time";
      const q = {
        select: () => q,
        eq: (c: keyof Row, v: unknown) => {
          if (c === "external_id") kind = "external";
          filters.push((r) => r[c] === v);
          return q;
        },
        gte: (c: keyof Row, v: string) => (filters.push((r) => Date.parse(r[c] as string) >= Date.parse(v)), q),
        lte: (c: keyof Row, v: string) => (filters.push((r) => Date.parse(r[c] as string) <= Date.parse(v)), q),
        order: () => q,
        limit: () => q,
        then: (res: (v: unknown) => unknown) => {
          calls.push(kind);
          if (fail === kind) return Promise.resolve({ data: null, error: { message: "base indisponible" } }).then(res);
          return Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(res);
        },
      };
      return q;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, calls };
}

const A = "athlete-1";
const base: Row[] = [
  { id: "strava-1", athlete_id: A, source: "file_import", external_id: "fit:aaa", sport: "running", started_at: "2026-11-06T07:00:30+00:00" },
  { id: "other-ath", athlete_id: "athlete-2", source: "coros", external_id: "fit:bbb", sport: "running", started_at: T0 },
];

describe("findCrossSourceDuplicate", () => {
  it("trouve la même empreinte, quelle que soit la source", async () => {
    const { db } = fake(base);
    const hit = await findCrossSourceDuplicate(db, { athleteId: A, sport: "cycling", startedAt: "2020-01-01T00:00:00Z", externalId: "fit:aaa" });
    expect(hit).toEqual({ id: "strava-1", source: "file_import" });
  });

  it("trouve la même sortie importée par une autre source à ±2 min", async () => {
    const { db } = fake(base);
    const hit = await findCrossSourceDuplicate(db, { athleteId: A, sport: "running", startedAt: T0, externalId: "fit:zzz" });
    expect(hit).toEqual({ id: "strava-1", source: "file_import" });
  });

  it("ignore un autre athlète", async () => {
    const { db } = fake(base);
    expect(await findCrossSourceDuplicate(db, { athleteId: "athlete-3", sport: "running", startedAt: T0, externalId: "fit:bbb" })).toBeNull();
  });

  it("ne rapproche pas deux sports différents démarrés ensemble", async () => {
    const { db } = fake(base);
    expect(await findCrossSourceDuplicate(db, { athleteId: A, sport: "cycling", startedAt: T0, externalId: "fit:zzz" })).toBeNull();
  });

  it("au-delà de la tolérance, ce n'est pas un doublon", async () => {
    const { db } = fake(base);
    expect(await findCrossSourceDuplicate(db, { athleteId: A, sport: "running", startedAt: at(200), externalId: null })).toBeNull();
  });

  it("sans empreinte, ne fait que la recherche par heure", async () => {
    const { db, calls } = fake(base);
    await findCrossSourceDuplicate(db, { athleteId: A, sport: null, startedAt: T0 });
    expect(calls).toEqual(["time"]);
  });

  it("lève si la base ne répond pas : « pas pu vérifier » n'est pas « pas de doublon »", async () => {
    await expect(
      findCrossSourceDuplicate(fake(base, "external").db, { athleteId: A, sport: null, startedAt: T0, externalId: "x" }),
    ).rejects.toThrow(/empreinte/);
    await expect(
      findCrossSourceDuplicate(fake(base, "time").db, { athleteId: A, sport: null, startedAt: T0, externalId: "x" }),
    ).rejects.toThrow(/heure de départ/);
  });
});

describe("sportsCompatible (même règle que outing_sports_compatible en SQL)", () => {
  it("rapproche HYROX et entraînement, sépare course et vélo", async () => {
    const { sportsCompatible, sportFamily } = await import("../activityDedup");
    expect(sportsCompatible("hyrox", "training")).toBe(true);
    expect(sportsCompatible("running", "trail_running")).toBe(true);
    expect(sportsCompatible("cycling", "e_biking")).toBe(true);
    expect(sportsCompatible("swimming", "cycling")).toBe(false);
    expect(sportsCompatible(null, "cycling")).toBe(true);
    expect(sportFamily("kiteboarding_v2")).toBe("other");
  });
});
