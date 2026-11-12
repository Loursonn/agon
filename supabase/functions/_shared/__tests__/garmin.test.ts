/**
 * Traduction des notifications Garmin vers le schéma Agon.
 *
 * Les exemples suivent la forme des notifications push de la Health API et de
 * l'Activity API (champs `...InSeconds`, `...InMeters`, `...InBeatsPerMinute`).
 * La documentation partenaire étant fermée avant approbation, ces formes sont
 * SUPPOSÉES : à remplacer par des payloads réels anonymisés dès la première
 * connexion (clé Personal ou premier athlète).
 *
 * Règle tenue partout : une mesure absente donne `null`, jamais 0.
 */
import { describe, expect, it, vi } from "vitest";
import {
  garminAdapter,
  garminSport,
  GARMIN_ENDPOINTS,
  isPingEntry,
  localDay,
  mapGarminActivity,
  mapGarminDaily,
  normalizePermissions,
  permissionFor,
  splitNotification,
} from "../providers/garmin";

/** Résumé d'activité, forme Activity API (push). */
const RUN = {
  userId: "4aacafe82427c251df9c9592d0c06768",
  summaryId: "5001968355",
  activityId: 5001968355,
  activityName: "Footing Bordeaux",
  activityType: "RUNNING",
  startTimeInSeconds: 1762500000, // 2025-11-07T07:20:00Z
  startTimeOffsetInSeconds: 3600,
  durationInSeconds: 3012,
  distanceInMeters: 10040.5,
  averageHeartRateInBeatsPerMinute: 148,
  maxHeartRateInBeatsPerMinute: 171,
  averageSpeedInMetersPerSecond: 3.33,
  activeKilocalories: 612,
  totalElevationGainInMeters: 84.0,
  totalElevationLossInMeters: 80.0,
  deviceName: "Forerunner 265",
  manual: false,
};

describe("mapGarminActivity", () => {
  it("transpose un résumé complet", () => {
    const row = mapGarminActivity(RUN)!;
    expect(row).toMatchObject({
      source: "garmin",
      external_id: "5001968355",
      started_at: "2025-11-07T07:20:00.000Z",
      local_date: "2025-11-07",
      sport: "running",
      duration_s: 3012,
      distance_m: 10040.5,
      elevation_gain_m: 84,
      avg_hr: 148,
      max_hr: 171,
      calories: 612,
      device_name: "Forerunner 265",
    });
    // 3012 s / 10,0405 km ≈ 300 s/km = 5:00 /km
    expect(row.avg_pace_s_per_km).toBeCloseTo(299.99, 1);
    expect(row.details).toMatchObject({ provider: "garmin", activityType: "RUNNING", manual: false });
    expect(row.raw).toBe(RUN);
  });

  it("met null — jamais 0 — pour chaque mesure absente", () => {
    const row = mapGarminActivity({
      userId: "u",
      summaryId: "s1",
      activityType: "STRENGTH_TRAINING",
      startTimeInSeconds: 1762500000,
      durationInSeconds: 2400,
    })!;
    expect(row).toMatchObject({
      sport: "training",
      duration_s: 2400,
      distance_m: null,
      elevation_gain_m: null,
      avg_hr: null,
      max_hr: null,
      avg_pace_s_per_km: null,
      calories: null,
      device_name: null,
    });
  });

  it("traite distance et durée à 0 comme absentes, mais garde un dénivelé de 0 m", () => {
    const row = mapGarminActivity({ ...RUN, distanceInMeters: 0, durationInSeconds: 0, totalElevationGainInMeters: 0 })!;
    expect(row.distance_m).toBeNull();
    expect(row.duration_s).toBeNull();
    expect(row.avg_pace_s_per_km).toBeNull();
    expect(row.elevation_gain_m).toBe(0);
  });

  it("écarte une FC hors bornes plutôt que de violer la contrainte", () => {
    const row = mapGarminActivity({ ...RUN, averageHeartRateInBeatsPerMinute: 0, maxHeartRateInBeatsPerMinute: 400 })!;
    expect(row.avg_hr).toBeNull();
    expect(row.max_hr).toBeNull();
  });

  it("place une sortie tardive sur son jour local, pas sur le jour UTC", () => {
    // 23:30 à Paris (UTC+1) le 7 = 22:30 UTC le 7 ; 00:30 le 8 à Paris = 23:30 UTC le 7.
    const lateUtc = Date.parse("2025-11-07T23:30:00Z") / 1000;
    expect(mapGarminActivity({ ...RUN, startTimeInSeconds: lateUtc, startTimeOffsetInSeconds: 3600 })!.local_date).toBe("2025-11-08");
    expect(localDay(lateUtc, null)).toBe("2025-11-07");
  });

  it("refuse une entrée sans identifiant ou sans départ", () => {
    expect(mapGarminActivity({ ...RUN, summaryId: undefined, activityId: undefined })).toBeNull();
    expect(mapGarminActivity({ ...RUN, startTimeInSeconds: undefined })).toBeNull();
    expect(mapGarminActivity({ ...RUN, startTimeInSeconds: 0 })).toBeNull();
  });

  it("donne la même clé au résumé et au détail d'une même activité", () => {
    const detail = {
      userId: RUN.userId,
      summaryId: "5001968355-detail",
      activityId: 5001968355,
      summary: { ...RUN, summaryId: undefined, activityId: undefined },
      samples: [{ startTimeInSeconds: 1762500000, heartRate: 120 }, { startTimeInSeconds: 1762500001, heartRate: 121 }],
    };
    const row = mapGarminActivity(detail)!;
    expect(row.external_id).toBe(mapGarminActivity(RUN)!.external_id);
    expect(row.duration_s).toBe(3012);
    // Les échantillons ne sont pas conservés dans raw ; leur nombre l'est.
    expect(row.raw).not.toHaveProperty("samples");
    expect(row.raw).toMatchObject({ samplesDropped: 2 });
  });

  it("tronque un nom d'appareil anormalement long", () => {
    expect(mapGarminActivity({ ...RUN, deviceName: "x".repeat(500) })!.device_name).toHaveLength(120);
    expect(mapGarminActivity({ ...RUN, deviceName: "   " })!.device_name).toBeNull();
  });
});

