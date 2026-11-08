import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  addDocComment, assignDoc, deleteDoc, deleteDocComment, docsKeys, getAthleteDocs, getDocsByIds, invalidateDocs,
  listFamilyAssignments, listFamilyDocs, listSelfServiceDocs, replaceDocFile, setFamilyArchived,
  stripForeignPersonalFiches, syncEnergyAssignments, syncProgrammeAssignments, unassignDoc, unscheduleDoc, uploadDoc,
} from "@/api/docs";
import type { Doc } from "@/features/shared/types/fiches";
import type { ProgSession } from "@/features/coach/components/programmation/types";

function setup(
  tables: Record<string, Row[]> = {},
  opts: { failOn?: { table: string; op: string }; rpcs?: Record<string, FakeRpc>; storageFails?: boolean } = {},
) {
  const fake = fakeDb(tables, opts.failOn, opts.rpcs);
  const files = new Set<string>(["c/banque/old.pdf"]);
  const err = opts.storageFails ? { message: "stockage indisponible" } : null;
  const storage = {
    from: () => ({
      upload: async (p: string) => (err ? { data: null, error: err } : (files.add(p), { data: { path: p }, error: null })),
      remove: async (ps: string[]) => (err ? { data: null, error: err } : (ps.forEach((p) => files.delete(p)), { data: [], error: null })),
      createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://signe/${p}` }, error: null }),
    }),
  };
  setDbForTests({ ...fake.db, storage });
  return { tables: fake.tables, files };
}

const pdf = (name = "fiche.pdf") => new File(["%PDF"], name, { type: "application/pdf" });
const doc = (over: Partial<Doc>): Row => ({
  id: "d1", coach_id: "c", athlete_id: null, uploaded_by: "c", origin_id: null, variant_label: null, variant_order: 0,
  title: "Fiche", category: "autre", is_self_service: false, archived_at: null, created_at: "2026-11-01", file_path: null,
  ...over,
});

