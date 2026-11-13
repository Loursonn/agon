/**
 * Traitement de l'inbox Garmin : ce qui est importé, ce qui ne l'est pas, et
 * ce qui est supprimé.
 *
 * Base simulée en mémoire, juste assez de supabase-js pour ce module. La
 * recherche de doublons inter-sources est injectée (en production :
 * `findCrossSourceDuplicate` de `_shared/activityDedup.ts`).
 */
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../oauth";
import {
  activityFileDownloader,
  drainInbox,
  processInboxRow,
  type DownloadActivityFile,
  type InboxRow,
} from "../providers/garminIngest";
import { gunzip } from "../providers/rawStore";

type Row = Record<string, unknown>;

function memoryDb(init: Record<string, Row[]>, opts: { consent?: boolean; mergeError?: string } = {}) {
  const t: Record<string, Row[]> = structuredClone(init);
  const tab = (n: string) => (t[n] ??= []);
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  /** Bucket provider-raw simulé : chemin → contenu. */
  const files = new Map<string, Uint8Array>();
  const inList = (v: unknown) => String(v).replace(/^\(|\)$/g, "").split(",");

  const db: Db = {
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      if (name === "source_consent_granted") return Promise.resolve({ data: opts.consent ?? true, error: null });
      if (name === "merge_provider_activity") {
        if (opts.mergeError) return Promise.resolve({ data: null, error: { message: opts.mergeError } });
        // Fusion simplifiée : même (source, identifiant) ou départ à ±2 min.
        const a = args.p_activity as Row;
        const rows = tab("provider_activities");
        const start = Date.parse(String(a.started_at));
        const hit = rows.find((r) => r.athlete_id === args.p_athlete &&
          ((r.source === args.p_source && r.external_id === a.external_id) ||
            (r.source !== args.p_source && Math.abs(Date.parse(String(r.started_at)) - start) <= 120_000)));
        if (!hit) {
          rows.push({ id: `act-${rows.length + 1}`, athlete_id: args.p_athlete, source: args.p_source, ...a, sources: [args.p_tag] });
          return Promise.resolve({ data: { status: "created" }, error: null });
        }
        for (const [k, v] of Object.entries(a)) if (hit[k] == null) hit[k] = v;
        hit.source = args.p_source;
        hit.external_id = a.external_id;
        hit.sources = [...new Set([...(hit.sources as string[] ?? []), String(args.p_tag)])].sort();
        return Promise.resolve({ data: { status: "merged" }, error: null });
      }
      if (name === "provider_daily_merge") {
        const rows = tab("provider_dailies");
        let r = rows.find((x) => x.athlete_id === args.p_athlete && x.source === args.p_source && x.day === args.p_day);
        if (!r) {
          r = { athlete_id: args.p_athlete, source: args.p_source, day: args.p_day, raw: {} };
          rows.push(r);
        }
        r.raw = { ...(r.raw as Row), [String(args.p_kind)]: args.p_raw };
        Object.assign(r, args.p_fields as Row);
        return Promise.resolve({ data: "d1", error: null });
      }
      if (name === "provider_forget") {
        const conn = tab("provider_connections").find((c) => c.athlete_id === args.p_athlete && c.provider === args.p_provider);
        t.provider_activities = tab("provider_activities").filter((a) => !(a.athlete_id === args.p_athlete && a.source === args.p_provider));
        t.provider_dailies = tab("provider_dailies").filter((a) => !(a.athlete_id === args.p_athlete && a.source === args.p_provider));
        t.provider_raw_records = tab("provider_raw_records").filter((a) => !(a.athlete_id === args.p_athlete && a.source === args.p_provider));
        if (conn) t.provider_webhook_inbox = tab("provider_webhook_inbox").filter((i) => i.external_user_id !== conn.external_user_id);
        t.provider_connections = tab("provider_connections").filter((c) => c !== conn);
        return Promise.resolve({ data: { activities: 0, dailies: 0, inbox: 0, connection: conn ? 1 : 0 }, error: null });
      }
      if (name === "provider_raw_objects") {
        const prefix = `${args.p_athlete}/${args.p_provider}/`;
        const types = args.p_types as string[] | null;
        const names = [...files.keys()].filter((n) => n.startsWith(prefix) && (!types || types.includes(n.split("/")[2])));
        return Promise.resolve({ data: names.map((object_name) => ({ object_name })), error: null });
      }
      if (name === "provider_intraday_merge") {
        tab("provider_intraday").push({ athlete_id: args.p_athlete, source: args.p_source, day: args.p_day, measure: args.p_measure, offsets: args.p_offsets, values: args.p_values });
        return Promise.resolve({ data: null, error: null });
      }
      if (name === "provider_inbox_claim") {
        const ids = args.p_ids as string[] | null;
        const rows = tab("provider_webhook_inbox").filter((r) => !r.processed_at && (!ids || ids.includes(r.id as string)));
        return Promise.resolve({ data: rows, error: null });
      }
      if (name === "activity_detail_upsert") {
        const rows = tab("activity_streams");
        const i = rows.findIndex((r) => r.activity_id === args.p_activity);
        const row = { activity_id: args.p_activity, detail: args.p_detail };
        if (i >= 0) rows[i] = row;
        else rows.push(row);
        return Promise.resolve({ data: { samples: 0 }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let op: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      const matches = () => tab(table).filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (op === "update") for (const r of matches()) Object.assign(r, patch);
        if (op === "delete") {
          const gone = new Set(matches());
          t[table] = tab(table).filter((r) => !gone.has(r));
        }
        return { data: op === "select" ? matches() : null, error: null };
      };
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          const path = col.split("->>");
          filters.push((r) =>
            path.length === 2
              ? String((r[path[0]] as Row | undefined)?.[path[1]] ?? "") === String(val)
              : r[col] === val
          );
          return chain;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]));
          return chain;
        },
        filter: (col: string, op: string, val: unknown) => {
          if (op !== "in") throw new Error(`filtre ${op} non simulé`);
          filters.push((r) => inList(val).includes(String(r[col])));
          return chain;
        },
        not: (col: string, op: string, val: unknown) => {
          if (op !== "in") throw new Error(`filtre not ${op} non simulé`);
          filters.push((r) => !inList(val).includes(String(r[col])));
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
        update: (p: Row) => {
          op = "update";
          patch = p;
          return chain;
        },
        delete: () => {
          op = "delete";
          return chain;
        },
        upsert: (row: Row, o: { onConflict?: string } = {}) => {
          const rows = tab(table);
          const keys = (o.onConflict ?? "athlete_id,source,external_id").split(",");
          const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...row };
          else rows.push({ id: `a${rows.length + 1}`, ...row });
          return Promise.resolve({ error: null });
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return chain;
    },
  };
  (db as Db & { storage: unknown }).storage = {
    from: (bucket: string) => ({
      upload: (path: string, body: Uint8Array) => {
        if (bucket !== "provider-raw") throw new Error("bucket inattendu");
        files.set(path, body);
        return Promise.resolve({ error: null });
      },
      remove: (paths: string[]) => {
        for (const p of paths) files.delete(p);
        return Promise.resolve({ error: null });
      },
      download: (path: string) => {
        const f = files.get(path);
        return Promise.resolve(f ? { data: { arrayBuffer: () => Promise.resolve(f.slice().buffer) }, error: null } : { data: null, error: { message: "absent" } });
      },
    }),
  };
  return { db, t, rpcCalls, files };
}