describe("garminSport", () => {
  it("ramène les types Garmin aux slugs des décodeurs de fichiers", () => {
    expect(garminSport("TRAIL_RUNNING")).toBe("running");
    expect(garminSport("TREADMILL_RUNNING")).toBe("running");
    expect(garminSport("ROAD_BIKING")).toBe("cycling");
    expect(garminSport("LAP_SWIMMING")).toBe("swimming");
    expect(garminSport("STRENGTH_TRAINING")).toBe("training");
    expect(garminSport("hiit")).toBe("hiit");
  });

  it("garde un type inconnu sous forme de slug, et null pour rien", () => {
    expect(garminSport("PICKLEBALL")).toBe("pickleball");
    expect(garminSport("")).toBeNull();
    expect(garminSport(undefined)).toBeNull();
  });
});

describe("mapGarminDaily", () => {
  it("dailies : FC de repos, pas, stress, body battery", () => {
    const d = mapGarminDaily("dailies", {
      userId: "u",
      summaryId: "x153a9f3-5a9478d4-6",
      calendarDate: "2025-11-06",
      steps: 11250,
      restingHeartRateInBeatsPerMinute: 47,
      averageStressLevel: 31,
    })!;
    expect(d.day).toBe("2025-11-06");
    expect(d.fields).toMatchObject({ resting_hr: 47, steps: 11250, stress_avg: 31 });
  });

  it("activité : deviceName « unknown » (saisie manuelle) ne nomme aucun appareil", () => {
    const a = mapGarminActivity({ userId: "u", summaryId: "s1", activityId: 1, startTimeInSeconds: 1762400000, durationInSeconds: 600, deviceName: "unknown" });
    expect(a?.device_name ?? null).toBeNull();
  });

  it("dailies : -1 de stress (« pas de mesure » chez Garmin) devient null", () => {
    const d = mapGarminDaily("dailies", { calendarDate: "2025-11-06", averageStressLevel: -1 })!;
    expect(d.fields.stress_avg).toBeNull();
    expect(d.fields.steps).toBeNull();
    expect(d.fields.resting_hr).toBeNull();
  });

  it("sleeps : durées en minutes, score, sans champ de la journée", () => {
    const d = mapGarminDaily("sleeps", {
      calendarDate: "2025-11-07",
      durationInSeconds: 27000,
      deepSleepDurationInSeconds: 5400,
      remSleepInSeconds: 6300,
      overallSleepScore: { value: 84, qualifierKey: "GOOD" },
    })!;
    expect(d.fields).toMatchObject({ sleep_total_min: 450, sleep_deep_min: 90, sleep_rem_min: 105, sleep_score: 84 });
    // Un résumé de sommeil ne doit pas écraser les pas de la journée.
    expect(d.fields).not.toHaveProperty("steps");
  });

  it("hrv : moyenne de la nuit", () => {
    expect(mapGarminDaily("hrv", { calendarDate: "2025-11-07", lastNightAvg: 52 })!.fields).toMatchObject({ hrv_ms: 52 });
    expect(mapGarminDaily("hrv", { calendarDate: "2025-11-07" })!.fields).toMatchObject({ hrv_ms: null });
  });

  it("déduit le jour de l'heure de départ quand calendarDate manque", () => {
    const start = Date.parse("2025-11-06T23:30:00Z") / 1000;
    expect(mapGarminDaily("dailies", { startTimeInSeconds: start, startTimeOffsetInSeconds: 3600 })!.day).toBe("2025-11-07");
  });

  it("rend null sans date, ou pour un type inconnu", () => {
    expect(mapGarminDaily("dailies", { steps: 10 })).toBeNull();
    expect(mapGarminDaily("healthSnapshot", { calendarDate: "2025-11-07" })).toBeNull();
  });
});