describe("api/docs", () => {
  afterEach(() => setDbForTests(null));

  it("uploadDoc : banque sans attribution ; fiche perso du coach → attribution 'manuel'", async () => {
    const s = setup({ docs: [], doc_assignments: [] });
    const bank = await uploadDoc({ file: pdf(), coachId: "c", athleteId: null, uploadedBy: "c", title: "  " });
    expect(bank).toMatchObject({ coach_id: "c", athlete_id: null, title: "Fiche", kind: "pdf", is_self_service: false });
    expect(String(bank.file_path)).toMatch(/^c\/banque\/.+\.pdf$/);
    expect(s.tables.doc_assignments).toHaveLength(0);

    const perso = await uploadDoc({ file: pdf(), coachId: "c", athleteId: "a", uploadedBy: "c", title: "Genou", isSelfService: true });
    expect(perso.is_self_service).toBe(false);
    expect(s.tables.doc_assignments).toEqual([expect.objectContaining({ doc_id: perso.id, athlete_id: "a", source: "manuel", assigned_by: "c" })]);

    // Ajout de l'athlète lui-même : pas d'attribution.
    await uploadDoc({ file: pdf(), coachId: "c", athleteId: "a", uploadedBy: "a", title: "Mon IRM" });
    expect(s.tables.doc_assignments).toHaveLength(1);
  });

  it("uploadDoc d'un pro (assignTo) : attribution refusée → fiche et fichier retirés", async () => {
    let s = setup({ docs: [], doc_assignments: [] });
    const d = await uploadDoc({ file: pdf(), coachId: "c", athleteId: null, uploadedBy: "kine", title: "Gainage", assignTo: "a" });
    expect(s.tables.doc_assignments).toEqual([expect.objectContaining({ doc_id: d.id, athlete_id: "a", assigned_by: "kine" })]);

    s = setup({ docs: [], doc_assignments: [] }, { failOn: { table: "doc_assignments", op: "insert" } });
    const before = s.files.size;
    await expect(uploadDoc({ file: pdf(), coachId: "c", athleteId: null, uploadedBy: "kine", title: "x", assignTo: "a" }))
      .rejects.toThrow(/Attribution de la fiche impossible/);
    expect(s.tables.docs).toHaveLength(0);
    expect(s.files.size).toBe(before);
  });

  it("uploadDoc : ligne refusée → fichier retiré ; Storage en panne → rien en base", async () => {
    let s = setup({}, { failOn: { table: "docs", op: "insert" } });
    const before = s.files.size;
    await expect(uploadDoc({ file: pdf(), coachId: "c", athleteId: null, uploadedBy: "c", title: "x" })).rejects.toThrow(/Enregistrement de la fiche/);
    expect(s.files.size).toBe(before);

    s = setup({ docs: [] }, { storageFails: true });
    await expect(uploadDoc({ file: pdf(), coachId: "c", athleteId: null, uploadedBy: "c", title: "x" })).rejects.toThrow(/Envoi du fichier/);
    expect(s.tables.docs).toHaveLength(0);
  });

  it("getAthleteDocs : regroupe les sources, sépare fiches perso et ajouts ; lève si la base refuse", async () => {
    const d1 = doc({ id: "d1" });
    setup({
      doc_assignments: [
        { id: "x1", doc_id: "d1", athlete_id: "a", source: "programme", coach_note: null, seen_at: null, docs: d1 },
        { id: "x2", doc_id: "d1", athlete_id: "a", source: "manuel", coach_note: "À lire", seen_at: "2026-11-02", docs: d1 },
        { id: "x3", doc_id: "dx", athlete_id: "a", source: "manuel", docs: null },
        { id: "x4", doc_id: "d1", athlete_id: "b", source: "manuel", docs: d1 },
      ],
      docs: [doc({ id: "p1", athlete_id: "a", uploaded_by: "c" }), doc({ id: "u1", athlete_id: "a", uploaded_by: "a" })],
    });
    const r = await getAthleteDocs("a");
    expect(r.assigned).toHaveLength(1);
    expect(r.assigned[0]).toMatchObject({ sources: ["programme", "manuel"], coachNote: "À lire", seenAt: "2026-11-02" });
    expect(r.personal.map((d) => d.id)).toEqual(["p1"]);
    expect(r.uploads.map((d) => d.id)).toEqual(["u1"]);

    setup({}, { failOn: { table: "doc_assignments", op: "select" } });
    await expect(getAthleteDocs("a")).rejects.toThrow(/Lecture des fiches attribuées impossible/);
  });

  it("familles : variantes, libre-service, attributions par famille, archivage de toute la famille", async () => {
    const s = setup({
      docs: [
        doc({ id: "o1", is_self_service: true, title: "A" }),
        doc({ id: "v1", origin_id: "o1", variant_label: "S2", variant_order: 1, title: "A" }),
        doc({ id: "o2", title: "B" }),
      ],
      doc_assignments: [{ id: "x1", doc_id: "v1", athlete_id: "a", source: "manuel" }],
    });
    expect((await listFamilyDocs("o1")).map((d) => d.id)).toEqual(["o1", "v1"]);
    expect((await listSelfServiceDocs("c")).map((f) => [f.origin.id, f.variants.map((v) => v.id)])).toEqual([["o1", ["v1"]]]);
    expect(await listFamilyAssignments("o1")).toEqual([expect.objectContaining({ id: "x1", doc_title: "A", variant_label: "S2" })]);
    expect(await listFamilyAssignments("zz")).toEqual([]);

    await setFamilyArchived("o1", true);
    expect(s.tables.docs.filter((d) => d.archived_at).map((d) => d.id)).toEqual(["o1", "v1"]);
    expect(await listSelfServiceDocs("c")).toEqual([]);
  });

  it("getDocsByIds ignore les ids illisibles ; vide sans requête", async () => {
    setup({ docs: [doc({ id: "d1" })] });
    expect(Object.keys(await getDocsByIds(["d1", "secret"]))).toEqual(["d1"]);
    expect(await getDocsByIds([])).toEqual({});
  });

  it("replaceDocFile : nouveau chemin sur la même ligne, ancien fichier retiré ; échec → nouveau fichier retiré", async () => {
    const d = doc({ id: "d1", file_path: "c/banque/old.pdf" }) as unknown as Doc;
    let s = setup({ docs: [d as never] });
    await replaceDocFile(d, pdf());
    expect(String(s.tables.docs[0].file_path)).toMatch(/^c\/banque\/d1-.+\.pdf$/);
    expect(s.files.has("c/banque/old.pdf")).toBe(false);
    expect(s.files.has(String(s.tables.docs[0].file_path))).toBe(true);

    s = setup({ docs: [d as never] }, { failOn: { table: "docs", op: "update" } });
    await expect(replaceDocFile(d, pdf())).rejects.toThrow(/Remplacement du fichier impossible/);
    expect([...s.files]).toEqual(["c/banque/old.pdf"]);
  });

  it("deleteDoc : fichier d'abord ; Storage en panne → la ligne reste", async () => {
    let s = setup({ docs: [doc({ id: "d1", file_path: "c/banque/old.pdf" })] });
    await deleteDoc({ id: "d1", file_path: "c/banque/old.pdf" });
    expect(s.tables.docs).toHaveLength(0);
    expect(s.files.size).toBe(0);

    s = setup({ docs: [doc({ id: "d1", file_path: "c/banque/old.pdf" })] }, { storageFails: true });
    await expect(deleteDoc({ id: "d1", file_path: "c/banque/old.pdf" })).rejects.toThrow(/Suppression du fichier impossible/);
    expect(s.tables.docs).toHaveLength(1);
  });

  it("attribution manuelle : upsert par (fiche, athlète, source) ; le retrait ne touche jamais la programmation", async () => {
    const s = setup({ doc_assignments: [{ id: "p", doc_id: "d1", athlete_id: "a", source: "programme" }] });
    await assignDoc({ docId: "d1", athleteId: "a", assignedBy: "c", coachNote: "" });
    await assignDoc({ docId: "d1", athleteId: "a", assignedBy: "c", coachNote: "Relis" });
    expect(s.tables.doc_assignments.map((r) => [r.source, r.coach_note ?? null])).toEqual([["programme", null], ["manuel", "Relis"]]);
    await unassignDoc("d1", "a");
    expect(s.tables.doc_assignments.map((r) => r.source)).toEqual(["programme"]);
  });

  it("synchro programme : séances + blocs (relus dans asp:prog si absents) → RPC ; synchro énergie", async () => {
    const calls: Record<string, unknown>[] = [];
    const rpcs = { sync_doc_assignments: (args: Record<string, unknown>) => (calls.push(args), null) };
    const prog = [
      { id: "s1", fiches: [{ doc_id: "d1" }], blocs: [{ fiches: [{ doc_id: "d2" }] }] },
      { id: "s2", fiches: [{ doc_id: "d1" }] },
    ];
    setup({ app_data: [{ athlete_id: "a", key: "asp:prog", value: prog }], workout_logs: [] }, { rpcs });
    await syncProgrammeAssignments("a");
    await syncProgrammeAssignments("a", [] as ProgSession[]);
    expect(calls.map((c) => [c.p_source, [...(c.p_doc_ids as string[])].sort()])).toEqual([["programme", ["d1", "d2"]], ["programme", []]]);

    calls.length = 0;
    setup({
      energy_session_assignments: [
        { athlete_id: "a", energy_sessions: { fiches: [{ doc_id: "e1" }] } },
        { athlete_id: "a", energy_sessions: null },
        { athlete_id: "b", energy_sessions: { fiches: [{ doc_id: "e2" }] } },
      ],
    }, { rpcs });
    await syncEnergyAssignments("a");
    expect(calls).toEqual([{ p_athlete: "a", p_source: "energie", p_doc_ids: ["e1"] }]);
  });

  it("synchro : un refus de la RPC lève (l'appelant décide de le taire)", async () => {
    setup({ workout_logs: [] }, { failOn: { table: "sync_doc_assignments", op: "rpc" } });
    await expect(syncProgrammeAssignments("a", [])).rejects.toThrow(/Synchronisation des fiches impossible/);
  });

  it("stripForeignPersonalFiches : retire les fiches perso d'un autre athlète, garde la banque", async () => {
    setup({ docs: [doc({ id: "bank" }), doc({ id: "persoB", athlete_id: "b" }), doc({ id: "persoA", athlete_id: "a" })] });
    const session = { id: "s", fiches: [{ doc_id: "bank" }, { doc_id: "persoB" }, { doc_id: "persoA" }] } as unknown as ProgSession;
    const { session: out, removed } = await stripForeignPersonalFiches(session, "a");
    expect(removed).toBe(1);
    expect((out as unknown as { fiches: { doc_id: string }[] }).fiches.map((f) => f.doc_id)).toEqual(["bank", "persoA"]);
  });

  it("commentaires : image retirée si la ligne échoue ; suppression image puis ligne", async () => {
    let s = setup({}, { failOn: { table: "doc_comments", op: "insert" } });
    const img = new File(["x"], "p.webp", { type: "image/webp" });
    const before = s.files.size;
    await expect(addDocComment({ docId: "d1", athleteId: "a", authorId: "a", coachId: "c", body: "x", image: img }))
      .rejects.toThrow(/Envoi du commentaire impossible/);
    expect(s.files.size).toBe(before);

    s = setup({ doc_comments: [] });
    await addDocComment({ docId: "d1", athleteId: "a", authorId: "a", coachId: "c", body: "  ok  ", image: img });
    const c = s.tables.doc_comments[0];
    expect(c).toMatchObject({ body: "ok", doc_id: "d1", athlete_id: "a" });
    expect(String(c.image_path)).toMatch(/^c\/athletes\/a\/comments\/.+\.webp$/);
    await deleteDocComment({ id: String(c.id), image_path: String(c.image_path) });
    expect(s.tables.doc_comments).toHaveLength(0);
    expect(s.files.has(String(c.image_path))).toBe(false);
  });

  it("unscheduleDoc : rien retiré (RLS) → message lisible", async () => {
    setup({ doc_schedule: [{ id: "s1" }] });
    await unscheduleDoc("s1");
    await expect(unscheduleDoc("s1")).rejects.toThrow(/Tu ne peux pas retirer cette fiche/);
  });

  it("invalidateDocs : toutes les fiches et le planning de l'athlète, jamais les URL signées", async () => {
    const qc = new QueryClient();
    const keys = [
      docsKeys.athlete("a"), docsKeys.bank("c"), docsKeys.comments("d1", "a"), docsKeys.signedUrl("p"),
      docsKeys.scheduleRange("a", "2026-11-01", "2026-11-07"), docsKeys.scheduleRange("b", "2026-11-01", "2026-11-07"),
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateDocs(qc, "a");
    expect(keys.map((k) => qc.getQueryState(k)?.isInvalidated)).toEqual([true, true, true, false, true, false]);
  });
});
