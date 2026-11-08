import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  ConnectError, connectError, disconnectProvider, getActivities, getConnections, getKnownActivities,
  getManualRunSources, getWatchRuns, insertActivities, invalidateProviders, providerKeys,
  startCorosAuthorization, startGarminAuthorization, syncCoros,
} from "@/api/providers";

type FnRes = { data: unknown; error: { message: string; context?: unknown } | null };

function world(tables: Record<string, Row[]> = {}, o: { failOn?: { table: string; op: string }; fn?: (name: string, body: unknown) => FnRes } = {}) {
  const base = fakeDb(tables, o.failOn);
  const invoked: Array<{ fn: string; body: unknown }> = [];
  setDbForTests({
    ...base.db,
    functions: {
      invoke: (fn: string, opts: { body: unknown }) => {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve(o.fn?.(fn, opts.body) ?? { data: null, error: null });
      },
    },
  });
  return { tables: base.tables, invoked };
}

afterEach(() => setDbForTests(null));

const act = (id: string, o: Row = {}) => ({
  id, athlete_id: "a", source: "coros", external_id: id, started_at: `2026-11-0${id.slice(-1)}T07:00:00Z`,
  local_date: `2026-11-0${id.slice(-1)}`, sport: "run", duration_s: 1800, distance_m: "5012.5",
  elevation_gain_m: null, avg_hr: 150, max_hr: 170, avg_pace_s_per_km: "359.1", calories: 400,
  device_name: null, details: null, ...o,
});

describe("api/providers — lectures", () => {
  it("getConnections : forme de l'interface, scopes vides par défaut ; lève si illisible", async () => {
    world({ provider_connections: [
      { id: "c1", athlete_id: "a", provider: "coros", status: "needs_reauth", granted_scopes: null, connected_at: "t", last_sync_at: null, synced_through: null, last_error: "401", api_host: "secret" },
      { id: "c2", athlete_id: "b", provider: "garmin", status: "active" },
    ] });
    expect(await getConnections("a")).toEqual([{
      id: "c1", provider: "coros", status: "needs_reauth", grantedScopes: [], connectedAt: "t",
      lastSyncAt: null, syncedThrough: null, lastError: "401",
    }]);
    world({}, { failOn: { table: "provider_connections", op: "select" } });
    await expect(getConnections("a")).rejects.toThrow(/montres connectées/);
  });

  it("getActivities : `numeric` en chaîne converti (sinon distance « — »), limite respectée", async () => {
    world({ provider_activities: [act("x1"), act("x2"), act("x3", { athlete_id: "b" })] });
    const list = await getActivities("a", 1);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "x2", distanceM: 5012.5, avgPaceSPerKm: 359.1, elevationGainM: null, deviceName: null });
    world({}, { failOn: { table: "provider_activities", op: "select" } });
    await expect(getActivities("a")).rejects.toThrow(/Lecture des activités impossible/);
  });

  it("getWatchRuns : depuis `from`, dans l'ordre chronologique", async () => {
    world({ provider_activities: [act("x3"), act("x1"), act("x2")] });
    const runs = await getWatchRuns("a", "2026-11-02");
    expect(runs.map((r) => r.id)).toEqual(["x2", "x3"]);
    expect(runs[0]).toEqual({ id: "x2", source: "coros", localDate: "2026-11-02", startedAt: "2026-11-02T07:00:00Z", sport: "run", distanceM: 5012.5, durationS: 1800, deviceName: null });
  });

  it("getManualRunSources : séances énergie et km de muscu, lève si une source est illisible", async () => {
    world({
      energy_session_assignments: [{
        id: "e1", athlete_id: "a", scheduled_date: "2026-11-03", status: "completed", activity_type: "run",
        distance_km: "8.2", actual_duration_min: 40, energy_sessions: { name: null, session_kind: "endurance", total_distance_m: "8000", total_duration_s: 2400 },
      }],
      workout_logs: [
        { athlete_id: "a", scheduled_date: "2026-11-04", run_distance_km: "2.5" },
        { athlete_id: "a", scheduled_date: "2026-11-05", run_distance_km: null },
      ],
    });
    const src = await getManualRunSources("a", "2026-11-01");
    expect(src.planned).toEqual([{
      id: "e1", date: "2026-11-03", status: "completed", activityType: "run", sessionKind: "endurance",
      label: "Séance énergie", plannedDistanceM: 8000, plannedDurationS: 2400, manualKm: 8.2, manualDurationMin: 40,
    }]);
    expect(src.strength).toEqual([{ date: "2026-11-04", km: 2.5 }]);
    world({}, { failOn: { table: "workout_logs", op: "select" } });
    await expect(getManualRunSources("a", "2026-11-01")).rejects.toThrow(/séances impossible/);
  });
});

