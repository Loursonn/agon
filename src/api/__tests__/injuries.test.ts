import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  deleteEntry, invalidateMedical, listEntries, medicalKeys, saveEntry,
} from "@/api/injuries";
import type { MedicalEntryInput } from "@/features/shared/types/medical";

/** Base simulée + session et Storage minimalistes. */
function setup(tables: Record<string, Row[]> = {}, opts: { me?: string; storageFails?: boolean; failOn?: { table: string; op: string } } = {}) {
  const fake = fakeDb(tables, opts.failOn);
  const files = new Set<string>(["a/e1/f1.jpg"]);
  const err = opts.storageFails ? { message: "stockage indisponible" } : null;
  const storage = {
    from: () => ({
      upload: async (p: string) => (err ? { data: null, error: err } : (files.add(p), { data: { path: p }, error: null })),
      remove: async (ps: string[]) => (err ? { data: null, error: err } : (ps.forEach((p) => files.delete(p)), { data: [], error: null })),
      createSignedUrls: async (ps: string[]) => ({ data: ps.map((p) => ({ path: p, signedUrl: `https://signe/${p}` })), error: null }),
    }),
  };
  const auth = { getUser: async () => ({ data: { user: opts.me ? { id: opts.me } : null }, error: null }) };
  setDbForTests({ ...fake.db, auth, storage });
  return { tables: fake.tables, files };
}

const input: MedicalEntryInput = {
  title: "Genou", zone: "Genou G", date: "2026-11-01",
  status: "en_cours", notes: null, injury_type: null, mechanism: null, context: null, pain_level: 3,
  training_impact: "adapte", days_off: null, return_date: null,
};

describe("api/injuries", () => {
  afterEach(() => setDbForTests(null));

  it("declared_by suit qui saisit : athlète, coach ou staff ; jamais réécrit à la modification", async () => {
    const first = setup({ medical_entries: [] }, { me: "a" });
    await saveEntry("a", { input });
    const { tables } = setup(first.tables, { me: "coach" });
    await saveEntry("a", { input });
    await saveEntry("a", { input }, { asStaff: true });
    const rows = tables.medical_entries;
    expect(rows.map((r) => [r.declared_by, r.created_by])).toEqual([["athlete", "a"], ["coach", "coach"], ["staff", "coach"]]);
  });

  it("une modification ne touche pas declared_by", async () => {
    const t = { medical_entries: [{ id: "e1", athlete_id: "a", declared_by: "athlete", title: "x" }] };
    const { tables } = setup(t, { me: "coach" });
    await saveEntry("a", { id: "e1", input: { ...input, title: "Genou droit" } });
    expect(tables.medical_entries[0]).toMatchObject({ declared_by: "athlete", title: "Genou droit" });
  });

  it("listEntries ne lit que l'athlète demandé, et lève si la base refuse", async () => {
    setup({ medical_entries: [{ id: "e1", athlete_id: "a" }, { id: "e2", athlete_id: "b" }] });
    expect((await listEntries("a")).map((e) => e.id)).toEqual(["e1"]);
    setup({}, { failOn: { table: "medical_entries", op: "select" } });
    await expect(listEntries("a")).rejects.toThrow(/Lecture des blessures impossible/);
  });

  it("deleteEntry retire la ligne", async () => {
    const s = setup({ medical_entries: [{ id: "e1", athlete_id: "a" }] });
    await deleteEntry({ id: "e1" });
    expect(s.tables.medical_entries).toHaveLength(0);
  });

  it("toute saisie est une blessure, sans diagnostic, traitement ni « vu par »", async () => {
    const { tables } = setup({ medical_entries: [] }, { me: "a" });
    await saveEntry("a", { input: { ...input, diagnosis: "x", kind: "pathologie" } as never });
    // L'appelant ne peut pas changer le type ; la base vide aussi les colonnes de soins.
    expect(tables.medical_entries[0]).toMatchObject({ kind: "blessure" });
    expect(Object.keys(input)).not.toEqual(expect.arrayContaining(["diagnosis"]));
    expect(Object.keys(input)).not.toContain("treatment");
    expect(Object.keys(input)).not.toContain("diagnosed_by");
  });

  it("invalidateMedical : blessures, préfixe ['medical', athlète]", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateMedical(qc as never, "a");
    expect(qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([medicalKeys.entries("a")]);
    expect(medicalKeys.entries("a").slice(0, 2)).toEqual(medicalKeys.all("a"));
  });
});
