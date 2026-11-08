import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  buildCategorySeries,
  buildTestProgression,
  completeTestSession,
  createTestDefinition,
  deleteTestResult,
  fillCoachTestSession,
  getCategoryTestSeries,
  getTestProgression,
  getTestSessionForFill,
  invalidateTestDefinitions,
  invalidateTests,
  listCurrentValues,
  listPendingCoachTests,
  listTestDefinitions,
  listTestResults,
  listTestSessions,
  pendingCoachTests,
  pickDefinitionByName,
  saveTestResult,
  testKeys,
  updateTestDefinition,
} from "@/api/tests";

afterEach(() => setDbForTests(null));

const variable = (id: string, label: string, o: Partial<Row> = {}): Row => ({
  id, test_definition_id: "d", key: id, label, unit: "cm", value_type: "number", better_when: "higher",
  extrap_metric: null, extrap_op: null, extrap_factor: null, created_at: "2026-01-01", ...o,
});
const def = (id: string, o: Partial<Row> = {}): Row => ({
  id, name: `Test ${id}`, kind: "custom", category: null, articulation: null, media_url: null, fill_mode: "self",
  created_by: null, is_global: false, description: null, protocol: null, created_at: "2026-01-01", updated_at: "2026-01-01",
  test_variables: [], ...o,
});

describe("définitions", () => {
  it("tests globaux + ceux du coach, variables triées par libellé", async () => {
    const { db } = fakeDb({
      test_definitions: [
        def("g", { is_global: true, test_variables: [variable("b", "Zèbre"), variable("a", "Arrivée")] }),
        def("mine", { created_by: "c1" }),
        def("autre", { created_by: "c2" }),
      ],
    });
    setDbForTests(db);
    const list = await listTestDefinitions("c1");
    expect(list.map((d) => d.id).sort()).toEqual(["g", "mine"]);
    expect(list.find((d) => d.id === "g")!.test_variables.map((v) => v.label)).toEqual(["Arrivée", "Zèbre"]);
  });

  it("définition d'une séance par son titre : comme le trigger (global d'abord, puis le plus ancien)", () => {
    const defs = [
      { id: "custom-old", name: "Saut", is_global: false, created_at: "2025-01-01" },
      { id: "global-new", name: "SAUT ", is_global: true, created_at: "2026-01-01" },
      { id: "global-old", name: "saut", is_global: true, created_at: "2025-06-01" },
      { id: "autre", name: "Saut long", is_global: true, created_at: "2024-01-01" },
    ];
    expect(pickDefinitionByName(defs, "Saut")?.id).toBe("global-old");
    expect(pickDefinitionByName(defs.slice(0, 1), " saut")?.id).toBe("custom-old");
    expect(pickDefinitionByName(defs, "Course")).toBeNull();
  });

  it("création : la définition est retirée si les variables échouent", async () => {
    const { db, tables } = fakeDb({}, { table: "test_variables", op: "insert" });
    setDbForTests(db);
    await expect(
      createTestDefinition("c1", {
        name: " Saut ", category: null, articulation: "x", media_url: "", fill_mode: "self", description: "", protocol: "",
        variables: [{ key: "cm", label: "Distance", unit: "cm", value_type: "number", better_when: "higher", extrap_metric: null, extrap_op: null, extrap_factor: null }],
      }),
    ).rejects.toThrow("Variables du test non créées");
    expect(tables.test_definitions ?? []).toHaveLength(0);
  });

  it("création réussie : champs nettoyés, test du coach", async () => {
    const { db, tables } = fakeDb({});
    setDbForTests(db);
    const d = await createTestDefinition("c1", {
      name: " Saut ", category: "bilan_articulaire", articulation: " Genou ", media_url: " ", fill_mode: "coach", description: " ", protocol: " Sauter ",
      variables: [{ key: "cm", label: "Distance", unit: "cm", value_type: "number", better_when: "higher", extrap_metric: null, extrap_op: null, extrap_factor: null }],
    });
    expect(tables.test_definitions[0]).toMatchObject({
      name: "Saut", articulation: "Genou", media_url: null, fill_mode: "coach", description: null,
      protocol: { text: "Sauter" }, kind: "custom", created_by: "c1", is_global: false,
    });
    expect(tables.test_variables[0]).toMatchObject({ key: "cm", test_definition_id: d.id });
  });

  it("mise à jour : variables retirées supprimées, les autres ajoutées ou modifiées par clé", async () => {
    const { db, tables } = fakeDb({
      test_definitions: [def("d", { name: "Ancien" })],
      test_variables: [variable("v1", "Garde", { key: "garde" }), variable("v2", "Retirée", { key: "retiree" })],
    });
    setDbForTests(db);
    const v = (key: string, label: string) => ({ key, label, unit: "cm", value_type: "number" as const, better_when: "higher" as const, extrap_metric: null, extrap_op: null, extrap_factor: null });
    await updateTestDefinition({
      id: "d", name: "Nouveau", category: null, articulation: null, media_url: null, fill_mode: "self", description: "", protocol: "",
      variables: [v("garde", "Gardée renommée"), v("neuve", "Neuve")],
    });
    expect(tables.test_definitions[0].name).toBe("Nouveau");
    expect(tables.test_variables.map((x) => [x.key, x.label]).sort()).toEqual([["garde", "Gardée renommée"], ["neuve", "Neuve"]]);
    expect(tables.test_variables.find((x) => x.key === "garde")!.id).toBe("v1");
  });
});