const ATHLETE = "ath-1";
const GARMIN_USER = "garmin-u1";

const connection = (over: Row = {}) => ({
  id: "conn-1",
  athlete_id: ATHLETE,
  provider: "garmin",
  status: "active",
  external_user_id: GARMIN_USER,
  granted_scopes: ["ACTIVITY_EXPORT", "HEALTH_EXPORT"],
  ...over,
});

const activityEntry = {
  userId: GARMIN_USER,
  summaryId: "777",
  activityId: 777,
  activityType: "RUNNING",
  startTimeInSeconds: 1762500000,
  startTimeOffsetInSeconds: 3600,
  durationInSeconds: 1800,
  distanceInMeters: 6000,
  deviceName: "fēnix 8",
};

const inbox = (type: string, payload: Row, id = "in-1"): InboxRow & Row => ({
  id,
  type,
  external_user_id: (payload.userId as string) ?? null,
  payload,
  processed_at: null,
});


describe("activités", () => {
  it("importe une activité avec son appareil, puis marque la ligne traitée", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("imported");
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_activities[0]).toMatchObject({ athlete_id: ATHLETE, source: "garmin", external_id: "777", device_name: "fēnix 8" });
    expect(t.provider_webhook_inbox[0].processed_at).toBeTruthy();
    expect(t.provider_connections[0].last_sync_at).toBeTruthy();
  });

  it("rejouer la même notification ne crée pas de seconde ligne", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("activities", activityEntry, "a"), { db });
    await processInboxRow(inbox("activities", activityEntry, "b"), { db });
    expect(t.provider_activities).toHaveLength(1);
  });

  it("complète une sortie déjà importée depuis l'archive Strava au lieu de l'écarter (P42)", async () => {
    const row = inbox("activities", activityEntry);
    const strava = {
      id: "f1", athlete_id: ATHLETE, source: "file_import", external_id: "strava:1",
      started_at: "2025-11-07T07:21:00.000Z", title: "Sortie fictive", rpe: 6, device_name: null, sources: ["strava_archive"],
    };
    const { db, t, rpcCalls } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row], provider_activities: [strava] });
    expect(await processInboxRow(row, { db })).toBe("imported");
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_activities[0]).toMatchObject({
      source: "garmin", external_id: "777", title: "Sortie fictive", rpe: 6, device_name: "fēnix 8",
      sources: ["garmin", "strava_archive"],
    });
    const call = rpcCalls.find((c) => c.name === "merge_provider_activity");
    expect(call?.args).toMatchObject({ p_athlete: ATHLETE, p_source: "garmin", p_tag: "garmin" });
    expect((call?.args.p_activity as Row).origin_quality).toBe("fit");
    expect(call?.args.p_activity as Row).not.toHaveProperty("source");
  });

  it("supprime sans importer les données d'un utilisateur Garmin inconnu", async () => {
    const row = inbox("activities", { ...activityEntry, userId: "inconnu" });
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("unknown_user");
    expect(t.provider_activities ?? []).toHaveLength(0);
    expect(t.provider_webhook_inbox).toHaveLength(0);
  });

  it("n'importe rien sans consentement garmin_sync, et ne garde pas le brut", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] }, { consent: false });
    expect(await processInboxRow(row, { db })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
    expect(t.provider_webhook_inbox).toHaveLength(0);
  });

  it("n'importe rien pour une connexion dont l'accord a été retiré", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection({ status: "consent_withdrawn" })], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("n'importe pas d'activité quand ACTIVITY_EXPORT n'est pas accordée", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection({ granted_scopes: ["HEALTH_EXPORT"] })], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("une erreur de la base reste sur la ligne, qui sera reprise", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] }, { mergeError: "timeout" });
    expect(await processInboxRow(row, { db })).toBe("error");
    expect(t.provider_webhook_inbox[0].processed_at).toBeFalsy();
    expect(t.provider_webhook_inbox[0].error).toContain("timeout");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("une notification en mode ping est signalée, pas suivie", async () => {
    const row = inbox("activities", { userId: GARMIN_USER, callbackURL: "https://apis.garmin.com/x" });
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("skipped");
    expect(t.provider_webhook_inbox[0].error).toContain("ping");
  });
});

