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
import { drainInbox, processInboxRow, type FindDuplicate, type InboxRow } from "../providers/garminIngest";

type Row = Record<string, unknown>;

function memoryDb(init: Record<string, Row[]>, opts: { consent?: boolean } = {}) {
  const t: Record<string, Row[]> = structuredClone(init);
  const tab = (n: string) => (t[n] ??= []);
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const db: Db = {
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      if (name === "source_consent_granted") return Promise.resolve({ data: opts.consent ?? true, error: null });
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
        if (conn) t.provider_webhook_inbox = tab("provider_webhook_inbox").filter((i) => i.external_user_id !== conn.external_user_id);
        t.provider_connections = tab("provider_connections").filter((c) => c !== conn);
        return Promise.resolve({ data: { activities: 0, dailies: 0, inbox: 0, connection: conn ? 1 : 0 }, error: null });
      }
      if (name === "provider_inbox_claim") {
        const ids = args.p_ids as string[] | null;
        const rows = tab("provider_webhook_inbox").filter((r) => !r.processed_at && (!ids || ids.includes(r.id as string)));
        return Promise.resolve({ data: rows, error: null });
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
        return { data: null, error: null };
      };
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
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
        upsert: (row: Row) => {
          const rows = tab(table);
          const i = rows.findIndex((r) => r.athlete_id === row.athlete_id && r.source === row.source && r.external_id === row.external_id);
          if (i >= 0) rows[i] = { ...rows[i], ...row };
          else rows.push({ id: `a${rows.length + 1}`, ...row });
          return Promise.resolve({ error: null });
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return chain;
    },
  };
  return { db, t, rpcCalls };
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

const noDup: FindDuplicate = async () => null;

describe("activités", () => {
  it("importe une activité avec son appareil, puis marque la ligne traitée", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("imported");
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_activities[0]).toMatchObject({ athlete_id: ATHLETE, source: "garmin", external_id: "777", device_name: "fēnix 8" });
    expect(t.provider_webhook_inbox[0].processed_at).toBeTruthy();
    expect(t.provider_connections[0].last_sync_at).toBeTruthy();
  });

  it("rejouer la même notification ne crée pas de seconde ligne", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("activities", activityEntry, "a"), { db, findDuplicate: noDup });
    await processInboxRow(inbox("activities", activityEntry, "b"), { db, findDuplicate: async () => ({ id: "a1", source: "garmin" }) });
    expect(t.provider_activities).toHaveLength(1);
  });

  it("n'importe pas une sortie déjà connue par une autre source (±2 min)", async () => {
    const row = inbox("activities", activityEntry);
    const findDuplicate = vi.fn<FindDuplicate>(async () => ({ id: "f1", source: "file_import" }));
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, findDuplicate })).toBe("duplicate");
    expect(t.provider_activities ?? []).toHaveLength(0);
    expect(findDuplicate.mock.calls[0][1]).toEqual({
      athleteId: ATHLETE,
      sport: "running",
      startedAt: "2025-11-07T07:20:00.000Z",
      externalId: "777",
    });
    expect(t.provider_webhook_inbox[0].error).toContain("file_import");
  });

  it("supprime sans importer les données d'un utilisateur Garmin inconnu", async () => {
    const row = inbox("activities", { ...activityEntry, userId: "inconnu" });
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("unknown_user");
    expect(t.provider_activities ?? []).toHaveLength(0);
    expect(t.provider_webhook_inbox).toHaveLength(0);
  });

  it("n'importe rien sans consentement garmin_sync, et ne garde pas le brut", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] }, { consent: false });
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
    expect(t.provider_webhook_inbox).toHaveLength(0);
  });

  it("n'importe rien pour une connexion dont l'accord a été retiré", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection({ status: "consent_withdrawn" })], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("n'importe pas d'activité quand ACTIVITY_EXPORT n'est pas accordée", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection({ granted_scopes: ["HEALTH_EXPORT"] })], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("skipped");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("une erreur de la base reste sur la ligne, qui sera reprise", async () => {
    const row = inbox("activities", activityEntry);
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    const failing: FindDuplicate = async () => {
      throw new Error("contrôle de doublon (heure de départ) : timeout");
    };
    expect(await processInboxRow(row, { db, findDuplicate: failing })).toBe("error");
    expect(t.provider_webhook_inbox[0].processed_at).toBeFalsy();
    expect(t.provider_webhook_inbox[0].error).toContain("timeout");
    expect(t.provider_activities ?? []).toHaveLength(0);
  });

  it("une notification en mode ping est signalée, pas suivie", async () => {
    const row = inbox("activities", { userId: GARMIN_USER, callbackURL: "https://apis.garmin.com/x" });
    const { db, t } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: [row] });
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("skipped");
    expect(t.provider_webhook_inbox[0].error).toContain("ping");
  });
});

describe("données quotidiennes", () => {
  it("fusionne dailies et sleeps du même jour sans écrasement", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection()] });
    await processInboxRow(inbox("dailies", { userId: GARMIN_USER, calendarDate: "2025-11-07", steps: 9000, restingHeartRateInBeatsPerMinute: 50 }, "d"), { db, findDuplicate: noDup });
    await processInboxRow(inbox("sleeps", { userId: GARMIN_USER, calendarDate: "2025-11-07", durationInSeconds: 25200 }, "s"), { db, findDuplicate: noDup });
    expect(t.provider_dailies).toHaveLength(1);
    expect(t.provider_dailies[0]).toMatchObject({ steps: 9000, resting_hr: 50, sleep_total_min: 420 });
    expect(Object.keys(t.provider_dailies[0].raw as Row).sort()).toEqual(["dailies", "sleeps"]);
  });

  it("n'importe pas de santé quand HEALTH_EXPORT n'est pas accordée", async () => {
    const { db, t } = memoryDb({ provider_connections: [connection({ granted_scopes: ["ACTIVITY_EXPORT"] })] });
    expect(await processInboxRow(inbox("dailies", { userId: GARMIN_USER, calendarDate: "2025-11-07", steps: 1 }), { db, findDuplicate: noDup })).toBe("skipped");
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
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("forgotten");
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
    expect(await processInboxRow(row, { db, findDuplicate: noDup })).toBe("permissions_updated");
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
    await processInboxRow(row, { db, findDuplicate: noDup });
    expect(t.provider_activities).toHaveLength(1);
    expect(t.provider_dailies).toHaveLength(0);
  });
});

describe("drainInbox", () => {
  it("traite le lot pris et compte les issues", async () => {
    const rows = [inbox("activities", activityEntry, "1"), inbox("dailies", { userId: "x", calendarDate: "2025-11-07" }, "2"), inbox("bodyComps", { userId: GARMIN_USER }, "3")];
    const { db } = memoryDb({ provider_connections: [connection()], provider_webhook_inbox: rows });
    const counts = await drainInbox({ db, findDuplicate: noDup });
    expect(counts).toMatchObject({ imported: 1, unknown_user: 1, skipped: 1, error: 0 });
  });
});
