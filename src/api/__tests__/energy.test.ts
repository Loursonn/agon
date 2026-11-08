import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { ApiError, setDbForTests } from "@/api/client";
import {
  assignEnergySession, completeEnergyAssignment, createEnergySession, deleteEnergyAssignment,
  deleteEnergySession, energyKeys, getEnergyAssignment, getEnergySession, invalidateEnergy,
  isEnergyNotFound, listEnergyAssignments, listEnergySessions, moveEnergyAssignment,
  reopenEnergyAssignment, setEnergyRpe, setEnergySessionVerified, updateEnergyAssignment,
  updateEnergySession,
} from "@/api/energy";
import type { CreateEnergySessionInput, EnergyStep } from "@/types/energy";

afterEach(() => setDbForTests(null));

const esa = (id: string, o: Record<string, unknown> = {}) => ({
  id, athlete_id: "a", energy_session_id: "s1", scheduled_date: "2026-11-10",
  status: "planned", block_logs: {}, rpe_score: null, ...o,
});

const steps: EnergyStep[] = [
  { type: "interval", id: "w", role: "work", duration: { kind: "time", value: 300 }, target: { kind: "none" } },
  { type: "interval", id: "d", role: "work", duration: { kind: "distance", value: 1000 }, target: { kind: "none" } },
];

describe("séances programmées : lectures", () => {
  it("filtres, tri, numeric converti, jour ISO, blocs toujours objet", async () => {
    const { db } = fakeDb({
      energy_session_assignments: [
        esa("1", { scheduled_date: "2026-11-01", status: "completed", distance_km: "8.50", rpe_score: 7, block_logs: null }),
        esa("2", { scheduled_date: "2026-11-03T00:00:00", status: "planned" }),
        esa("3", { scheduled_date: "2026-11-20", status: "completed" }),
        esa("4", { athlete_id: "b", status: "completed" }),
      ],
    });
    setDbForTests(db);
    const rows = await listEnergyAssignments({ athleteIds: ["a"], from: "2026-11-01", to: "2026-11-15", ascending: false });
    expect(rows.map((r) => r.id)).toEqual(["2", "1"]);
    expect(rows[0].scheduled_date).toBe("2026-11-03");
    expect(rows[1].distance_km).toBe(8.5);
    expect(rows[1].block_logs).toEqual({});
    expect((await listEnergyAssignments({ athleteIds: ["a", "b"], statuses: ["completed"] })).map((r) => r.id)).toEqual(["1", "4", "3"]);
    expect(await listEnergyAssignments({ athleteIds: [] })).toEqual([]);
    expect(await getEnergyAssignment("absent")).toBeNull();
  });

  it("une lecture qui échoue lève (jamais de liste vide silencieuse)", async () => {
    const { db } = fakeDb({ energy_session_assignments: [esa("1")] }, { table: "energy_session_assignments", op: "select" });
    setDbForTests(db);
    await expect(listEnergyAssignments({ athleteIds: ["a"] })).rejects.toThrow(/Lecture des séances énergie impossible/);
  });
});