describe("données quotidiennes", () => {
  it("fusionne dailies et sleeps du même jour sans écrasement", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("dailies", { userId: GARMIN_USER, calendarDate: "2025-11-07", steps: 9000, restingHeartRateInBeatsPerMinute: 50 }, "d"), { db });
    await processInboxRow(inbox("sleeps", { userId: GARMIN_USER, calendarDate: "2025-11-07", durationInSeconds: 25200 }, "s"), { db });
    expect(t.provider_dailies).toHaveLength(1);
    expect(t.provider_dailies[0]).toMatchObject({ steps: 9000, resting_hr: 50, sleep_total_min: 420 });
    expect(Object.keys(t.provider_dailies[0].raw as Row).sort()).toEqual(["dailies", "sleeps"]);
  });

  it("n'importe pas de santé quand HEALTH_EXPORT n'est pas accordée", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection({ granted_scopes: ["ACTIVITY_EXPORT"] })] });
    expect(await processInboxRow(inbox("dailies", { userId: GARMIN_USER, calendarDate: "2025-11-07", steps: 1 }), { db })).toBe("skipped");
    expect(t.provider_dailies ?? []).toHaveLength(0);
  });
});

describe("désinscription et permissions", () => {
  it("désinscription Garmin : supprime données, connexion et messages, garde file_import", async () => {
    const row = inbox("deregistrations", { userId: GARMIN_USER });
    const { db, t, rpcCalls } = memoryDb({
      provider_connections: [connection()],
      provider_activities: [
        { id: "g", athlete_id: ATHLETE, source: "garmin" },
        { id: "f", athlete_id: ATHLETE, source: "file_import" },
      ],
      provider_dailies: [{ athlete_id: ATHLETE, source: "garmin", day: "2025-11-07" }],
      provider_webhook_inbox: [row],
    });
    expect(await processInboxRow(row, { db })).toBe("forgotten");
    expect(rpcCalls.find((c) => c.name === "provider_forget")?.args).toEqual({ p_athlete: ATHLETE, p_provider: "garmin" });
    expect(t.provider_connections).toHaveLength(0);
    expect(t.provider_activities.map((a) => a.id)).toEqual(["f"]);
    expect(t.provider_dailies).toHaveLength(0);
    expect(t.provider_webhook_inbox).toHaveLength(0);
  });

  it("permission ACTIVITY_EXPORT retirée : met à jour les scopes et supprime les activités Garmin", async () => {
    const row = inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["HEALTH_EXPORT"], changeTimeInSeconds: 1762500000 });
    const { db, t } = memoryDb({
      provider_connections: [connection()],
      provider_activities: [
        { id: "g", athlete_id: ATHLETE, source: "garmin" },
        { id: "f", athlete_id: ATHLETE, source: "file_import" },
      ],
      provider_dailies: [{ athlete_id: ATHLETE, source: "garmin", day: "2025-11-07" }],
      provider_webhook_inbox: [row],
    });
    expect(await processInboxRow(row, { db })).toBe("permissions_updated");
    expect(t.provider_connections[0].granted_scopes).toEqual(["HEALTH_EXPORT"]);
    expect(t.provider_activities.map((a) => a.id)).toEqual(["f"]);
    expect(t.provider_dailies).toHaveLength(1);
  });

  it("permission HEALTH_EXPORT retirée : supprime les données quotidiennes Garmin", async () => {
    const row = inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["ACTIVITY_EXPORT"] });
    const { db, t } = memoryDb({
      provider_connections: [connection()],
      provider_activities: [{ id: "g", athlete_id: ATHLETE, source: "garmin" }],
      provider_dailies: [{ athlete_id: ATHLETE, source: "garmin", day: "2025-11-07" }],
      provider_webhook_inbox: [row],
    });
    await processInboxRow(row, { db });
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_dailies).toHaveLength(0);
  });
});

