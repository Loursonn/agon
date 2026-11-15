import { describe, it, expect, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  deleteEntry, invalidateMedical, listEntries, listInjuryFollowups, medicalKeys, reportSessionPain, saveEntry,
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
    expect(qc.invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([medicalKeys.all("a")]);
    expect(medicalKeys.entries("a").slice(0, 2)).toEqual(medicalKeys.all("a"));
  });

  it("douleur de séance : une seule RPC, séance muscu ou énergie, libellés de zone", async () => {
    const calls: Record<string, unknown>[] = [];
    const { db } = fakeDb({}, undefined, {
      report_session_pain: (args) => (calls.push(args), [{ zone: "Genou", entry_id: "m1", created: true }]),
    });
    setDbForTests(db);
    expect(await reportSessionPain({ workoutLogId: "L1" }, { Genou: 6 }, "au squat")).toEqual([{ zone: "Genou", entry_id: "m1", created: true }]);
    await reportSessionPain({ energyAssignmentId: "E1" }, { Mollet: 4 }, null);
    expect(calls).toEqual([
      { p_workout_log: "L1", p_energy_assignment: undefined, p_levels: { Genou: 6 }, p_note: "au squat" },
      { p_workout_log: undefined, p_energy_assignment: "E1", p_levels: { Mollet: 4 }, p_note: undefined },
    ]);
  });

  it("suivis de blessure : athlète, jours et séances demandés seulement", async () => {
    setup({
      injury_followups: [
        { id: "f1", entry_id: "m1", athlete_id: "a", day: "2026-11-12", pain_level: 6, note: "x", workout_log_id: "L1", energy_assignment_id: null, created_at: "2026-11-12T18:00:00Z" },
        { id: "f2", entry_id: "m1", athlete_id: "a", day: "2026-11-20", pain_level: 4, note: null, workout_log_id: "L2", energy_assignment_id: null, created_at: "2026-11-20T18:00:00Z" },
        { id: "f3", entry_id: "m9", athlete_id: "b", day: "2026-11-12", pain_level: 2, note: null, workout_log_id: "L9", energy_assignment_id: null, created_at: "2026-11-12T18:00:00Z" },
      ],
    });
    expect((await listInjuryFollowups("a", { from: "2026-11-10", to: "2026-11-16" })).map((f) => f.id)).toEqual(["f1"]);
    expect((await listInjuryFollowups("a", { workoutLogIds: ["L2", "L9"] })).map((f) => f.id)).toEqual(["f2"]);
    expect(await listInjuryFollowups("a", { workoutLogIds: [] })).toEqual([]);
    // Base simulée sans jointure : pas de zone ni de nom de séance.
    expect((await listInjuryFollowups("a", { from: "2026-11-12", to: "2026-11-12" }))[0]).toMatchObject({ zone: null, session_name: null, pain_level: 6 });
  });
});
