/**
 * Export RGPD (art. 15 / 20) : inventaire des tables, secrets jamais exportés,
 * fusion des lectures d'une même table, échecs signalés sans tout perdre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

type Call = { table: string; column: string; value: string; columns?: string };
const calls: Call[] = [];
let rowsFor: (c: Call) => unknown[] = () => [];

let signed: (paths: string[]) => Record<string, string> = (paths) => Object.fromEntries(paths.map((p) => [p, `https://signe/${p}`]));
const signCalls: Array<{ paths: string[]; expires: number }> = [];

vi.mock("@/api/account", () => ({
  PROVIDER_RAW_BUCKET: "provider-raw",
  signOwnRawFiles: vi.fn(async (paths: string[], expires: number) => {
    signCalls.push({ paths, expires });
    return signed(paths);
  }),
  readOwnRows: vi.fn(async (table: string, column: string, value: string, columns?: string) => {
    const c = { table, column, value, columns };
    calls.push(c);
    return rowsFor(c);
  }),
}));
vi.mock("@/api/profile", () => ({
  getProfile: vi.fn(async (id: string) => ({ id, full_name: "Léa Démo", birth_date: "1998-04-12", role: "athlete" })),
}));

import { EXPORT_JOBS, buildDataExport, rawFileRefs, stripSecrets } from "@/lib/dataExport";

const has = (table: string, column: string) => EXPORT_JOBS.some((j) => j.table === table && j.column === column);

beforeEach(() => {
  calls.length = 0;
  signCalls.length = 0;
  rowsFor = () => [];
  signed = (paths) => Object.fromEntries(paths.map((p) => [p, `https://signe/${p}`]));
});

describe("inventaire de l'export", () => {
  it("couvre les données manquantes de l'audit §9", () => {
    // Hyrox, tests, compétitions, nutrition (app_data), retours hebdo
    for (const t of ["hyrox_results", "hyrox_race_plans", "hyrox_test_analyses", "athlete_test_results",
      "test_sessions", "performance_logs", "competitions", "app_data", "weekly_retours", "weekly_reviews"]) {
      expect(has(t, "athlete_id"), t).toBe(true);
    }
    // Staff et co-coach, des deux côtés
    expect(has("athlete_staff", "athlete_id") && has("athlete_staff", "staff_id")).toBe(true);
    expect(has("athlete_co_coaches", "athlete_id") && has("athlete_co_coaches", "co_coach_id")).toBe(true);
    expect(has("staff_invitations", "athlete_id") && has("staff_invitations", "invited_by")).toBe(true);
    // Assistant IA du coach
    for (const t of ["coach_api_keys", "coach_api_drafts", "coach_api_access_log"]) expect(has(t, "coach_id"), t).toBe(true);
    // Fiches : métadonnées et chemins
    expect(has("docs", "athlete_id") && has("docs", "coach_id") && has("doc_schedule", "athlete_id")).toBe(true);
    // Montres
    expect(has("provider_activities", "athlete_id") && has("provider_dailies", "athlete_id")).toBe(true);
  });

  it("n'exporte jamais les tables de secrets", () => {
    for (const t of ["athlete_claims", "provider_oauth_states", "provider_tokens", "coach_api_rate"]) {
      expect(EXPORT_JOBS.some((j) => j.table === t), t).toBe(false);
    }
  });

  it("lit les tables à secrets avec une liste de colonnes sans le secret", () => {
    const sel = (t: string) => EXPORT_JOBS.filter((j) => j.table === t).map((j) => j.select ?? "*");
    for (const s of sel("coach_api_keys")) expect(s).not.toMatch(/\*|key_hash|key_prefix/);
    for (const s of sel("staff_invitations")) expect(s).not.toMatch(/\*|token/);
    for (const s of sel("provider_connections")) expect(s).not.toMatch(/\*|sync_lock_token/);
  });

  it("embarque les tables enfants (microcycles, mésocycles, valeurs de tests, commentaires)", () => {
    const sel = (t: string) => EXPORT_JOBS.find((j) => j.table === t)?.select ?? "";
    expect(sel("cycles")).toContain("microcycles(*)");
    expect(sel("macrocycles")).toContain("mesocycles(*)");
    expect(sel("athlete_test_results")).toContain("athlete_test_values(*)");
    expect(sel("workout_logs")).toContain("workout_exercise_comments(*)");
  });
});

describe("stripSecrets", () => {
  it("retire les secrets, y compris dans les tables embarquées", () => {
    expect(stripSecrets([{ id: "1", token: "t", key_hash: "h", child: [{ code_verifier: "v", ok: 1 }] }]))
      .toEqual([{ id: "1", child: [{ ok: 1 }] }]);
  });
});

describe("buildDataExport", () => {
  it("met le profil (dont la date de naissance) et ne lit qu'avec l'id de l'utilisateur", async () => {
    const { payload } = await buildDataExport("u1");
    expect((payload as { profile: { birth_date: string } }).profile.birth_date).toBe("1998-04-12");
    expect(calls.length).toBe(EXPORT_JOBS.length);
    expect(calls.every((c) => c.value === "u1")).toBe(true);
  });

  it("fusionne les lectures d'une même table sans doublon et compte les lignes", async () => {
    rowsFor = (c) =>
      c.table === "athlete_staff" && c.column === "athlete_id" ? [{ id: "s1" }, { id: "s2" }]
      : c.table === "athlete_staff" && c.column === "staff_id" ? [{ id: "s2" }, { id: "s3" }]
      : [];
    const r = await buildDataExport("u1");
    expect((r.payload as Record<string, unknown[]>).athlete_staff).toEqual([{ id: "s1" }, { id: "s2" }, { id: "s3" }]);
    expect(r.rowCount).toBe(3);
    expect(r.failures).toEqual([]);
  });

  it("secrets retirés même si une lecture les ramène", async () => {
    rowsFor = (c) => (c.table === "coach_api_keys" ? [{ id: "k", name: "Claude", key_hash: "h" }] : []);
    const r = await buildDataExport("u1");
    expect((r.payload as Record<string, unknown[]>).coach_api_keys).toEqual([{ id: "k", name: "Claude" }]);
  });

  it("embarquement refusé : table parente gardée, échec signalé", async () => {
    rowsFor = (c) => {
      if (c.table !== "cycles") return [];
      if (c.columns?.includes("microcycles")) throw new Error("relation introuvable");
      return [{ id: "c1" }];
    };
    const r = await buildDataExport("u1");
    expect((r.payload as Record<string, unknown[]>).cycles).toEqual([{ id: "c1" }]);
    expect(r.failures).toEqual([{ table: "cycles (*, microcycles(*))", reason: "relation introuvable" }]);
  });

  it("table illisible : consignée, l'export continue", async () => {
    rowsFor = (c) => {
      if (c.table === "habits") throw new Error("permission denied");
      return c.table === "app_data" ? [{ key: "asp:nutri", athlete_id: "u1" }] : [];
    };
    const r = await buildDataExport("u1");
    expect(r.failures).toEqual([{ table: "habits.athlete_id", reason: "permission denied" }]);
    expect((r.payload as Record<string, unknown[]>).app_data).toHaveLength(1);
  });

  it("table morte supprimée (workout_rpe, seasons…) : ignorée sans échec ; une autre table absente reste signalée", async () => {
    const { ApiError } = await import("@/api/client");
    rowsFor = (c) => {
      if (["workout_rpe", "seasons", "habits"].includes(c.table)) throw new ApiError("lecture", { message: "table absente", code: "PGRST205" });
      return [];
    };
    const r = await buildDataExport("u1");
    expect(r.failures.map((f) => f.table)).toEqual(["habits.athlete_id"]);
  });

  it("garde l'attribution Garmin sur les activités", async () => {
    rowsFor = (c) => (c.table === "provider_activities" ? [{ id: "a", source: "garmin", device_name: "Edge 840" }] : []);
    const r = await buildDataExport("u1");
    const [a] = (r.payload as Record<string, Array<Record<string, unknown>>>).provider_activities;
    expect(a.attribution).toBe("Garmin Edge 840");
  });
});

describe("fichiers bruts de montre (P37)", () => {
  const raw = [
    { id: "r1", athlete_id: "u1", source: "garmin", summary_type: "activityDetails", summary_id: "9", samples_path: "u1/garmin/activityDetails/9.json.gz", file_path: null },
    { id: "r2", athlete_id: "u1", source: "garmin", summary_type: "activityFiles", summary_id: "9", samples_path: null, file_path: "u1/garmin/activityFiles/9.fit" },
    { id: "r3", athlete_id: "u1", source: "garmin", summary_type: "dailies", summary_id: "d", samples_path: null, file_path: null },
  ];

  it("liste chaque fichier une fois, avec son type", () => {
    expect(rawFileRefs([...raw, raw[0]])).toEqual([
      { path: "u1/garmin/activityDetails/9.json.gz", kind: "samples", source: "garmin", summary_type: "activityDetails", summary_id: "9" },
      { path: "u1/garmin/activityFiles/9.fit", kind: "file", source: "garmin", summary_type: "activityFiles", summary_id: "9" },
    ]);
  });

  it("ajoute les liens signés 7 jours, avec l'attribution Garmin", async () => {
    rowsFor = (c) => (c.table === "provider_raw_records" ? raw : []);
    const { payload, failures } = await buildDataExport("u1");
    const files = (payload as { provider_raw_files: Array<Record<string, unknown>> }).provider_raw_files;
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ attribution: "Garmin", bucket: "provider-raw", kind: "samples", url: "https://signe/u1/garmin/activityDetails/9.json.gz" });
    expect(files[1].url_expires_at).toBeTruthy();
    expect(signCalls).toEqual([{ paths: ["u1/garmin/activityDetails/9.json.gz", "u1/garmin/activityFiles/9.fit"], expires: 7 * 86_400 }]);
    expect(failures).toEqual([]);
  });

  it("fichier absent du stockage : listé sans lien, signalé", async () => {
    rowsFor = (c) => (c.table === "provider_raw_records" ? raw : []);
    signed = (paths) => ({ [paths[0]]: "https://signe/a" });
    const { payload, failures } = await buildDataExport("u1");
    const files = (payload as { provider_raw_files: Array<Record<string, unknown>> }).provider_raw_files;
    expect(files[1]).toMatchObject({ url: null, url_expires_at: null });
    expect(failures).toEqual([{ table: "provider_raw_files", reason: "1 fichier(s) introuvable(s) dans le stockage" }]);
  });

  it("signature en panne : l'export part quand même, liste sans liens, échec signalé", async () => {
    rowsFor = (c) => (c.table === "provider_raw_records" ? raw : []);
    signed = () => { throw new Error("stockage injoignable"); };
    const { payload, failures } = await buildDataExport("u1");
    expect((payload as { provider_raw_files: unknown[] }).provider_raw_files).toHaveLength(2);
    expect(failures[0]).toMatchObject({ table: "provider_raw_files", reason: "stockage injoignable" });
  });

  it("aucun fichier brut : pas de section, aucun appel au stockage", async () => {
    const { payload } = await buildDataExport("u1");
    expect(payload).not.toHaveProperty("provider_raw_files");
    expect(signCalls).toHaveLength(0);
  });
});