describe("désinscription et permissions : cas limites (T-garmin-tests)", () => {
  it("désinscription d'un utilisateur inconnu : rien n'est supprimé chez les autres", async () => {
    const row = inbox("deregistrations", { userId: "inconnu" });
    const { db, t, rpcCalls } = memoryDb({
      provider_connections: [connection()],
      provider_activities: [{ id: "g", athlete_id: ATHLETE, source: "garmin" }],
      provider_webhook_inbox: [row],
    });
    expect(await processInboxRow(row, { db })).toBe("unknown_user");
    expect(rpcCalls.some((c) => c.name === "provider_forget")).toBe(false);
    expect(t.provider_connections).toHaveLength(1);
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_webhook_inbox).toHaveLength(0);
  });

  it("désinscription reçue deux fois : le second passage ne casse rien", async () => {
    const { db, t } = memoryDb({
      provider_connections: [connection()],
      provider_activities: [{ id: "g", athlete_id: ATHLETE, source: "garmin" }],
    });
    expect(await processInboxRow(inbox("deregistrations", { userId: GARMIN_USER }, "d1"), { db })).toBe("forgotten");
    expect(await processInboxRow(inbox("deregistrations", { userId: GARMIN_USER }, "d2"), { db })).toBe("unknown_user");
    expect(t.provider_connections).toHaveLength(0);
    expect(t.provider_activities).toHaveLength(0);
  });

  it("seule WORKOUT_IMPORT retirée : scopes mis à jour, activités et santé gardées", async () => {
    const row = inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["ACTIVITY_EXPORT", "HEALTH_EXPORT"] });
    const { db, t } = memoryDb({
      provider_connections: [connection({ granted_scopes: ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"] })],
      provider_activities: [{ id: "g", athlete_id: ATHLETE, source: "garmin" }],
      provider_dailies: [{ athlete_id: ATHLETE, source: "garmin", day: "2025-11-07" }],
      provider_webhook_inbox: [row],
    });
    expect(await processInboxRow(row, { db })).toBe("permissions_updated");
    expect(t.provider_connections[0].granted_scopes).toEqual(["ACTIVITY_EXPORT", "HEALTH_EXPORT"]);
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_dailies).toHaveLength(1);
  });

  it("permission retirée puis activité reçue en retard : pas importée", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["HEALTH_EXPORT"] }, "p"), { db });
    expect(await processInboxRow(inbox("activities", activityEntry, "a"), { db })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("permission rendue : les activités suivantes sont de nouveau importées", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection({ granted_scopes: ["HEALTH_EXPORT"] })] });
    await processInboxRow(inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["HEALTH_EXPORT", "ACTIVITY_EXPORT"] }, "p"), { db });
    expect(await processInboxRow(inbox("activities", activityEntry, "a"), { db })).toBe("imported");
    expect(t.provider_activities).toHaveLength(1);
  });
});

