import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  CoachApiError, DraftAlreadyDecided, addCoCoach, addSelfAsCoCoach, callCoachApi, coachKeys, createCoachApiKey,
  draftTargetHash, getAthleteCoaches, getCoachBooking, invalidateCoachApiDrafts, listDraftHistory,
  listPendingDrafts, listUpcomingTestSessions, rejectDraft, revokeCoachApiKey, unlinkAthlete,
} from "@/api/coaches";
import { sha256Hex } from "@/lib/coachApiKey";

function setup(
  tables: Record<string, Row[]> = {},
  opts: {
    failOn?: { table: string; op: string };
    rpcs?: Record<string, FakeRpc>;
    invoke?: (path: string, o: { body: unknown }) => { data: unknown; error: unknown };
  } = {},
) {
  const fake = fakeDb(tables, opts.failOn, opts.rpcs);
  const functions = { invoke: async (p: string, o: { body: unknown }) => (opts.invoke ?? (() => ({ data: null, error: null })))(p, o) };
  setDbForTests({ ...fake.db, functions });
  return fake.tables;
}

describe("api/coaches", () => {
  afterEach(() => setDbForTests(null));

  it("référent et co-coach avec leurs noms ; athlète sans coach", async () => {
    setup({
      profiles: [
        { id: "a", coach_id: "c1" }, { id: "c1", full_name: "Hugo" }, { id: "c2", full_name: null }, { id: "solo", coach_id: null },
      ],
      athlete_co_coaches: [{ athlete_id: "a", co_coach_id: "c2", added_by_role: "athlete", created_at: "2026-11-02" }],
    });
    expect(await getAthleteCoaches("a")).toEqual({
      referent: { id: "c1", full_name: "Hugo" },
      coCoach: { id: "c2", full_name: "Coach", added_by_role: "athlete", created_at: "2026-11-02" },
    });
    expect(await getAthleteCoaches("solo")).toEqual({ referent: null, coCoach: null });
  });

  it("profil illisible → lève (jamais un « pas de coach » muet)", async () => {
    setup({ profiles: [{ id: "a", coach_id: "c1" }], athlete_co_coaches: [] }, { failOn: { table: "profiles", op: "select" } });
    await expect(getAthleteCoaches("a")).rejects.toThrow(/Lecture du coach impossible/);
  });

  it("refus des RPC co-coach : message de la base sans le préfixe technique", async () => {
    setup({}, { rpcs: { add_co_coach: () => { throw new Error("ERROR: Code coach inconnu"); } } });
    await expect(addCoCoach("a", " X ")).rejects.toThrow(/^Code coach inconnu$/);
  });

  it("addSelfAsCoCoach : n'ajoute pas deux fois ; retire l'invitation staff ouverte", async () => {
    const calls: unknown[] = [];
    const rpcs = { add_co_coach: (a: Record<string, unknown>) => (calls.push(a), { co_coach_id: "me" }) };
    let tables = setup({ athlete_co_coaches: [], staff_invitations: [{ id: "i", token: "t", athlete_id: "me" }] }, { rpcs });
    await addSelfAsCoCoach("me", "CODE", "t");
    expect(calls).toEqual([{ p_athlete: "me", p_coach_code: "CODE" }]);
    expect(tables.staff_invitations).toHaveLength(0);

    calls.length = 0;
    tables = setup({ athlete_co_coaches: [{ athlete_id: "me", co_coach_id: "me" }] }, { rpcs });
    await addSelfAsCoCoach("me", "CODE");
    expect(calls).toHaveLength(0);
  });

  it("unlinkAthlete : l'échec de la RPC remonte (avant : « Athlète retiré » quand même)", async () => {
    setup({}, { failOn: { table: "unlink_athlete", op: "rpc" } });
    await expect(unlinkAthlete("a")).rejects.toThrow(/Retrait de l'athlète impossible/);
  });

  it("lien de réservation : URL re-validée, nom complet", async () => {
    setup({ profiles: [
      { id: "c", first_name: "Agon", last_name: "Démo", full_name: "x", booking_url: "https://calendly.com/agon/point" },
      { id: "bad", first_name: null, last_name: null, full_name: "Bad", booking_url: "https://evil.example/x" },
    ] });
    const ok = await getCoachBooking("c");
    expect(ok.coachName).toBe("Agon Démo");
    expect(ok.bookingUrl).toMatch(/^https:\/\/calendly\.com\/agon\/point/);
    expect(await getCoachBooking("bad")).toEqual({ bookingUrl: null, coachName: "Bad" });
    expect(await getCoachBooking("absent")).toEqual({ bookingUrl: null, coachName: "Coach" });
  });

  it("tests à venir : non terminés, à partir d'aujourd'hui ; aucun athlète → aucune requête", async () => {
    setup({ test_sessions: [
      { id: "t1", athlete_id: "a", title: "VMA", date: "2026-11-10", completed: false },
      { id: "t2", athlete_id: "a", title: "Passé", date: "2026-11-01", completed: false },
      { id: "t3", athlete_id: "a", title: "Fait", date: "2026-11-12", completed: true },
      { id: "t4", athlete_id: "x", title: "Autre", date: "2026-11-12", completed: false },
    ] });
    expect((await listUpcomingTestSessions(["a"], "2026-11-08")).map((t) => t.id)).toEqual(["t1"]);
    expect(await listUpcomingTestSessions([], "2026-11-08")).toEqual([]);
  });

  it("clé API : seul le hash est stocké ; révocation idempotente", async () => {
    const tables = setup({ coach_api_keys: [] });
    const key = await createCoachApiKey("c", "  Claude  ");
    const row = tables.coach_api_keys[0];
    expect(row).toMatchObject({ coach_id: "c", name: "Claude", key_hash: await sha256Hex(key) });
    expect(JSON.stringify(row)).not.toContain(key);
    await revokeCoachApiKey(String(row.id));
    const at = tables.coach_api_keys[0].revoked_at;
    await revokeCoachApiKey(String(row.id));
    expect(tables.coach_api_keys[0].revoked_at).toBe(at);
  });

  it("propositions : en attente, historique 30 j hors axes ; écarter une proposition déjà décidée", async () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    setup({ coach_api_drafts: [
      { id: "p", athlete_id: "a", status: "pending", kind: "programme" },
      { id: "h1", athlete_id: "a", status: "applied", kind: "programme", decided_at: "2026-11-01T00:00:00Z" },
      { id: "h2", athlete_id: "a", status: "applied", kind: "axe", decided_at: "2026-11-01T00:00:00Z" },
      { id: "h3", athlete_id: "a", status: "undone", kind: "objectifs", decided_at: "2026-09-01T00:00:00Z" },
    ] });
    expect((await listPendingDrafts("a")).map((d) => d.id)).toEqual(["p"]);
    expect((await listDraftHistory("a", now)).map((d) => d.id)).toEqual(["h1"]);
    await rejectDraft("p");
    await expect(rejectDraft("p")).rejects.toBeInstanceOf(DraftAlreadyDecided);
  });

  it("empreinte de la cible : même calcul que l'Edge Function, null si absente", async () => {
    setup({ app_data: [{ athlete_id: "a", key: "asp:goals", value: { poids: 70 } }] });
    expect(await draftTargetHash("a", "asp:goals")).toBe(await sha256Hex(JSON.stringify({ poids: 70 })));
    expect(await draftTargetHash("a", "asp:prog")).toBe(await sha256Hex("null"));
  });

  it("callCoachApi : erreur de l'Edge Function → code et phrase lisibles", async () => {
    const ctx = new Response(JSON.stringify({ error: "modifie_depuis", message: "Le programme a changé." }));
    setup({}, { invoke: () => ({ data: null, error: { message: "x", context: ctx } }) });
    const e = (await callCoachApi("drafts/1/annuler").catch((x: unknown) => x)) as CoachApiError;
    expect(e).toBeInstanceOf(CoachApiError);
    expect([e.code, e.message]).toEqual(["modifie_depuis", "Le programme a changé."]);

    setup({}, { invoke: (p, o) => ({ data: { p, body: o.body }, error: null }) });
    expect(await callCoachApi("drafts/1/appliquer")).toEqual({ p: "coach-api/drafts/1/appliquer", body: {} });
  });

  it("invalidateCoachApiDrafts : en attente, historique et cible de l'athlète seulement", async () => {
    const qc = new QueryClient();
    const keys = [coachKeys.apiDrafts("a"), coachKeys.apiHistory("a"), coachKeys.draftTarget("a", "asp:prog"), coachKeys.apiDrafts("b")];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateCoachApiDrafts(qc, "a");
    expect(keys.map((k) => qc.getQueryState(k)?.isInvalidated)).toEqual([true, true, true, false]);
  });
});
