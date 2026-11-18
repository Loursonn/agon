import { describe, it, expect, afterEach } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { readAppData, readAppDataValue, writeAppData } from "@/api/appData";

describe("api/appData", () => {
  afterEach(() => setDbForTests(null));

  it("distingue clé absente et valeur présente", async () => {
    setDbForTests(fakeDb({ app_data: [{ athlete_id: "a", key: "asp:goals", value: { sessionsPerWeek: 4 } }] }).db);
    expect(await readAppData("a", "asp:goals")).toEqual({ found: true, value: { sessionsPerWeek: 4 } });
    expect(await readAppData("a", "asp:bw")).toEqual({ found: false, value: undefined });
  });

  it("lève si la lecture échoue (jamais une valeur par défaut)", async () => {
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "select" }).db);
    await expect(readAppData("a", "asp:goals")).rejects.toThrow("Lecture de asp:goals impossible");
  });

  it("écrit puis relit la valeur", async () => {
    const f = fakeDb({ app_data: [] });
    setDbForTests(f.db);
    await writeAppData("a", "asp:goals", { sessionsPerWeek: 5 });
    expect(await readAppData("a", "asp:goals")).toMatchObject({ found: true, value: { sessionsPerWeek: 5 } });
  });

  it("lectures de la même passe : une seule requête, chacune reçoit sa clé", async () => {
    const f = fakeDb({ app_data: [
      { athlete_id: "a", key: "asp:prog", value: [{ id: "s1" }] },
      { athlete_id: "a", key: "asp:goals", value: { sessionsPerWeek: 3 } },
      { athlete_id: "b", key: "asp:prog", value: [{ id: "autre" }] },
    ] });
    let selects = 0;
    const from = f.db.from.bind(f.db);
    setDbForTests({ ...f.db, from: (t: string) => { const q = from(t); if (t === "app_data") selects++; return q; } });
    const [prog, goals, absent, progB] = await Promise.all([
      readAppData("a", "asp:prog"), readAppData("a", "asp:goals"), readAppData("a", "asp:bw"), readAppData("b", "asp:prog"),
    ]);
    expect(prog).toEqual({ found: true, value: [{ id: "s1" }] });
    expect(goals).toEqual({ found: true, value: { sessionsPerWeek: 3 } });
    expect(absent).toEqual({ found: false, value: undefined });
    expect(progB).toEqual({ found: true, value: [{ id: "autre" }] });
    expect(selects).toBe(2); // une par athlète
  });

  it("lecture groupée en erreur : chaque clé lève avec son libellé", async () => {
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "select" }).db);
    const [a, b] = await Promise.allSettled([readAppData("a", "asp:prog"), readAppData("a", "asp:goals")]);
    expect(a.status === "rejected" && String(a.reason)).toContain("Lecture de asp:prog impossible");
    expect(b.status === "rejected" && String(b.reason)).toContain("Lecture de asp:goals impossible");
  });

  it("readAppDataValue : null si absente, libellé de l'appelant en erreur", async () => {
    setDbForTests(fakeDb({ app_data: [] }).db);
    expect(await readAppDataValue("a", "asp:prog", "Programmation non chargée")).toBeNull();
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "select" }).db);
    await expect(readAppDataValue("a", "asp:prog", "Programmation non chargée")).rejects.toThrow("Programmation non chargée");
  });

  it("lève si l'écriture échoue", async () => {
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "upsert" }).db);
    await expect(writeAppData("a", "asp:goals", {})).rejects.toThrow("Enregistrement de asp:goals impossible");
  });
});
