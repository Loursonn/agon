import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  createTrainingMethod, deleteTrainingMethod, filterTrainingMethods, invalidateMethods,
  listTrainingMethods, methodKeys, updateTrainingMethod, type TrainingMethod,
} from "@/api/methods";

const m = (id: string, o: Partial<TrainingMethod> = {}) => ({
  id, name: id, scope: "set", category: "force", config: {}, is_official: false, tags: [], created_at: "", updated_at: "", ...o,
});

afterEach(() => setDbForTests(null));

describe("api/methods", () => {
  it("listTrainingMethods : tags NULL lus comme [] ; lève en cas d'erreur", async () => {
    setDbForTests(fakeDb({ training_methods: [{ ...m("a"), tags: null }] }).db);
    expect((await listTrainingMethods())[0].tags).toEqual([]);
    setDbForTests(fakeDb({}, { table: "training_methods", op: "select" }).db);
    await expect(listTrainingMethods()).rejects.toThrow(/Méthodes non chargées/);
  });

  it("filterTrainingMethods : portée, catégorie, officielle, recherche nom ou tag", () => {
    const list = [
      m("Cluster", { tags: ["force"], is_official: true }) as TrainingMethod,
      m("Drop set", { scope: "exercise", category: "hypertrophie", tags: ["volume"] }) as TrainingMethod,
    ];
    expect(filterTrainingMethods(list).length).toBe(2);
    expect(filterTrainingMethods(list, { scope: "exercise" }).map((x) => x.name)).toEqual(["Drop set"]);
    expect(filterTrainingMethods(list, { is_official: true }).map((x) => x.name)).toEqual(["Cluster"]);
    expect(filterTrainingMethods(list, { search: "VOL" }).map((x) => x.name)).toEqual(["Drop set"]);
    expect(filterTrainingMethods(list, { category: "force", search: "clu" }).map((x) => x.name)).toEqual(["Cluster"]);
  });

  it("création (jamais officielle), mise à jour partielle, suppression", async () => {
    const { db, tables } = fakeDb({ training_methods: [] });
    setDbForTests(db);
    const created = await createTrainingMethod({
      name: "5x5", scope: "set", category: "force", config: {} as never, tags: ["base"], created_by: "coach",
    });
    expect(tables.training_methods[0]).toMatchObject({ name: "5x5", is_official: false, description: null, created_by: "coach" });
    const updated = await updateTrainingMethod({ id: created.id, name: "5x5 lourd" });
    expect(updated.name).toBe("5x5 lourd");
    expect(tables.training_methods[0].tags).toEqual(["base"]);
    await deleteTrainingMethod(created.id);
    expect(tables.training_methods).toEqual([]);
  });

  it("remonte les écritures refusées", async () => {
    setDbForTests(fakeDb({}, { table: "training_methods", op: "delete" }).db);
    await expect(deleteTrainingMethod("x")).rejects.toThrow(/Suppression de la méthode impossible/);
    setDbForTests(fakeDb({ training_methods: [] }).db);
    await expect(updateTrainingMethod({ id: "absente", name: "x" })).rejects.toThrow(/Mise à jour de la méthode impossible/);
  });

  it("invalidateMethods : un préfixe", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateMethods(qc as never);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: methodKeys.all });
    expect(methodKeys.list.slice(0, 1)).toEqual(methodKeys.all);
  });
});