describe("api/providers — import de fichiers", () => {
  it("getKnownActivities pagine au-delà de 1000 lignes (sinon doublons réimportés)", async () => {
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      athlete_id: "a", external_id: `f${i}`, sport: "run", local_date: "2026-10-01",
      started_at: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
    }));
    world({ provider_activities: rows });
    const known = await getKnownActivities("a", "2026-09-01", "2026-10-31");
    expect(known.ids.size).toBe(1005);
    expect(known.starts).toHaveLength(1005);
    expect(known.starts[1004].sport).toBe("run");
  });

  it("insertActivities : renvoie les lignes réellement ajoutées, doublons écartés", async () => {
    const { tables } = world({ provider_activities: [{ athlete_id: "a", source: "file_import", external_id: "h1" }] });
    const n = await insertActivities([
      { athlete_id: "a", source: "file_import", external_id: "h1" },
      { athlete_id: "a", source: "file_import", external_id: "h2" },
    ]);
    expect(n).toBe(1);
    expect(tables.provider_activities).toHaveLength(2);
    expect(await insertActivities([])).toBe(0);
    world({}, { failOn: { table: "provider_activities", op: "upsert" } });
    await expect(insertActivities([{ external_id: "h3" }])).rejects.toThrow(/Insertion des activités impossible/);
  });
});

describe("api/providers — Edge Functions", () => {
  it("autorisation : renvoie l'URL ; Garmin remonte le code serveur du corps d'erreur", async () => {
    const w = world({}, { fn: () => ({ data: { authorizeUrl: "https://coros/auth" }, error: null }) });
    expect(await startCorosAuthorization("eu")).toBe("https://coros/auth");
    expect(w.invoked).toEqual([{ fn: "provider-coros-connect", body: { region: "eu" } }]);

    world({}, { fn: () => ({ data: null, error: { message: "non-2xx", context: { json: async () => ({ error: "garmin_indisponible", message: "Bientôt" }) } } }) });
    const e = await startGarminAuthorization().catch((x) => x);
    expect(e).toBeInstanceOf(ConnectError);
    expect(e).toMatchObject({ code: "garmin_indisponible", message: "Bientôt" });

    world({}, { fn: () => ({ data: {}, error: null }) });
    await expect(startCorosAuthorization("eu")).rejects.toThrow("URL d'autorisation absente");
  });

  it("connectError : corps illisible → message générique, sans code", async () => {
    const e = await connectError({ message: "boom", context: { json: async () => { throw new Error("x"); } } });
    expect(e).toMatchObject({ message: "boom", code: null });
  });

  it("synchro et déconnexion", async () => {
    world({}, { fn: (fn) => fn === "provider-coros-sync"
      ? { data: { reports: [{ athleteId: "a", imported: 2 }] }, error: null }
      : { data: { success: true, revoked: true }, error: null } });
    expect(await syncCoros()).toMatchObject({ imported: 2 });
    expect(await disconnectProvider("coros")).toMatchObject({ success: true, revoked: true });
    world({}, { fn: () => ({ data: { success: false }, error: null }) });
    await expect(disconnectProvider("garmin")).rejects.toThrow("La déconnexion n'a pas abouti");
  });

  it("invalidateProviders couvre connexions, sorties et volume montre (préfixe commun)", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateProviders(qc as never, "a");
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["providers", "a"] });
    for (const k of [providerKeys.connections("a"), providerKeys.activities("a", 60), providerKeys.runs("a", "2026-01-01")]) {
      expect(k.slice(0, 2)).toEqual(["providers", "a"]);
    }
  });
});
