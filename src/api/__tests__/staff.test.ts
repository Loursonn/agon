import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type FakeRpc, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  applyStaffToAll, createStaffInvitation, invalidateStaff, listAthleteStaff, listMyStaffLinks, listStaffInvitations,
  listStaffPlanning, listStaffWorkoutLogs, markStaffSeen, revokeStaffLink, staffKeys, staffSharingConsented,
  getStaffInvitationPreview, getStaffOccurrences, updateStaffLink,
} from "@/api/staff";

function setup(
  tables: Record<string, Row[]> = {},
  opts: { me?: string; failOn?: { table: string; op: string }; rpcs?: Record<string, FakeRpc> } = {},
) {
  const fake = fakeDb(tables, opts.failOn, opts.rpcs);
  const auth = { getUser: async () => ({ data: { user: opts.me ? { id: opts.me } : null }, error: null }) };
  setDbForTests({ ...fake.db, auth });
  return fake.tables;
}

describe("api/staff", () => {
  afterEach(() => setDbForTests(null));

  it("liens d'un athlète : grille normalisée, lève si la base refuse", async () => {
    setup({ athlete_staff: [
      { id: "l1", athlete_id: "a", status: "active", permissions: { seances: "read", inconnu: "write" } },
      { id: "l2", athlete_id: "b", status: "active", permissions: {} },
    ] });
    const links = await listAthleteStaff("a");
    expect(links.map((l) => l.id)).toEqual(["l1"]);
    expect(links[0].permissions.seances).toBe("read");
    expect("inconnu" in links[0].permissions).toBe(false);

    setup({}, { failOn: { table: "athlete_staff", op: "select" } });
    await expect(listAthleteStaff("a")).rejects.toThrow(/Lecture du staff impossible/);
  });

  it("invitations en attente : ni utilisées ni expirées", async () => {
    setup({ staff_invitations: [
      { id: "i1", athlete_id: "a", used_at: null, expires_at: "2026-12-01T00:00:00Z", permissions: {} },
      { id: "i2", athlete_id: "a", used_at: "2026-11-01", expires_at: "2026-12-01T00:00:00Z", permissions: {} },
      { id: "i3", athlete_id: "a", used_at: null, expires_at: "2026-11-01T00:00:00Z", permissions: {} },
    ] });
    const inv = await listStaffInvitations("a", new Date("2026-11-08T10:00:00Z"));
    expect(inv.map((i) => i.id)).toEqual(["i1"]);
  });

  it("createStaffInvitation : connecté obligatoire ; invité par moi, grille vide par défaut", async () => {
    setup({ staff_invitations: [] });
    await expect(createStaffInvitation({ athleteId: "a", profession: "kine" as never })).rejects.toThrow(/Non connecté/);
    const tables = setup({ staff_invitations: [] }, { me: "c" });
    await createStaffInvitation({ athleteId: "a", profession: "kine" as never });
    expect(tables.staff_invitations[0]).toMatchObject({
      athlete_id: "a", invited_by: "c", permissions: {}, can_edit_coach_content: false,
    });
  });

  it("grille, retrait et accusé de lecture", async () => {
    const tables = setup({ athlete_staff: [{ id: "l1", status: "active" }, { id: "l2", status: "active" }] });
    await updateStaffLink("l1", { canEditCoachContent: false });
    expect(tables.athlete_staff[0]).toMatchObject({ can_edit_coach_content: false });
    expect("permissions" in tables.athlete_staff[0]).toBe(false);
    await revokeStaffLink("l2");
    expect(tables.athlete_staff[1].status).toBe("revoked");
    await markStaffSeen(["l1"], "coach", new Date("2026-11-08T10:00:00Z"));
    expect(tables.athlete_staff[0].coach_notified_at).toBe("2026-11-08T10:00:00.000Z");
    expect(tables.athlete_staff[0].athlete_notified_at).toBeUndefined();
    await markStaffSeen([], "athlete"); // rien à faire, pas d'appel
  });

  it("RPC : accord staff, application à tous, aperçu d'invitation", async () => {
    setup({}, { rpcs: {
      staff_sharing_consented: (a) => a.athlete_uuid === "a",
      staff_apply_to_all: () => 3,
      get_staff_invitation: () => [{ athlete_name: "Léa", status: "valid" }],
    } });
    expect(await staffSharingConsented("a")).toBe(true);
    expect(await staffSharingConsented("b")).toBe(false);
    expect(await applyStaffToAll("l1")).toBe(3);
    expect(await getStaffInvitationPreview("tok")).toMatchObject({ athlete_name: "Léa" });

    setup({}, { failOn: { table: "staff_sharing_consented", op: "rpc" } });
    await expect(staffSharingConsented("a")).rejects.toThrow(/Lecture de l'accord staff impossible/);
  });

  it("espace pro : ses liens actifs seulement ; séances jusqu'à aujourd'hui ; planning trié", async () => {
    setup({
      athlete_staff: [
        { id: "l1", staff_id: "k", athlete_id: "a", status: "active", permissions: { seances: "read" } },
        { id: "l2", staff_id: "k", athlete_id: "b", status: "revoked", permissions: {} },
        { id: "l3", staff_id: "z", athlete_id: "a", status: "active", permissions: {} },
      ],
      workout_logs: [
        { id: "w1", athlete_id: "a", scheduled_date: "2026-11-08", status: "completed", session_id: "s" },
        { id: "w2", athlete_id: "a", scheduled_date: "2026-11-09", status: "planned", session_id: "s" },
        { id: "w3", athlete_id: "a", scheduled_date: "2026-11-01", status: "skipped", session_id: "s" },
      ],
      seasons: [{ id: "se", athlete_id: "a", name: "Saison", start_date: "2026-09-01", end_date: null }],
      macrocycles: [],
      cycles: [{ id: "cy", athlete_id: "a", name: "Bloc", start_date: "2026-11-01", end_date: "2026-11-28", objective: "Force" }],
      competitions: [{ id: "co", athlete_id: "a", name: "Hyrox", date: "2026-12-12", priority: "A", type: null, location: "Paris" }],
    });
    expect((await listMyStaffLinks("k")).map((l) => l.id)).toEqual(["l1"]);
    expect((await listStaffWorkoutLogs("a", "2026-11-08")).map((l) => l.id)).toEqual(["w1", "w3"]);
    const plan = await listStaffPlanning("a");
    expect(plan.map((p) => [p.kind, p.detail])).toEqual([["competition", "A · Paris"], ["cycle", "Force"], ["saison", null]]);
    const occ = await getStaffOccurrences("a");
    expect([...occ.keys()].sort()).toEqual(["w1", "w2"]);
  });

  it("planning : une table refusée fait échouer la lecture (jamais un planning partiel muet)", async () => {
    setup({}, { failOn: { table: "cycles", op: "select" } });
    await expect(listStaffPlanning("a")).rejects.toThrow(/Lecture du planning impossible/);
  });

  it("invalidateStaff : tout le préfixe staff (liens, vues pro, accord)", async () => {
    const qc = new QueryClient();
    const keys = [staffKeys.athlete("a"), staffKeys.logs("a"), staffKeys.consent("a"), ["autre"]];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateStaff(qc);
    expect(keys.map((k) => qc.getQueryState(k)?.isInvalidated)).toEqual([true, true, true, false]);
  });
});
