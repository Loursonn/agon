import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  createBankExercise, createExercise, createExercises, deleteExercise, exerciseKeys, getAthleteBankExercises,
  getExerciseBankMuscles, getExerciseBankPage, getExerciseLibrary, getExerciseVideos, invalidateExercises,
  mergeExercises, mergePatch, searchExercises, searchMergeCandidates, updateExercise,
} from "@/api/exercises";

const ex = (id: string, name: string, o: Record<string, unknown> = {}) => ({
  id, name, ex_type: null, youtube_id: null, target: null, target_2: null, secondary: null, ...o,
});

afterEach(() => setDbForTests(null));

describe("api/exercises", () => {
  it("searchExercises : nom (sans casse) et/ou type, trié, limité", async () => {
    setDbForTests(fakeDb({
      exercises: [
        ex("1", "Squat avant", { ex_type: "force" }),
        ex("2", "Back squat", { ex_type: "force" }),
        ex("3", "Squat jump", { ex_type: "pliometrie" }),
        ex("4", "Développé couché", { ex_type: "force" }),
      ],
    }).db);
    expect((await searchExercises({ search: " squat " })).map((e) => e.id)).toEqual(["2", "1", "3"]);
    expect((await searchExercises({ type: "force" })).map((e) => e.id)).toEqual(["2", "4", "1"]);
    expect((await searchExercises({ search: "squat", type: "force", limit: 1 })).map((e) => e.id)).toEqual(["2"]);
  });

  it("lève si la lecture échoue (jamais [] à la place d'une erreur)", async () => {
    setDbForTests(fakeDb({}, { table: "exercises", op: "select" }).db);
    await expect(searchExercises({ search: "x" })).rejects.toThrow(/Recherche d'exercices impossible/);
    await expect(getExerciseLibrary()).rejects.toThrow(/Bibliothèque/);
    await expect(getExerciseVideos(["1"])).rejects.toThrow(/Vidéos/);
    await expect(getExerciseBankMuscles()).rejects.toThrow(/Muscles/);
  });

  it("getExerciseLibrary lit toutes les pages de 1000", async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ex(`e${i}`, `Exo ${String(i).padStart(4, "0")}`));
    setDbForTests(fakeDb({ exercises: many }).db);
    const all = await getExerciseLibrary();
    expect(all).toHaveLength(1500);
    expect(new Set(all.map((e) => e.id)).size).toBe(1500);
  });

  it("getExerciseVideos : seulement les exercices demandés qui ont une vidéo", async () => {
    setDbForTests(fakeDb({
      exercises: [ex("1", "A", { youtube_id: "yt1" }), ex("2", "B"), ex("3", "C", { youtube_id: "yt3" })],
    }).db);
    expect(await getExerciseVideos(["1", "2"])).toEqual({ "1": "yt1" });
    expect(await getExerciseVideos([])).toEqual({});
  });

  it("getExerciseBankMuscles : 2 principaux + secondaires, par id", async () => {
    setDbForTests(fakeDb({
      exercises: [ex("1", "A", { target: "Pecs", target_2: "Triceps", secondary: ["Épaules"] }), ex("2", "B")],
    }).db);
    const m = await getExerciseBankMuscles();
    expect(m.get("1")).toEqual({ primary: ["Pecs", "Triceps"], secondary: ["Épaules"] });
    expect(m.get("2")).toEqual({ primary: [], secondary: [] });
  });

  it("createExercise : non vérifié, rattaché à son créateur ; nom vide refusé", async () => {
    const { db, tables } = fakeDb({ exercises: [] });
    setDbForTests(db);
    const created = await createExercise({ name: "  Fente bulgare ", createdBy: "coach" });
    expect(created.name).toBe("Fente bulgare");
    expect(tables.exercises[0]).toMatchObject({ name: "Fente bulgare", is_verified: false, created_by: "coach" });
    await expect(createExercise({ name: "  " })).rejects.toThrow(/nom manquant/);
  });

  it("createExercises : un lot rattaché au coach ; rien à créer = aucun appel", async () => {
    const { db, tables } = fakeDb({ exercises: [] });
    setDbForTests(db);
    expect(await createExercises([], "coach")).toEqual([]);
    const out = await createExercises(["A", "B"], "coach");
    expect(out.map((e) => e.name)).toEqual(["A", "B"]);
    expect(tables.exercises.every((e) => e.created_by === "coach" && e.is_verified === false)).toBe(true);
    setDbForTests(fakeDb({}, { table: "exercises", op: "insert" }).db);
    await expect(createExercises(["C"], "coach")).rejects.toThrow(/Création des exercices impossible/);
  });

  it("une seule invalidation pour toute la banque", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateExercises(qc as never);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: exerciseKeys.all });
    for (const k of [exerciseKeys.library, exerciseKeys.muscles, exerciseKeys.search("a", ""), exerciseKeys.videos("1")]) {
      expect(k[0]).toBe("exercises");
    }
  });

  it("getExerciseBankPage : filtres nom / muscles / matériel / niveau / type, page et total", async () => {
    setDbForTests(fakeDb({
      exercises: [
        ex("1", "Squat", { target: "Quads", equipment: "Barre", difficulty: "Avancé", ex_type: "muscu" }),
        ex("2", "Fente", { target: "Fessiers", secondary: ["Quads"], equipment: "Haltères", ex_type: "muscu" }),
        ex("3", "Leg curl", { target: "Ischios", target_2: "Mollets", equipment: "Machine" }),
        ex("4", "Front squat", { target: "Quads", equipment: "Barre", ex_type: "force" }),
        ex("5", "Pompe", { target: "Pecs" }),
      ],
    }).db);
    const all = await getExerciseBankPage({ page: 0, pageSize: 2 });
    expect(all.rows.map((e) => e.id)).toEqual(["2", "4"]);
    expect(all.total).toBe(5);
    expect((await getExerciseBankPage({ page: 2, pageSize: 2 })).rows.map((e) => e.id)).toEqual(["1"]);
    const quads = await getExerciseBankPage({ muscles: ["Quads"], page: 0, pageSize: 20 });
    expect(quads.rows.map((e) => e.id)).toEqual(["2", "4", "1"]);
    expect(quads.total).toBe(3);
    expect((await getExerciseBankPage({ muscles: ["Mollets", "Pecs"], page: 0, pageSize: 20 })).rows.map((e) => e.id)).toEqual(["3", "5"]);
    expect((await getExerciseBankPage({ search: "SQUAT", equipment: "Barre", type: "force", page: 0, pageSize: 20 })).rows.map((e) => e.id)).toEqual(["4"]);
    expect((await getExerciseBankPage({ difficulty: "Avancé", page: 0, pageSize: 20 })).total).toBe(1);
  });

  it("searchMergeCandidates : nom contient, l'exercice source exclu, 8 au plus", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ex(`d${i}`, `Rowing ${i}`));
    setDbForTests(fakeDb({ exercises: [ex("src", "Rowing barre"), ...many, ex("x", "Squat")] }).db);
    const out = await searchMergeCandidates("rowing", "src");
    expect(out).toHaveLength(8);
    expect(out.some((e) => e.id === "src" || e.id === "x")).toBe(false);
  });

  it("getAthleteBankExercises : toute la banque triée, au-delà de 1000 lignes", async () => {
    const many = Array.from({ length: 1200 }, (_, i) => ex(`e${i}`, `Exo ${String(i).padStart(4, "0")}`, { image_url: null }));
    setDbForTests(fakeDb({ exercises: many }).db);
    const all = await getAthleteBankExercises();
    expect(all).toHaveLength(1200);
    expect(all[0].name).toBe("Exo 0000");
  });

  it("les nouvelles lectures lèvent en cas d'erreur", async () => {
    setDbForTests(fakeDb({}, { table: "exercises", op: "select" }).db);
    await expect(getExerciseBankPage({ page: 0, pageSize: 20 })).rejects.toThrow(/Banque d'exercices non chargée/);
    await expect(searchMergeCandidates("a", "1")).rejects.toThrow(/doublons/);
    await expect(getAthleteBankExercises()).rejects.toThrow(/Banque d'exercices non chargée/);
  });

  it("createBankExercise / updateExercise / deleteExercise écrivent et lèvent en cas d'erreur", async () => {
    const { db, tables } = fakeDb({ exercises: [ex("1", "A")] });
    setDbForTests(db);
    await createBankExercise({ name: "Tirage", target: "Dos-GD", created_by: "coach", is_public: true, is_verified: false });
    expect(tables.exercises[1]).toMatchObject({ name: "Tirage", created_by: "coach", is_public: true, is_verified: false });
    await updateExercise("1", { ex_type: "force", youtube_id: "yt" });
    expect(tables.exercises[0]).toMatchObject({ ex_type: "force", youtube_id: "yt" });
    await deleteExercise("1");
    expect(tables.exercises.map((e) => e.name)).toEqual(["Tirage"]);
    for (const op of ["insert", "update", "delete"]) {
      setDbForTests(fakeDb({ exercises: [ex("1", "A")] }, { table: "exercises", op }).db);
      await expect(
        op === "insert" ? createBankExercise({ name: "B" }) : op === "update" ? updateExercise("1", { tips: "x" }) : deleteExercise("1"),
      ).rejects.toThrow(/impossible/);
    }
  });

  it("mergePatch : le conservé ne récupère que ce qui lui manque", () => {
    expect(mergePatch(
      { youtube_id: "k", image_url: null, instructions: "", tips: "garder" },
      { youtube_id: "d", image_url: "img", instructions: "faire", tips: "jeter" },
    )).toEqual({ image_url: "img", instructions: "faire" });
    expect(mergePatch({ youtube_id: "k" }, {})).toEqual({});
  });

  it("mergeExercises : complète le conservé puis supprime le doublon", async () => {
    const { db, tables } = fakeDb({
      exercises: [ex("keep", "Squat", { tips: "t" }), ex("dup", "squat", { youtube_id: "yt", tips: "autre" }), ex("z", "Z")],
    });
    setDbForTests(db);
    await mergeExercises("keep", "dup");
    expect(tables.exercises.map((e) => e.id)).toEqual(["keep", "z"]);
    expect(tables.exercises[0]).toMatchObject({ youtube_id: "yt", tips: "t" });
  });

  it("mergeExercises : rien n'est supprimé si la mise à jour échoue ou si le conservé est introuvable", async () => {
    const failing = fakeDb({ exercises: [ex("keep", "A"), ex("dup", "B", { youtube_id: "yt" })] }, { table: "exercises", op: "update" });
    setDbForTests(failing.db);
    await expect(mergeExercises("keep", "dup")).rejects.toThrow(/Modification/);
    expect(failing.tables.exercises.map((e) => e.id)).toEqual(["keep", "dup"]);

    const missing = fakeDb({ exercises: [ex("dup", "B")] });
    setDbForTests(missing.db);
    await expect(mergeExercises("keep", "dup")).rejects.toThrow(/introuvable/);
    expect(missing.tables.exercises).toHaveLength(1);
    await expect(mergeExercises("dup", "dup")).rejects.toThrow(/même exercice/);
  });
});