describe("splitNotification", () => {
  it("éclate une notification en entrées typées, avec le userId", () => {
    const entries = splitNotification({
      activities: [RUN, { ...RUN, summaryId: "2" }],
      deregistrations: [{ userId: "u9" }],
    });
    expect(entries.map((e) => [e.type, e.userId])).toEqual([
      ["activities", RUN.userId],
      ["activities", RUN.userId],
      ["deregistrations", "u9"],
    ]);
  });

  it("ignore ce qui n'est pas un tableau d'objets, refuse ce qui n'est pas un objet", () => {
    expect(splitNotification({ activities: "x", dailies: [1, null, { userId: "u" }] })).toHaveLength(1);
    expect(() => splitNotification([])).toThrow();
    expect(() => splitNotification(null)).toThrow();
  });

  it("reconnaît une entrée en mode ping", () => {
    expect(isPingEntry({ userId: "u", callbackURL: "https://apis.garmin.com/wellness-api/rest/activities?token=x" })).toBe(true);
    expect(isPingEntry(RUN)).toBe(false);
  });
});

describe("permissions", () => {
  it("accepte un tableau nu ou un objet { permissions }", () => {
    expect(normalizePermissions(["ACTIVITY_EXPORT", "HEALTH_EXPORT", "ACTIVITY_EXPORT"])).toEqual(["ACTIVITY_EXPORT", "HEALTH_EXPORT"]);
    expect(normalizePermissions({ permissions: ["HEALTH_EXPORT"] })).toEqual(["HEALTH_EXPORT"]);
    expect(normalizePermissions({})).toEqual([]);
  });

  it("associe chaque type à la permission qui l'autorise", () => {
    expect(permissionFor("activities")).toBe("ACTIVITY_EXPORT");
    expect(permissionFor("activityDetails")).toBe("ACTIVITY_EXPORT");
    expect(permissionFor("sleeps")).toBe("HEALTH_EXPORT");
    expect(permissionFor("deregistrations")).toBeNull();
    expect(permissionFor("activityFiles")).toBe("ACTIVITY_EXPORT");
    expect(permissionFor("moveIQActivities")).toBe("ACTIVITY_EXPORT");
    expect(permissionFor("stressDetails")).toBe("HEALTH_EXPORT");
    expect(permissionFor("epochs")).toBe("HEALTH_EXPORT");
    // Type inconnu ajouté plus tard par Garmin : traité comme santé (le plus protecteur).
    expect(permissionFor("nouveauType")).toBe("HEALTH_EXPORT");
  });
});

describe("garminAdapter", () => {
  it("refuse de se construire sans client_secret", () => {
    expect(() => garminAdapter({ clientId: "id" })).toThrow(/client_secret/);
  });

  it("autorise sur connect.garmin.com et échange sur diauth.garmin.com", () => {
    const a = garminAdapter({ clientId: "id", clientSecret: "s" });
    expect(a.endpoints.authorize).toBe("https://connect.garmin.com/oauth2Confirm");
    expect(a.endpoints.token).toBe("https://diauth.garmin.com/di-oauth2-service/oauth/token");
    expect(a.scopes).toBeUndefined();
  });

  it("lit l'identifiant utilisateur", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ userId: "d3315b1072421d0dd7c8f6b8e1de4df8" })));
    const a = garminAdapter({ clientId: "id", clientSecret: "s" }, fetchImpl);
    expect(await a.fetchUserId("tok")).toBe("d3315b1072421d0dd7c8f6b8e1de4df8");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GARMIN_ENDPOINTS.userId);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("révoque par DELETE /user/registration ; 404 = déjà désinscrit", async () => {
    const ok = vi.fn(async () => new Response(null, { status: 204 }));
    const a = garminAdapter({ clientId: "id", clientSecret: "s" }, ok);
    expect(await a.revoke({ accessToken: "tok" })).toBe(true);
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://apis.garmin.com/partner-gateway/rest/user/registration");
    expect(init.method).toBe("DELETE");

    const gone = garminAdapter({ clientId: "id", clientSecret: "s" }, vi.fn(async () => new Response(null, { status: 404 })));
    expect(await gone.revoke({ accessToken: "tok" })).toBe(true);

    const expired = garminAdapter({ clientId: "id", clientSecret: "s" }, vi.fn(async () => new Response(null, { status: 401 })));
    expect(await expired.revoke({ accessToken: "tok" })).toBe(false);

    const down = garminAdapter({ clientId: "id", clientSecret: "s" }, vi.fn(async () => { throw new Error("réseau"); }));
    expect(await down.revoke({ accessToken: "tok" })).toBe(false);
  });
});
