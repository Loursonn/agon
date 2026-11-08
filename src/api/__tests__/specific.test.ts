import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  createQuality, createSpecificBlock, createSport, deleteQuality, deleteSpecificBlock, deleteSport,
  invalidateSpecific, listPhysicalQualities, listSpecificBlocks, listSpecificSports, slugify,
  specificKeys, updateSpecificBlock,
} from "@/api/specific";

afterEach(() => setDbForTests(null));

describe("api/specific", () => {
  it("slugify : minuscules, sans accents, tirets", () => {
    expect(slugify("  Course à pied / Trail ")).toBe("course-a-pied-trail");
  });

  it("blocs : liste (récents d'abord), création, mise à jour datée, suppression", async () => {
    const { db, tables } = fakeDb({
      specific_blocks: [
        { id: "b1", coach_id: "c", name: "Ancien", created_at: "2026-01-01", updated_at: "2026-01-01", content: { title: "A" } },
        { id: "b2", coach_id: "c", name: "Récent", created_at: "2026-11-01", updated_at: "2026-11-01", content: { title: "B" } },
      ],
    });
    setDbForTests(db);
    expect((await listSpecificBlocks()).map((b) => b.id)).toEqual(["b2", "b1"]);
    const created = await createSpecificBlock({ coach_id: "c", name: "Nouveau", sport_id: null, quality_id: null, content: { title: "N" } });
    expect(created.name).toBe("Nouveau");
    const updated = await updateSpecificBlock({ id: "b1", name: "Renommé" });
    expect(updated.name).toBe("Renommé");
    expect(tables.specific_blocks.find((b) => b.id === "b1")!.updated_at).not.toBe("2026-01-01");
    await deleteSpecificBlock("b2");
    expect(tables.specific_blocks.map((b) => b.id)).not.toContain("b2");
  });

  it("sports et qualités : création avec slug, suppression", async () => {
    const { db, tables } = fakeDb({ specific_sports: [], physical_qualities: [] });
    setDbForTests(db);
    const s = await createSport({ name: " Aviron ", coachId: "c" });
    expect(tables.specific_sports[0]).toMatchObject({ name: "Aviron", slug: "aviron", coach_id: "c", color: null });
    const q = await createQuality({ name: "Endurance de force", coachId: "c" });
    expect(tables.physical_qualities[0]).toMatchObject({ slug: "endurance-de-force" });
    expect((await listSpecificSports()).length).toBe(1);
    expect((await listPhysicalQualities()).length).toBe(1);
    await deleteSport(s.id);
    await deleteQuality(q.id);
    expect(tables.specific_sports).toEqual([]);
    expect(tables.physical_qualities).toEqual([]);
  });

  it("lève si la lecture ou l'écriture échoue", async () => {
    setDbForTests(fakeDb({}, { table: "specific_blocks", op: "select" }).db);
    await expect(listSpecificBlocks()).rejects.toThrow(/Banque de blocs non chargée/);
    setDbForTests(fakeDb({}, { table: "specific_sports", op: "select" }).db);
    await expect(listSpecificSports()).rejects.toThrow(/Sports non chargés/);
    setDbForTests(fakeDb({}, { table: "physical_qualities", op: "insert" }).db);
    await expect(createQuality({ name: "X", coachId: "c" })).rejects.toThrow(/Ajout de la qualité impossible/);
    setDbForTests(fakeDb({ specific_blocks: [] }).db);
    await expect(updateSpecificBlock({ id: "absent", name: "x" })).rejects.toThrow(/Mise à jour du bloc impossible/);
  });

  it("invalidateSpecific : un préfixe pour blocs, sports, qualités", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateSpecific(qc as never);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: specificKeys.all });
    for (const k of [specificKeys.blocks, specificKeys.sports, specificKeys.qualities]) expect(k[0]).toBe("specific");
  });
});