describe("doublons", () => {
  it("même activité reçue en « activities » puis « manuallyUpdatedActivities » : une seule ligne", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("activities", activityEntry, "a"), { db });
    await processInboxRow(inbox("manuallyUpdatedActivities", { ...activityEntry, distanceInMeters: 6100 }, "b"), { db });
    expect(t.provider_activities).toHaveLength(1);
  });

  it("même notification traitée par le webhook puis par le cron : un seul effet", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    await processInboxRow(row, { db });
    await processInboxRow(row, { db });
    expect(t.provider_activities).toHaveLength(1);
  });
});

describe("drainInbox", () => {
  it("traite le lot pris et compte les issues", async () => {
    const rows = [inbox("activities", activityEntry, "1"), inbox("dailies", { userId: "x", calendarDate: "2025-11-07" }, "2"), inbox("healthSnapshot", { userId: GARMIN_USER }, "3")];
    const { db } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: rows });
    const counts = await drainInbox({ db });
    expect(counts).toMatchObject({ imported: 1, stored: 1, unknown_user: 1, error: 0 });
  });
});

describe("stockage brut de tout ce qu'envoie Garmin", () => {
  const raw = (t: Record<string, Row[]>) => t.provider_raw_records ?? [];

  it("un type sans traitement Agon (healthSnapshot) est stocké tel quel", async () => {
    const entry = { userId: GARMIN_USER, summaryId: "sd-1", calendarDate: "2025-11-07", timeOffsetBodyBatteryValues: { "0": 55 } };
    const row = inbox("healthSnapshot", entry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("stored");
    expect(raw(t)).toHaveLength(1);
    expect(raw(t)[0]).toMatchObject({ athlete_id: ATHLETE, source: "garmin", summary_type: "healthSnapshot", summary_id: "sd-1", payload: entry });
    expect(t.provider_webhook_inbox[0].processed_at).toBeTruthy();
    expect(t.provider_webhook_inbox[0].error).toBeNull();
  });

  it("stressDetails : brut stocké ET séries stress / Body Battery rangées par jour", async () => {
    const entry = {
      userId: GARMIN_USER, summaryId: "sd-1", calendarDate: "2025-11-07",
      startTimeInSeconds: Date.parse("2025-11-06T23:00:00Z") / 1000, startTimeOffsetInSeconds: 3600,
      timeOffsetStressLevelValues: { "0": 20, "180": -1, "360": 35 }, timeOffsetBodyBatteryValues: { "0": 55 },
    };
    const row = inbox("stressDetails", entry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db })).toBe("imported");
    expect(raw(t)).toHaveLength(1);
    expect(t.provider_intraday.map((s) => [s.day, s.measure, s.offsets, s.values])).toEqual([
      ["2025-11-07", "stress", [0, 360], [20, 35]],
      ["2025-11-07", "body_battery", [0], [55]],
    ]);
    expect(t.provider_dailies).toHaveLength(1);
  });

  it("un résumé sans summaryId reçoit une empreinte stable (pas de doublon au rejeu)", async () => {
    const entry = { userId: GARMIN_USER, calendarDate: "2025-11-07", valueInML: 500 };
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("hydration", entry, "a"), { db });
    await processInboxRow(inbox("hydration", entry, "b"), { db });
    expect(raw(t)).toHaveLength(1);
    expect(raw(t)[0].summary_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("les données dailies sont stockées brutes ET fusionnées dans provider_dailies", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("dailies", { userId: GARMIN_USER, summaryId: "d1", calendarDate: "2025-11-07", steps: 9000 }), { db });
    expect(raw(t)).toHaveLength(1);
    expect(t.provider_dailies).toHaveLength(1);
  });

  it("activityDetails : échantillons seconde par seconde compressés dans Storage, activité importée", async () => {
    const samples = Array.from({ length: 600 }, (_, i) => ({ startTimeInSeconds: 1762500000 + i, heartRate: 140 + (i % 20), speedMetersPerSecond: 3.3, powerInWatts: 250 }));
    const entry = { userId: GARMIN_USER, summaryId: "777-detail", activityId: 777, summary: { activityType: "RUNNING", startTimeInSeconds: 1762500000, durationInSeconds: 600 }, samples };
    const row = inbox("activityDetails", entry);
    const { db, t, files } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    const outcome = await processInboxRow(row, { db });
    expect(t.provider_webhook_inbox[0].error ?? null).toBeNull();
    expect(outcome).toBe("imported");
    const r = raw(t)[0];
    expect(r.samples_path).toBe(`${ATHLETE}/garmin/activityDetails/777-detail.json.gz`);
    expect(r.samples_count).toBe(600);
    expect(r.payload).not.toHaveProperty("samples");
    // Détail rangé en tables depuis les échantillons (série de 600 points, ≥ 1 s).
    const stream = t.activity_streams?.[0]?.detail as { source: string; stream: { t: number[]; hr: number[] } };
    expect(stream.source).toBe("garmin_json");
    expect(stream.stream.t).toHaveLength(600);
    expect(stream.stream.hr[1]).toBe(141);
    const stored = files.get(r.samples_path as string)!;
    expect(stored.length).toBeLessThan(JSON.stringify(samples).length / 5);
    expect(JSON.parse(new TextDecoder().decode(await gunzip(stored)))).toEqual(samples);
  });

  const fileEntry = {
    userId: GARMIN_USER,
    summaryId: "10010727180-file",
    fileType: "FIT",
    callbackURL: "https://apis.garmin.com/wellness-api/rest/activityFile?id=1&token=secret",
    activityId: 777,
    startTimeInSeconds: 1762500000,
    manual: false,
  };

  it("activityFiles : télécharge le .FIT, le range, ne garde jamais l'URL à jeton", async () => {
    const fit = new Uint8Array([14, 16, 1, 2, 3, 4]);
    const download = vi.fn<DownloadActivityFile>(async () => fit);
    const row = inbox("activityFiles", fileEntry);
    const { db, t, files } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, downloadActivityFile: download })).toBe("stored");
    expect(download).toHaveBeenCalledWith(fileEntry.callbackURL, "conn-1");
    const r = raw(t)[0];
    expect(r).toMatchObject({ summary_type: "activityFiles", file_type: "FIT", file_bytes: 6, file_path: `${ATHLETE}/garmin/activityFiles/10010727180-file.fit` });
    expect(r.payload).not.toHaveProperty("callbackURL");
    expect(files.get(r.file_path as string)).toEqual(fit);
  });

  it("activityFiles déjà téléchargé (410) : le résumé est gardé, le fichier existant n'est pas effacé", async () => {
    const { db, t, files } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("activityFiles", fileEntry, "a"), { db, downloadActivityFile: async () => new Uint8Array([1]) });
    const row = inbox("activityFiles", { ...fileEntry, manual: true }, "b");
    t.provider_webhook_inbox = [row];
    expect(await processInboxRow(row, { db, downloadActivityFile: async () => null })).toBe("stored");
    expect(raw(t)).toHaveLength(1);
    expect(raw(t)[0].file_path).toBeTruthy();
    expect(files.size).toBe(1);
    expect(t.provider_webhook_inbox[0].error).toContain("410");
  });

  it("activityFiles : un échec de téléchargement garde le résumé et laisse la ligne à reprendre", async () => {
    const row = inbox("activityFiles", fileEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    const failing: DownloadActivityFile = async () => {
      throw new Error("fichier d'activité : HTTP 503");
    };
    expect(await processInboxRow(row, { db, downloadActivityFile: failing })).toBe("error");
    expect(raw(t)).toHaveLength(1);
    expect(t.provider_webhook_inbox[0].processed_at).toBeFalsy();
    expect(t.provider_webhook_inbox[0].error).toContain("503");
  });

  it("rien n'est stocké sans consentement ni pour un inconnu", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] }, { consent: false });
    await processInboxRow(inbox("epochs", { userId: GARMIN_USER, summaryId: "e1" }), { db });
    await processInboxRow(inbox("epochs", { userId: "inconnu", summaryId: "e2" }), { db });
    expect(raw(t)).toHaveLength(0);
  });

  it("santé brute refusée sans HEALTH_EXPORT", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection({ granted_scopes: ["ACTIVITY_EXPORT"] })] });
    expect(await processInboxRow(inbox("pulseox", { userId: GARMIN_USER, summaryId: "p1" }), { db })).toBe("skipped");
    expect(raw(t)).toHaveLength(0);
  });

  async function seeded() {
    const m = memoryDb({ provider_connections: [connection()] });
    const deps = { db: m.db, downloadActivityFile: async () => new Uint8Array([1, 2]) };
    await processInboxRow(inbox("activityFiles", fileEntry, "f"), deps);
    await processInboxRow(inbox("activityDetails", { userId: GARMIN_USER, summaryId: "777-detail", activityId: 777, summary: { activityType: "RUNNING", startTimeInSeconds: 1762500000 }, samples: [{ heartRate: 150 }] }, "d"), deps);
    await processInboxRow(inbox("moveIQActivities", { userId: GARMIN_USER, summaryId: "m1" }, "m"), deps);
    await processInboxRow(inbox("sleeps", { userId: GARMIN_USER, summaryId: "s1", calendarDate: "2025-11-07", durationInSeconds: 25200 }, "s"), deps);
    await processInboxRow(inbox("bodyComps", { userId: GARMIN_USER, summaryId: "b1", weightInGrams: 70000 }, "b"), deps);
    expect(m.files.size).toBe(2);
    return m;
  }

  it("ACTIVITY_EXPORT retirée : supprime activités brutes et fichiers, garde la santé", async () => {
    const { db, t, files } = await seeded();
    const row = inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["HEALTH_EXPORT"] });
    await processInboxRow(row, { db });
    expect(raw(t).map((r) => r.summary_type).sort()).toEqual(["bodyComps", "sleeps"]);
    expect(files.size).toBe(0);
  });

  it("HEALTH_EXPORT retirée : supprime toute la santé brute, garde les activités", async () => {
    const { db, t, files } = await seeded();
    const row = inbox("userPermissionsChange", { userId: GARMIN_USER, permissions: ["ACTIVITY_EXPORT"] });
    await processInboxRow(row, { db });
    expect(raw(t).map((r) => r.summary_type).sort()).toEqual(["activityDetails", "activityFiles", "moveIQActivities"]);
    expect(files.size).toBe(2);
  });

  it("désinscription Garmin : lignes brutes et fichiers supprimés", async () => {
    const { db, t, files } = await seeded();
    expect(await processInboxRow(inbox("deregistrations", { userId: GARMIN_USER }), { db })).toBe("forgotten");
    expect(raw(t)).toHaveLength(0);
    expect(files.size).toBe(0);
  });
});

