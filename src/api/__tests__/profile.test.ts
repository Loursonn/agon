import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  createMeasurementLog, createProfileItem, deleteMeasurementLog, deleteProfileItem, getAiInsights,
  getArticularProfile, getCoachName, getMeasurementLogs, getMeasurementPhotoUrls, getProfile, getProfileItems,
  getTrendSessions, groupArticular, invalidateProfile, profileKeys, recentWeights, recordWeightMilestone,
  saveWeight, updateAthleteProfile, updateMeasurementLog, updateProfileItem,
} from "@/api/profile";
import type { WellnessHistory } from "@shared/domain/wellness";

/** Bucket simulé : chemins déposés / retirés, échec possible à l'envoi. */
function fakeStorage(failUpload = false) {
  const files = new Set<string>();
  const removed: string[] = [];
  const bucket = {
    upload: (path: string) => {
      if (failUpload) return Promise.resolve({ data: null, error: { message: "quota" } });
      files.add(path);
      return Promise.resolve({ data: { path }, error: null });
    },
    remove: (paths: string[]) => {
      removed.push(...paths);
      paths.forEach((p) => files.delete(p));
      return Promise.resolve({ data: [], error: null });
    },
    createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}` })), error: null }),
  };
  return { files, removed, storage: { from: () => bucket } };
}

function world(
  tables: Record<string, Row[]> = {},
  o: { failOn?: { table: string; op: string }; rpcs?: Record<string, FakeRpc>; failUpload?: boolean; fn?: () => unknown } = {},
) {
  const base = fakeDb(tables, o.failOn, o.rpcs ?? {});
  const st = fakeStorage(o.failUpload);
  setDbForTests({
    ...base.db,
    storage: st.storage,
    functions: { invoke: () => Promise.resolve(o.fn?.() ?? { data: null, error: null }) },
  });
  return { tables: base.tables, ...st };
}

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

afterEach(() => {
  setDbForTests(null);
  vi.useRealTimers();
});

describe("api/profile — fiche", () => {
  it("getProfile : null si absente, lève si illisible", async () => {
    world({ profiles: [{ id: "a", role: "athlete", full_name: "Léa Démo" }] });
    expect(await getProfile("a")).toMatchObject({ full_name: "Léa Démo" });
    expect(await getProfile("x")).toBeNull();
    world({}, { failOn: { table: "profiles", op: "select" } });
    await expect(getProfile("a")).rejects.toThrow(/Lecture du profil impossible/);
  });

  it("updateAthleteProfile recompose full_name, sans toucher au coach", async () => {
    const { tables } = world({ profiles: [{ id: "a", full_name: "Ancien", coach_id: "c" }] });
    await updateAthleteProfile("a", {
      first_name: "Léa", last_name: "Démo", age: 25, birth_date: null, height_cm: 170, gender: "female",
      weight_kg: 60, body_fat_pct: null, base_metabolism: null,
    });
    expect(tables.profiles[0]).toMatchObject({ full_name: "Léa Démo", coach_id: "c", height_cm: 170 });
    await updateAthleteProfile("a", { first_name: "", last_name: "", age: null, birth_date: null, height_cm: null, gender: null, weight_kg: null, body_fat_pct: null, base_metabolism: null });
    expect(tables.profiles[0].full_name).toBe("Léa Démo");
  });

  it("getCoachName : prénom + nom, sinon nom complet, sinon « Coach »", async () => {
    world({ profiles: [
      { id: "c1", first_name: "Agon", last_name: "Démo", full_name: "x" },
      { id: "c2", first_name: null, last_name: null, full_name: "Agon" },
      { id: "c3", first_name: null, last_name: null, full_name: null },
    ] });
    expect(await getCoachName("c1")).toBe("Agon Démo");
    expect(await getCoachName("c2")).toBe("Agon");
    expect(await getCoachName("c3")).toBe("Coach");
    expect(await getCoachName("x")).toBeNull();
  });
});

describe("api/profile — mensurations", () => {
  it("création : jour LOCAL (pas la veille après minuit), photos rangées, mesures biométriques échues cochées", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 8, 0, 30)); // 8 nov., 00 h 30 heure locale
    const { tables, files } = world({ test_sessions: [
      { id: "t1", athlete_id: "a", type: "biometric", completed: false, date: "2026-11-08" },
      { id: "t2", athlete_id: "a", type: "biometric", completed: false, date: "2026-11-20" },
      { id: "t3", athlete_id: "a", type: "rm", completed: false, date: "2026-11-01" },
    ] });
    const log = await createMeasurementLog("a", { weight_kg: 61, measurements: { taille: 70 }, photoFiles: { face: file("p.PNG") } });
    expect(log.date).toBe("2026-11-08");
    const row = tables.measurement_logs[0];
    expect(row).toMatchObject({ athlete_id: "a", date: "2026-11-08", weight_kg: 61, taille: 70 });
    expect(row.photos).toEqual({ face: `a/mensurations/${row.id}/face.png` });
    expect([...files]).toEqual([`a/mensurations/${row.id}/face.png`]);
    expect(tables.test_sessions.map((t) => t.completed)).toEqual([true, false, false]);
  });

  it("création : photo refusée → la saisie est retirée et l'erreur remonte", async () => {
    const { tables } = world({}, { failUpload: true });
    await expect(createMeasurementLog("a", { measurements: {}, photoFiles: { dos: file("d.jpg") }, day: "2026-11-08" }))
      .rejects.toThrow(/Envoi de la photo impossible/);
    expect(tables.measurement_logs).toEqual([]);
  });

  it("modification : photo retirée et remplacée supprimées du bucket, mesures non saisies → null", async () => {
    const { tables, removed } = world({ measurement_logs: [{ id: "m1", athlete_id: "a", taille: 70, hanche: 90, photos: { face: "old-face", dos: "old-dos" } }] });
    await updateMeasurementLog("a", {
      id: "m1", existingPhotos: { face: "old-face", dos: "old-dos" }, measurements: { taille: 69 },
      newPhotoFiles: { face: file("n.jpg") }, removedSlots: ["dos"],
    });
    expect(removed.sort()).toEqual(["old-dos", "old-face"]);
    const row = tables.measurement_logs[0];
    expect(row).toMatchObject({ taille: 69, hanche: null, weight_kg: null });
    expect(Object.keys(row.photos as object)).toEqual(["face"]);
    expect((row.photos as { face: string }).face).toMatch(/^a\/mensurations\/m1\/face_\d+\.jpg$/);
  });

  it("lecture triée, suppression avec les photos, URLs signées ; lecture en panne → lève", async () => {
    const { tables, removed } = world({ measurement_logs: [
      { id: "m1", athlete_id: "a", date: "2026-10-01", photos: { face: "p1" } },
      { id: "m2", athlete_id: "a", date: "2026-11-01", photos: {} },
    ] });
    expect((await getMeasurementLogs("a")).map((l) => l.id)).toEqual(["m2", "m1"]);
    await deleteMeasurementLog({ id: "m1", photos: { face: "p1" } });
    expect(removed).toEqual(["p1"]);
    expect(tables.measurement_logs.map((l) => l.id)).toEqual(["m2"]);
    expect(await getMeasurementPhotoUrls(["b", "a"])).toEqual({ a: "https://s/a", b: "https://s/b" });
    expect(await getMeasurementPhotoUrls([])).toEqual({});
    world({}, { failOn: { table: "measurement_logs", op: "select" } });
    await expect(getMeasurementLogs("a")).rejects.toThrow(/mensurations/);
  });
});

describe("api/profile — profil articulaire et éléments", () => {
  it("groupArticular : dernière note, historique, préfixe d'articulation retiré, ordre connu", () => {
    const groups = groupArticular(
      [
        { id: "d1", name: "Épaule — Rotation", articulation: "Épaule", media_url: null },
        { id: "d2", name: "Zzz — Test", articulation: "Zzz", media_url: "m" },
        { id: "d3", name: "Épaule — Flexion", articulation: "Épaule", media_url: null },
      ],
      [
        { test_definition_id: "d1", performed_at: "2026-11-02", athlete_test_values: [{ value: 4 }] },
        { test_definition_id: "d1", performed_at: "2026-10-01", athlete_test_values: [{ value: 2 }] },
        { test_definition_id: "d2", performed_at: "2026-09-01", athlete_test_values: [] },
      ],
    );
    const epaule = groups.find((g) => g.articulation === "Épaule")!;
    expect(epaule.items.map((i) => i.action)).toEqual(["Flexion", "Rotation"]);
    expect(epaule.items[1]).toMatchObject({ score: 4, date: "2026-11-02", history: [{ date: "2026-11-02", score: 4 }, { date: "2026-10-01", score: 2 }] });
    expect(groups[groups.length - 1].articulation).toBe("Zzz");
    expect(groups.find((g) => g.articulation === "Zzz")!.items[0].score).toBeNull();
  });

  it("getArticularProfile : [] sans définitions, lève si les résultats sont illisibles", async () => {
    world({ test_definitions: [{ id: "d1", name: "Hanche — X", category: "force", articulation: "Hanche" }] });
    expect(await getArticularProfile("a")).toEqual([]);
    world(
      { test_definitions: [{ id: "d1", name: "Hanche — X", category: "bilan_articulaire", articulation: "Hanche", media_url: null }] },
      { failOn: { table: "athlete_test_results", op: "select" } },
    );
    await expect(getArticularProfile("a")).rejects.toThrow(/profil articulaire/);
  });

  it("éléments de profil : création nettoyée, modification, suppression", async () => {
    const { tables } = world();
    await createProfileItem("a", { category: "force" as never, label: "  Squat  ", rating: 4, note: "   " });
    expect(tables.athlete_profile_items[0]).toMatchObject({ athlete_id: "a", label: "Squat", rating: 4, note: null });
    const id = tables.athlete_profile_items[0].id as string;
    await updateProfileItem(id, { category: "force" as never, label: "Squat avant", rating: 3, note: " ok " });
    expect(tables.athlete_profile_items[0]).toMatchObject({ label: "Squat avant", note: "ok" });
    expect(await getProfileItems("a")).toHaveLength(1);
    await deleteProfileItem(id);
    expect(await getProfileItems("a")).toEqual([]);
  });
});

describe("api/profile — poids", () => {
  const entry = (day: string, weightKg: number | null) => ({ day, weightKg } as unknown);

  it("recentWeights : 3 dernières pesées, jour ISO (la date s'affiche enfin), null sans pesée", () => {
    const h = {
      "2026-11-01": entry("2026-11-01", 70), "2026-11-03": entry("2026-11-03", 71),
      "2026-11-04": entry("2026-11-04", null), "2026-11-05": entry("2026-11-05", 72.4), "2026-10-01": entry("2026-10-01", 60),
    } as unknown as WellnessHistory;
    expect(recentWeights(h)).toEqual({ avg: 71.1, lastDate: "2026-11-05", count: 3 });
    expect(recentWeights({} as WellnessHistory)).toBeNull();
  });

  /** Ce que font les RPC en base (voir la migration 20261109150000). */
  const rpcs: Record<string, FakeRpc> = {
    weight_set_day: (a, t) => {
      const rows = (t.app_data ??= []);
      let row = rows.find((r) => r.athlete_id === a.p_athlete && r.key === "asp:wlog");
      if (!row) rows.push((row = { athlete_id: a.p_athlete, key: "asp:wlog", value: {} }));
      const key = String(a.p_day).replace(/-/g, "");
      const { [String(a.p_day)]: _iso, ...rest } = row.value as Record<string, number>;
      row.value = { ...rest, [key]: a.p_kg };
      return row.value;
    },
    weight_record_milestone: (a) => ({ current: a.p_kg, target: 65 }),
  };

  it("saveWeight : un jour via la RPC, les autres pesées restent ; journal rendu en clés compactes", async () => {
    const { tables } = world({ app_data: [{ athlete_id: "a", key: "asp:wlog", value: { "20261101": 70, "2026-11-02": 69 } }] }, { rpcs });
    const log = await saveWeight("a", "2026-11-02", 70.5);
    expect(log).toEqual({ "20261101": 70, "20261102": 70.5 });
    expect(tables.app_data[0].value).toEqual(log);
  });

  it("saveWeight / recordWeightMilestone : jour ou poids invalide refusé avant l'appel, refus du serveur remonté", async () => {
    world({}, { rpcs });
    await expect(saveWeight("a", "20261102", 70)).rejects.toThrow(/Jour de pesée invalide/);
    await expect(saveWeight("a", "2026-11-02", 0)).rejects.toThrow(/Poids invalide/);
    await expect(recordWeightMilestone("a", "2026-11-02", NaN)).rejects.toThrow(/Poids invalide/);
    expect(await recordWeightMilestone("a", "2026-11-02", 66)).toEqual({ current: 66, target: 65 });
    world({}, { failOn: { table: "weight_set_day", op: "rpc" } });
    await expect(saveWeight("a", "2026-11-02", 70)).rejects.toThrow(/Enregistrement du poids impossible/);
  });
});

describe("api/profile — tendances", () => {
  it("getTrendSessions : muscu + énergie sur la plage ; lève si une source est illisible", async () => {
    world({
      workout_logs: [{ athlete_id: "a", scheduled_date: "2026-11-02", status: "completed" }, { athlete_id: "a", scheduled_date: "2026-12-01", status: "planned" }],
      energy_session_assignments: [{ athlete_id: "a", scheduled_date: "2026-11-03", status: "missed" }],
    });
    expect(await getTrendSessions("a", "2026-11-01", "2026-11-30")).toEqual([
      { athlete_id: "a", scheduled_date: "2026-11-02", status: "completed" },
      { athlete_id: "a", scheduled_date: "2026-11-03", status: "missed" },
    ]);
    world({}, { failOn: { table: "energy_session_assignments", op: "select" } });
    await expect(getTrendSessions("a", "2026-11-01", "2026-11-30")).rejects.toThrow(/séances énergie/);
  });

  it("getAiInsights : phrases nettoyées (4 max), null si vide, lève si la fonction échoue", async () => {
    world({}, { fn: () => ({ data: { insights: ["Un", " ", 3, "Deux", "Trois", "Quatre", "Cinq"] }, error: null }) });
    expect(await getAiInsights({})).toEqual(["Un", "Deux", "Trois", "Quatre"]);
    world({}, { fn: () => ({ data: { insights: [] }, error: null }) });
    expect(await getAiInsights({})).toBeNull();
    world({}, { fn: () => ({ data: null, error: { message: "404" } }) });
    await expect(getAiInsights({})).rejects.toThrow(/Synthèse IA indisponible/);
  });

  it("invalidateProfile couvre le profil et les clés gardées pour les autres domaines", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateProfile(qc as never, "a");
    const keys = qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual([["profile", "a"], ["articularProfile", "a"], ["athlete-trend-sessions", "a"], ["athlete-insights", "a"]]);
    expect(profileKeys.measurements("a").slice(0, 2)).toEqual(["profile", "a"]);
    expect(profileKeys.articular("a")).toEqual(["articularProfile", "a"]);
  });
});
