import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { ApiError, setDbForTests } from "@/api/client";
import {
  createMeasurementLog, createProfileItem, deleteMeasurementLog, deleteProfileItem, getAiInsights,
  getArticularProfile, getCoachName, getMeasurementLogs, getMeasurementPhotoUrls, getProfile, getProfileItems,
  getBodyWeightGoal, getTrendSessions, getWeightLog, getWeightMilestones, groupArticular, invalidateProfile,
  profileKeys, recentWeights, recordWeightMilestone, saveWeight, saveWeightGoal, setMyBirthDate, BirthDateRefused, toLegacyBodyWeight, toLegacyMilestones,
  toLegacyWeightLog, updateAthleteProfile, updateMeasurementLog, updateProfileItem,
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

describe("api/profile — objectif de poids", () => {
  const rpcs: Record<string, FakeRpc> = {
    weight_set_goal: (a, t) => {
      const rows = (t.app_data ??= []);
      let row = rows.find((r) => r.athlete_id === a.p_athlete && r.key === "asp:bw");
      if (!row) rows.push((row = { athlete_id: a.p_athlete, key: "asp:bw", value: { current: 0 } }));
      row.value = { ...(row.value as object), target: a.p_target_kg ?? 0 };
      return row.value;
    },
  };

  it("saveWeightGoal : ne change que target, current gardé ; null = pas d'objectif", async () => {
    const { tables } = world({ app_data: [{ athlete_id: "a", key: "asp:bw", value: { current: 70, target: 0 } }] }, { rpcs });
    expect(await saveWeightGoal("a", 65.5)).toEqual({ current: 70, target: 65.5 });
    expect(tables.app_data[0].value).toEqual({ current: 70, target: 65.5 });
    expect(await saveWeightGoal("a", null)).toEqual({ current: 70, target: 0 });
  });

  it("saveWeightGoal : objectif invalide refusé avant l'appel, refus du serveur remonté", async () => {
    world({}, { rpcs });
    await expect(saveWeightGoal("a", -1)).rejects.toThrow(/Objectif de poids invalide/);
    await expect(saveWeightGoal("a", 500)).rejects.toThrow(/Objectif de poids invalide/);
    world({}, { failOn: { table: "weight_set_goal", op: "rpc" } });
    await expect(saveWeightGoal("a", 65)).rejects.toThrow(/Enregistrement de l'objectif impossible/);
  });
});

describe("api/profile — poids (tables body_weight_*)", () => {
  const tables = () => ({
    body_weight_logs: [
      { athlete_id: "a", day: "2026-11-03", kg: 71 },
      { athlete_id: "a", day: "2026-11-01", kg: "70.5" },
      { athlete_id: "b", day: "2026-11-01", kg: 90 },
    ],
    body_weight_milestones: [
      { athlete_id: "a", day: "2026-11-03", kg: 71 },
      { athlete_id: "a", day: "2026-10-01", kg: 69.5 },
    ],
    body_weight_goals: [
      { athlete_id: "a", reference_kg: 71, target_kg: null },
      { athlete_id: "c", reference_kg: null, target_kg: null },
    ],
    // Ancien stockage équivalent (lu seulement si les tables n'existent pas encore).
    app_data: [
      { athlete_id: "a", key: "asp:wlog", value: { "20261103": 71, "20261101": 70.5, "1": 3 } },
      { athlete_id: "a", key: "asp:wmile", value: [{ date: "20261003", kg: 0 }, { date: "20261103", kg: 71 }, { date: "20261001", kg: 69.5 }, { date: "20261103", kg: 71 }] },
      { athlete_id: "a", key: "asp:bw", value: { current: 71, target: 0 } },
    ],
  });

  /** Comme PostgREST quand une table n'existe pas encore (migration pas appliquée). */
  function withoutTables(t: Record<string, Row[]>, failOn?: { table: string; op: string }) {
    const base = fakeDb(t, failOn);
    const missing = { data: null, error: { message: "Could not find the table", code: "PGRST205" } };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order"]) chain[m] = () => chain;
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(missing).then(ok);
    setDbForTests({ ...base.db, from: (name: string) => (name.startsWith("body_weight_") ? chain : base.db.from(name)) });
  }

  afterEach(() => setDbForTests(null));

  it("getWeightLog : pesées de l'athlète, jours croissants, bornes ; lève si la lecture échoue", async () => {
    world(tables());
    expect(await getWeightLog("a")).toEqual([{ day: "2026-11-01", kg: 70.5 }, { day: "2026-11-03", kg: 71 }]);
    expect(await getWeightLog("a", { from: "2026-11-02" })).toEqual([{ day: "2026-11-03", kg: 71 }]);
    expect(await getWeightLog("z")).toEqual([]);
    world(tables(), { failOn: { table: "body_weight_logs", op: "select" } });
    await expect(getWeightLog("a")).rejects.toThrow(/Lecture des pesées impossible/);
  });

  it("paliers et objectif : objectif absent → null (jamais 0) ; aucun → null", async () => {
    world(tables());
    expect(await getWeightMilestones("a")).toEqual([{ day: "2026-10-01", kg: 69.5 }, { day: "2026-11-03", kg: 71 }]);
    expect(await getBodyWeightGoal("a")).toEqual({ referenceKg: 71, targetKg: null });
    expect(await getBodyWeightGoal("c")).toBeNull();
    expect(await getBodyWeightGoal("z")).toBeNull();
  });

  it("table absente : même résultat depuis app_data (clés parasites, 0 et doublons écartés)", async () => {
    world(tables());
    const fromTables = [await getWeightLog("a"), await getWeightMilestones("a"), await getBodyWeightGoal("a")];
    withoutTables(tables());
    expect([await getWeightLog("a"), await getWeightMilestones("a"), await getBodyWeightGoal("a")]).toEqual(fromTables);
    expect(await getWeightLog("a", { to: "2026-11-02" })).toEqual([{ day: "2026-11-01", kg: 70.5 }]);
    expect(await getBodyWeightGoal("z")).toBeNull();
    withoutTables(tables(), { table: "app_data", op: "select" });
    await expect(getWeightLog("a")).rejects.toThrow(/Lecture des pesées impossible/);
  });

  it("adaptateurs vers l'état historique (clés compactes, 0 par défaut)", () => {
    const pts = [{ day: "2026-11-01", kg: 70.5 }, { day: "2026-11-03", kg: 71 }];
    expect(toLegacyWeightLog(pts)).toEqual({ "20261101": 70.5, "20261103": 71 });
    expect(toLegacyMilestones(pts)).toEqual([{ date: "20261101", kg: 70.5 }, { date: "20261103", kg: 71 }]);
    expect(toLegacyBodyWeight({ referenceKg: 71, targetKg: null })).toEqual({ current: 71, target: 0 });
    expect(toLegacyBodyWeight(null)).toEqual({ current: 0, target: 0 });
  });

  it("les clés de poids sont sous ['profile', aid] : invalidateProfile les couvre", () => {
    expect(profileKeys.weightLog("a").slice(0, 2)).toEqual(["profile", "a"]);
    expect(profileKeys.weightGoal("a").slice(0, 3)).toEqual(profileKeys.weight("a"));
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

describe("api/profile — date de naissance des anciens comptes (revue juridique C2)", () => {
  /** RPC simulée : renvoie ce qu'on lui dit, garde les arguments. */
  function rpcDb(res: { data?: unknown; error?: { message: string; code?: string } | null }) {
    const calls: Array<[string, unknown]> = [];
    setDbForTests({ rpc: (fn: string, args: unknown) => (calls.push([fn, args]), Promise.resolve({ data: res.data ?? null, error: res.error ?? null })) });
    return calls;
  }

  it("écrit par la RPC set_my_birth_date et renvoie la date enregistrée", async () => {
    const calls = rpcDb({ data: "1990-04-12" });
    expect(await setMyBirthDate(" 1990-04-12 ")).toBe("1990-04-12");
    expect(calls).toEqual([["set_my_birth_date", { p_birth: "1990-04-12" }]]);
  });

  it("date refusée par la règle d'âge avant l'appel (vide, invalide, moins de 15 ans)", async () => {
    const calls = rpcDb({ data: "x" });
    const young = new Date();
    young.setFullYear(young.getFullYear() - 10);
    for (const d of ["", "2010-02-30", young.toISOString().slice(0, 10)]) {
      await expect(setMyBirthDate(d)).rejects.toBeInstanceOf(BirthDateRefused);
    }
    expect(calls).toEqual([]);
  });

  it("refus du serveur : règle d'âge (23514) en message lisible, le reste en ApiError avec son code", async () => {
    rpcDb({ error: { code: "23514", message: "Tu dois avoir au moins 15 ans pour utiliser Agon." } });
    const e = await setMyBirthDate("1990-04-12").catch((x) => x);
    expect(e).toBeInstanceOf(BirthDateRefused);
    expect(e.message).toBe("Tu dois avoir au moins 15 ans pour utiliser Agon.");
    for (const code of ["PGRST202", "23505"]) {
      rpcDb({ error: { code, message: "x" } });
      const f = await setMyBirthDate("1990-04-12").catch((x) => x);
      expect(f).toBeInstanceOf(ApiError);
      expect(f.code).toBe(code);
    }
  });
});