describe("activityFileDownloader", () => {
  const url = "https://apis.garmin.com/wellness-api/rest/activityFile?id=1&token=x";

  it("appelle Garmin avec le jeton de l'utilisateur", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([7, 8]), { status: 200 }));
    const dl = activityFileDownloader({ fetchImpl, accessToken: async () => "tok" });
    expect(await dl(url, "conn-1")).toEqual(new Uint8Array([7, 8]));
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("410 = déjà téléchargé ou expiré : null", async () => {
    const dl = activityFileDownloader({ fetchImpl: async () => new Response("", { status: 410 }), accessToken: async () => "tok" });
    expect(await dl(url, "c")).toBeNull();
  });

  it("refuse une URL hors de apis.garmin.com (le jeton ne part jamais ailleurs)", async () => {
    const fetchImpl = vi.fn();
    const dl = activityFileDownloader({ fetchImpl, accessToken: async () => "tok" });
    await expect(dl("https://evil.example/activityFile", "c")).rejects.toThrow(/refusée/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("une autre erreur HTTP lève (la ligne sera reprise)", async () => {
    const dl = activityFileDownloader({ fetchImpl: async () => new Response("", { status: 500 }), accessToken: async () => "tok" });
    await expect(dl(url, "c")).rejects.toThrow(/500/);
  });
});