describe("séances programmées : planification", () => {
  it("programmer, déplacer, supprimer", async () => {
    const { db, tables } = fakeDb({ energy_session_assignments: [] });
    setDbForTests(db);
    const created = await assignEnergySession({ athlete_id: "a", energy_session_id: "s1", scheduled_date: "2026-11-12", status: "planned" });
    expect(tables.energy_session_assignments).toHaveLength(1);
    const moved = await moveEnergyAssignment(created.id, "2026-11-13");
    expect(moved.scheduled_date).toBe("2026-11-13");
    await deleteEnergyAssignment(created.id);
    expect(tables.energy_session_assignments).toHaveLength(0);
  });

  it("modifier une séance disparue lève au lieu d'un faux succès", async () => {
    const { db } = fakeDb({ energy_session_assignments: [] });
    setDbForTests(db);
    const err = await updateEnergyAssignment("absent", { status: "skipped" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isEnergyNotFound(err)).toBe(true);
  });
});

describe("séances programmées : saisie de l'athlète (RPC)", () => {
  function withRpcs() {
    const calls: Record<string, unknown>[] = [];
    const find = (tables: Record<string, Row[]>, id: unknown) => {
      const row = tables.energy_session_assignments.find((r) => r.id === id);
      if (!row) throw new Error("Séance introuvable");
      return row;
    };
    const fake = fakeDb({ energy_session_assignments: [esa("e1", { block_logs: { b1: { done: true } } })] }, undefined, {
      complete_energy_assignment: (args, tables) => {
        calls.push({ fn: "complete", ...args });
        const row = find(tables, args.p_assignment);
        Object.assign(row, {
          status: "completed",
          block_logs: { ...(row.block_logs as object), ...((args.p_block_logs as object) ?? {}) },
          rpe_score: args.p_rpe ?? row.rpe_score,
          distance_km: args.p_activity_type ? args.p_distance_km : row.distance_km,
          activity_type: args.p_activity_type ?? row.activity_type,
        });
        return row;
      },
      reopen_energy_assignment: (args, tables) => {
        calls.push({ fn: "reopen", ...args });
        return Object.assign(find(tables, args.p_assignment), { status: "planned", block_logs: {}, rpe_score: null, distance_km: null, activity_type: null });
      },
      set_energy_rpe: (args, tables) => {
        calls.push({ fn: "rpe", ...args });
        return Object.assign(find(tables, args.p_assignment), { rpe_score: args.p_rpe });
      },
    });
    setDbForTests(fake.db);
    return { ...fake, calls };
  }

  it("valider : un seul appel, champs vides envoyés comme NULL (rien n'est effacé)", async () => {
    const { calls } = withRpcs();
    const r = await completeEnergyAssignment("e1", {
      block_logs: { b2: { done: true } }, notes: "", activity_url: "  ", actual_duration_min: 42,
      activity_type: "course", distance_km: 8.5, rpe_score: 7,
    });
    expect(calls).toEqual([{
      fn: "complete", p_assignment: "e1", p_block_logs: { b2: { done: true } }, p_notes: null,
      p_duration_min: 42, p_activity_url: null, p_activity_type: "course", p_distance_km: 8.5, p_rpe: 7,
    }]);
    expect(r.status).toBe("completed");
    expect(r.block_logs).toEqual({ b1: { done: true }, b2: { done: true } });
    expect(r.rpe_score).toBe(7);
  });

  it("réouvrir puis noter", async () => {
    const { calls } = withRpcs();
    await completeEnergyAssignment("e1", { activity_type: "course", distance_km: 5 });
    const r = await reopenEnergyAssignment("e1");
    expect(r).toMatchObject({ status: "planned", block_logs: {}, rpe_score: null, distance_km: null });
    expect((await setEnergyRpe("e1", 6)).rpe_score).toBe(6);
    expect(calls.map((c) => c.fn)).toEqual(["complete", "reopen", "rpe"]);
  });

  it("une RPC en erreur lève une erreur lisible", async () => {
    withRpcs();
    await expect(completeEnergyAssignment("absent")).rejects.toThrow(/Validation de la séance impossible : Séance introuvable/);
  });

  it("une RPC sans réponse lève (pas de faux succès)", async () => {
    const { db } = fakeDb({ energy_session_assignments: [] });
    setDbForTests(db);
    await expect(setEnergyRpe("e1", 5)).rejects.toThrow(/Enregistrement du RPE impossible/);
  });
});

describe("bibliothèque", () => {
  const input = (o: Partial<CreateEnergySessionInput> = {}): CreateEnergySessionInput => ({
    name: "VMA 5x1000", session_kind: "vo2", structure_type: "fractionne", intervals: steps, created_by: "c", ...o,
  });

  it("créer calcule les totaux ; modifier les intervalles les recalcule", async () => {
    const { db, tables } = fakeDb({ energy_sessions: [] });
    setDbForTests(db);
    const s = await createEnergySession(input());
    expect(tables.energy_sessions[0]).toMatchObject({ total_duration_s: expect.any(Number), total_distance_m: 1000 });
    await updateEnergySession(s.id, { intervals: [steps[0]] });
    expect(tables.energy_sessions[0].total_distance_m).toBe(0);
    await updateEnergySession(s.id, { name: "Autre nom" });
    expect(tables.energy_sessions[0]).toMatchObject({ name: "Autre nom", total_distance_m: 0 });
  });

  it("liste : archivées exclues, filtres, recherche sans casse", async () => {
    const { db } = fakeDb({
      energy_sessions: [
        { id: "1", name: "VMA courte", session_kind: "vo2", created_by: "c", athlete_id: null, created_at: "2026-11-01" },
        { id: "2", name: "Seuil", session_kind: "seuil", created_by: "c", athlete_id: null, created_at: "2026-11-02" },
        { id: "3", name: "vma longue", session_kind: "vo2", created_by: "c", athlete_id: "a", created_at: "2026-11-03" },
        { id: "4", name: "VMA archivée", session_kind: "vo2", created_by: "c", athlete_id: null, archived_at: "2026-11-04", created_at: "2026-11-04" },
      ],
    });
    setDbForTests(db);
    expect((await listEnergySessions()).map((s) => s.id)).toEqual(["3", "2", "1"]);
    expect((await listEnergySessions({ search: "vma" })).map((s) => s.id)).toEqual(["3", "1"]);
    expect((await listEnergySessions({ search: "vma", bank_only: true })).map((s) => s.id)).toEqual(["1"]);
    expect((await listEnergySessions({ session_kind: "seuil" })).map((s) => s.id)).toEqual(["2"]);
    expect(await getEnergySession("absent")).toBeNull();
  });

  it("vérifier une séance disparue lève ; supprimer renvoie le verdict de la RPC", async () => {
    const { db } = fakeDb({ energy_sessions: [] }, undefined, { delete_energy_session: () => "archived" });
    setDbForTests(db);
    await expect(setEnergySessionVerified("absent", true)).rejects.toThrow(/Vérification de la séance impossible/);
    expect(await deleteEnergySession("s1")).toBe("archived");
  });
});

describe("invalidateEnergy", () => {
  function cache() {
    const qc = new QueryClient();
    const keys: unknown[][] = [
      [...energyKeys.assignments("a")],
      [...energyKeys.assignments("a", { from: "2026-11-01", to: "2026-11-07" })],
      [...energyKeys.assignments("b")],
      [...energyKeys.library("c")],
      [...energyKeys.session("a", "s1")],
      ["cal", "a", "range", "2026-11-01", "2026-11-30"],
      ["weeklyRetours", "a", "2026-11-02"],
      ["monthlyRetours", "a", "2026-11"],
      ["micro-stats", "a", "2026-11-02", "2026-11-08"],
      ["runningVolume", "a", "2026-10-01"],
      ["activePlan", "a", 0],
      ["energy-sessions"],
      ["wellness", "a"],
    ];
    for (const k of keys) qc.setQueryData(k, 1);
    const stale = () => qc.getQueryCache().findAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey);
    return { qc, stale };
  }

  it("avec athlète : tout ce qui affiche ses séances énergie, rien d'autre", async () => {
    const { qc, stale } = cache();
    await invalidateEnergy(qc, "a");
    expect(stale()).toEqual(expect.arrayContaining([
      ["energy", "a", "assignments"], ["energy", "a", "session", "s1"], ["cal", "a", "range", "2026-11-01", "2026-11-30"],
      ["weeklyRetours", "a", "2026-11-02"], ["monthlyRetours", "a", "2026-11"], ["micro-stats", "a", "2026-11-02", "2026-11-08"],
      ["runningVolume", "a", "2026-10-01"], ["activePlan", "a", 0],
    ]));
    expect(stale()).toHaveLength(9);
    expect(stale()).not.toContainEqual(["energy", "b", "assignments"]);
    expect(stale()).not.toContainEqual(["wellness", "a"]);
    expect(stale()).not.toContainEqual(["energy", "c", "library", {}]);
  });

  it("sans athlète (bibliothèque modifiée) : bibliothèque et séances de tous", async () => {
    const { qc, stale } = cache();
    await invalidateEnergy(qc, null);
    expect(stale()).toContainEqual(["energy", "c", "library", {}]);
    expect(stale()).toContainEqual(["energy", "b", "assignments"]);
    expect(stale()).toContainEqual(["energy-sessions"]);
    expect(stale()).not.toContainEqual(["wellness", "a"]);
  });
});
