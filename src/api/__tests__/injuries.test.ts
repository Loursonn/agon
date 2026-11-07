import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  addAttachment, deleteAttachment, deleteEntry, getHistory, invalidateMedical, listEntries,
  medicalKeys, saveEntry, signedUrls, upsertHistory,
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
  kind: "blessure", title: "Genou", zone: "Genou G", date: "2026-11-01", diagnosis: null, treatment: null,
  status: "en_cours", notes: null, injury_type: null, mechanism: null, context: null, pain_level: 3,
  training_impact: "adapte", days_off: null, diagnosed_by: null, return_date: null,
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
    await expect(listEntries("a")).rejects.toThrow(/Lecture des antécédents impossible/);
  });

  it("deleteEntry retire les fichiers puis la ligne ; garde la ligne si les fichiers résistent", async () => {
    const entry = { id: "e1", medical_attachments: [{ file_path: "a/e1/f1.jpg" }] } as never;
    let s = setup({ medical_entries: [{ id: "e1", athlete_id: "a" }] });
    await deleteEntry(entry);
    expect(s.files.has("a/e1/f1.jpg")).toBe(false);
    expect(s.tables.medical_entries).toHaveLength(0);

    s = setup({ medical_entries: [{ id: "e1", athlete_id: "a" }] }, { storageFails: true });
    await expect(deleteEntry(entry)).rejects.toThrow(/Suppression des fichiers impossible/);
    expect(s.tables.medical_entries).toHaveLength(1);
  });

  it("addAttachment : chemin préfixé par l'athlète, refus de format et de poids, fichier retiré si la ligne échoue", async () => {
    let s = setup({ medical_attachments: [] }, { me: "a" });
    await addAttachment("a", "e1", new Blob(["x"], { type: "application/pdf" }), "compte-rendu.pdf");
    const row = s.tables.medical_attachments[0];
    expect(row).toMatchObject({ entry_id: "e1", athlete_id: "a", file_name: "compte-rendu.pdf", mime_type: "application/pdf", created_by: "a" });
    expect(String(row.file_path)).toMatch(/^a\/e1\/.+\.pdf$/);
    expect(s.files.has(String(row.file_path))).toBe(true);

    await expect(addAttachment("a", "e1", new Blob(["x"], { type: "text/plain" }), "x.txt")).rejects.toThrow(/Format non pris en charge/);
    const big = { type: "image/jpeg", size: 11 * 1024 * 1024 } as Blob;
    await expect(addAttachment("a", "e1", big, "x.jpg")).rejects.toThrow(/10 Mo max/);

    s = setup({}, { failOn: { table: "medical_attachments", op: "insert" } });
    const before = s.files.size;
    await expect(addAttachment("a", "e1", new Blob(["x"], { type: "image/png" }), "p.png")).rejects.toThrow(/Enregistrement du fichier impossible/);
    expect(s.files.size).toBe(before);
  });

  it("deleteAttachment et signedUrls", async () => {
    const s = setup({ medical_attachments: [{ id: "f1", file_path: "a/e1/f1.jpg" }] });
    expect(await signedUrls(["a/e1/f1.jpg"])).toEqual({ "a/e1/f1.jpg": "https://signe/a/e1/f1.jpg" });
    expect(await signedUrls([])).toEqual({});
    await deleteAttachment({ id: "f1", file_path: "a/e1/f1.jpg" });
    expect(s.tables.medical_attachments).toHaveLength(0);
    expect(s.files.size).toBe(0);
  });

  it("fiche d'antécédents : null si absente, upsert par athlète", async () => {
    const { tables } = setup({ medical_history: [] });
    expect(await getHistory("a")).toBeNull();
    const h = { conditions: "", allergies: "pollen", surgeries: [], past_injuries: [], current_treatments: "", medical_notes: "" };
    await upsertHistory("a", h);
    await upsertHistory("a", { ...h, allergies: "aucune" });
    expect(tables.medical_history).toHaveLength(1);
    expect(await getHistory("a")).toMatchObject({ allergies: "aucune" });
  });

  it("invalidateMedical : antécédents et fiche, préfixe ['medical', athlète]", async () => {
    const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    await invalidateMedical(qc as never, "a");
    expect(qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([medicalKeys.entries("a"), medicalKeys.history("a")]);
    expect(medicalKeys.signedUrls("a", ["p"]).slice(0, 2)).toEqual(medicalKeys.all("a"));
  });
});