describe("résultats", () => {
  it("lectures : résultats et valeurs courantes de l'athlète ; une erreur lève", async () => {
    const { db } = fakeDb({
      athlete_test_results: [
        { id: "r1", athlete_id: "a", test_definition_id: "d", performed_at: "2026-10-01" },
        { id: "r2", athlete_id: "a", test_definition_id: "d", performed_at: "2026-11-01" },
        { id: "rb", athlete_id: "b", test_definition_id: "d", performed_at: "2026-11-01" },
      ],
      athlete_current_values: [{ athlete_id: "a", variable_id: "v", current_value: 3 }],
    });
    setDbForTests(db);
    expect((await listTestResults("a")).map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(await listCurrentValues("a")).toHaveLength(1);

    setDbForTests(fakeDb({}, { table: "athlete_test_results", op: "select" }).db);
    await expect(listTestResults("a")).rejects.toThrow("Résultats de tests non chargés");
  });

  it("enregistrement par la RPC atomique, valeurs non numériques écartées", async () => {
    const calls: Record<string, unknown>[] = [];
    const { db } = fakeDb({}, undefined, {
      save_athlete_test_result: (args) => (calls.push(args), args.p_result ?? "new-id"),
    });
    setDbForTests(db);
    const id = await saveTestResult("a", { test_definition_id: "d", performed_at: "2026-11-08", notes: "  ", values: { v1: 12, v2: NaN } });
    expect(id).toBe("new-id");
    expect(calls[0]).toEqual({
      p_athlete: "a", p_definition: "d", p_performed_at: "2026-11-08", p_notes: null, p_values: { v1: 12 }, p_result: null,
    });
    expect(await saveTestResult("a", { test_definition_id: "d", performed_at: "2026-11-09", notes: "ok", values: {}, resultId: "r1" })).toBe("r1");
    expect(calls[1]).toMatchObject({ p_result: "r1", p_notes: "ok" });
  });

  it("enregistrement refusé : lève", async () => {
    const { db } = fakeDb({}, { table: "save_athlete_test_result", op: "rpc" });
    setDbForTests(db);
    await expect(saveTestResult("a", { test_definition_id: "d", performed_at: "2026-11-08", notes: "", values: {}, resultId: "r" }))
      .rejects.toThrow("Résultat non modifié");
  });

  it("suppression", async () => {
    const { db, tables } = fakeDb({ athlete_test_results: [{ id: "r1", athlete_id: "a" }] });
    setDbForTests(db);
    await deleteTestResult("r1");
    expect(tables.athlete_test_results).toHaveLength(0);
  });
});

describe("séries par catégorie", () => {
  const defs = [{
    id: "d1", name: "Saut",
    test_variables: [{ id: "v1", key: "cm", label: "Distance", unit: "cm", better_when: "higher", extrap_metric: null, extrap_op: null, extrap_factor: null }],
  }];

  it("une série par test et variable, points chronologiques, valeurs numériques", () => {
    const s = buildCategorySeries(defs, [
      { test_definition_id: "d1", performed_at: "2026-11-01", athlete_test_values: [{ value: "210", variable_id: "v1" }, { value: 1, variable_id: "inconnue" }] },
      { test_definition_id: "d1", performed_at: "2026-09-01", athlete_test_values: [{ value: 200, variable_id: "v1" }] },
      { test_definition_id: "d1", performed_at: "2026-10-01", athlete_test_values: null },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ testName: "Saut", varLabel: "Distance", betterHigher: true });
    expect(s[0].points).toEqual([{ date: "2026-09-01", value: 200 }, { date: "2026-11-01", value: 210 }]);
  });

  it("lit les tests de la catégorie puis les résultats de l'athlète", async () => {
    const { db } = fakeDb({
      test_definitions: [{ ...defs[0], category: "explosivite" }, { id: "d2", name: "Autre", category: "force", test_variables: [] }],
      athlete_test_results: [
        { test_definition_id: "d1", athlete_id: "a", performed_at: "2026-11-01", athlete_test_values: [{ value: 210, variable_id: "v1" }] },
        { test_definition_id: "d1", athlete_id: "b", performed_at: "2026-11-01", athlete_test_values: [{ value: 999, variable_id: "v1" }] },
      ],
    });
    setDbForTests(db);
    const s = await getCategoryTestSeries("a", "explosivite");
    expect(s[0].points).toEqual([{ date: "2026-11-01", value: 210 }]);
    expect(await getCategoryTestSeries("a", "vitesse")).toEqual([]);
  });
});

describe("séances de test", () => {
  it("tiroir de saisie : séance + définition retrouvée par le titre (variables triées)", async () => {
    const { db } = fakeDb({
      test_sessions: [{ id: "s1", title: "Saut", type: "autre", date: "2026-11-08", completed: false, description: null, results_note: null, results_structured: null }],
      test_definitions: [
        def("perso", { name: "saut", created_at: "2025-01-01" }),
        def("global", { name: "Saut", is_global: true, test_variables: [variable("b", "B"), variable("a", "A")] }),
        def("long", { name: "Saut long", is_global: true }),
      ],
    });
    setDbForTests(db);
    const { session, definition } = await getTestSessionForFill("s1");
    expect(session?.title).toBe("Saut");
    expect(definition?.id).toBe("global");
    expect(definition?.test_variables.map((v) => v.label)).toEqual(["A", "B"]);
    expect(await getTestSessionForFill("inconnue")).toEqual({ session: null, definition: null });
  });

  it("liste des séances de test de l'athlète, par date croissante ; une erreur lève", async () => {
    const { db } = fakeDb({
      test_sessions: [
        { id: "s2", athlete_id: "a", type: "autre", title: "VMA", date: "2026-11-20", completed: null },
        { id: "s1", athlete_id: "a", type: "endurance", title: "Cooper", date: "2026-11-01", completed: true },
        { id: "x", athlete_id: "b", type: "autre", title: "X", date: "2026-11-01", completed: false },
      ],
    });
    setDbForTests(db);
    expect(await listTestSessions("a")).toEqual([
      { id: "s1", athlete_id: "a", type: "endurance", title: "Cooper", date: "2026-11-01", completed: true },
      { id: "s2", athlete_id: "a", type: "autre", title: "VMA", date: "2026-11-20", completed: false },
    ]);
    setDbForTests(fakeDb({}, { table: "test_sessions", op: "select" }).db);
    await expect(listTestSessions("a")).rejects.toThrow("Tests programmés non chargés");
  });

  it("l'athlète complète sa séance ; le coach note un test", async () => {
    const { db, tables } = fakeDb({ test_sessions: [{ id: "s1", completed: false }, { id: "s2", completed: true }] });
    setDbForTests(db);
    await completeTestSession("s1", { resultsNote: "Distance: 210 cm", resultsStructured: { variables: { cm: 210 } } });
    expect(tables.test_sessions[0]).toMatchObject({ completed: true, results_note: "Distance: 210 cm", results_structured: { variables: { cm: 210 } } });
    await fillCoachTestSession("s2", { cm: 3 });
    expect(tables.test_sessions[1]).toMatchObject({ completed: true, results_structured: { variables: { cm: 3 } } });
  });

  it("écriture refusée : lève", async () => {
    const { db } = fakeDb({ test_sessions: [{ id: "s1" }] }, { table: "test_sessions", op: "update" });
    setDbForTests(db);
    await expect(completeTestSession("s1", { resultsNote: null, resultsStructured: null })).rejects.toThrow("Test non enregistré");
  });
});

describe("file « à noter » du coach", () => {
  const coachDef = { id: "d", name: "Squat vidéo", test_variables: [variable("z", "Zone") as never, variable("a", "Amplitude") as never] };

  it("garde les séances d'un test coach sans valeur numérique", () => {
    const out = pendingCoachTests([
      { id: "s1", title: "squat vidéo", date: "2026-11-01", results_structured: { comment: "vu", variables: { a: null } } },
      { id: "s2", title: "Squat vidéo", date: "2026-10-01", results_structured: { variables: { a: "3" } } },
      { id: "s3", title: "Course", date: "2026-10-01", results_structured: null },
      { id: "s4", title: "Squat vidéo", date: "2026-09-01", results_structured: null },
    ], [coachDef]);
    expect(out.map((p) => p.sessionId)).toEqual(["s1", "s4"]);
    expect(out[0]).toMatchObject({ comment: "vu" });
    expect(out[0].variables.map((v) => v.label)).toEqual(["Amplitude", "Zone"]);
  });

  it("lit les séances complétées de l'athlète et les tests « rempli par le coach »", async () => {
    const { db } = fakeDb({
      test_sessions: [
        { id: "s1", athlete_id: "a", completed: true, title: "Squat vidéo", date: "2026-11-01", results_structured: null },
        { id: "s2", athlete_id: "a", completed: false, title: "Squat vidéo", date: "2026-11-02", results_structured: null },
      ],
      test_definitions: [{ ...coachDef, fill_mode: "coach" }, { id: "x", name: "Course", fill_mode: "self", test_variables: [] }],
    });
    setDbForTests(db);
    expect((await listPendingCoachTests("a")).map((p) => p.sessionId)).toEqual(["s1"]);
    expect(await listPendingCoachTests("b")).toEqual([]);
  });
});

describe("progression d'un macrocycle", () => {
  it("une série par test, dates dd/MM", async () => {
    expect(buildTestProgression([
      { test_date: "2026-10-05", value: "17.5", test: { name: "VMA" } },
      { test_date: "2026-11-02", value: 18, test: { name: "VMA" } },
      { test_date: "2026-11-02", value: 3, test: null },
    ])).toEqual([
      { name: "VMA", data: [{ date: "05/10", value: 17.5 }, { date: "02/11", value: 18 }] },
      { name: "Test", data: [{ date: "02/11", value: 3 }] },
    ]);
    setDbForTests(fakeDb({}, { table: "test_results", op: "select" }).db);
    await expect(getTestProgression("m")).rejects.toThrow("Progression des tests non chargée");
  });
});

describe("invalidation", () => {
  it("tests, planning, batterie HYROX et références de l'athlète ; pas ceux d'un autre", async () => {
    const qc = new QueryClient();
    const mine = [
      testKeys.results("a"), testKeys.currentValues("a"), testKeys.categorySeries("a", "force"), testKeys.pendingCoach("a"),
      testKeys.macrocycleProgression("m"), ["activePlan", "a"], ["cal", "a", "x", "y"], ["hyrox", "a", "battery-results"],
      ["references", "a", "active"], ["articularProfile", "a"], ["coachDashboard", "upcomingTests", "c", "2026-11-08"],
    ];
    const others = [testKeys.results("b"), ["activePlan", "b"], ["hyrox", "b", "battery-results"], testKeys.definitions("c")];
    for (const k of [...mine, ...others]) qc.setQueryData(k, 1);
    await invalidateTests(qc, "a");
    expect(mine.filter((k) => !qc.getQueryState(k)?.isInvalidated)).toEqual([]);
    expect(others.filter((k) => qc.getQueryState(k)?.isInvalidated)).toEqual([]);

    await invalidateTestDefinitions(qc);
    expect(qc.getQueryState(testKeys.definitions("c"))?.isInvalidated).toBe(true);
  });
});
