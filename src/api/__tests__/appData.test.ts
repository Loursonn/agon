import { describe, it, expect, afterEach } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import { readAppData, writeAppData } from "@/api/appData";

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

  it("lève si l'écriture échoue", async () => {
    setDbForTests(fakeDb({ app_data: [] }, { table: "app_data", op: "upsert" }).db);
    await expect(writeAppData("a", "asp:goals", {})).rejects.toThrow("Enregistrement de asp:goals impossible");
  });
});
