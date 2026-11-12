/**
 * Séance libre démarrée sans réseau, de bout en bout : vraie file
 * (`createWriteQueue`), vrais exécutants (`EXECUTORS` → `src/api/workouts`),
 * vraie suite (`workoutPlanCascade`), base simulée (`fakeDb`) avec les RPC
 * de séance aux mêmes règles que le SQL.
 *
 * Garanties vérifiées : envoi dans l'ordre (création avant les saisies), rejeu
 * sans doublon (réponse perdue, onglet fermé, double appui), séance déplacée
 * ou place déjà prise côté serveur, création refusée, brouillon local gardé.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { mergeEntries } from "@shared/domain/athleteMods";
import { ApiError, setDbForTests } from "@/api/client";
import { planWorkout } from "@/api/workouts";
import { loadDraft, saveDraft, workoutDraftKey } from "@/lib/localDraft";
import {
  EXECUTORS, markSentDraft, mergeWriteArgs, prepareWrite, resolveWorkoutId, workoutPlanCascade,
  type WriteArgs, type WriteKind,
} from "../writes";
import { createWriteQueue, type WriteOp, type WriteQueueStore } from "../writeQueue";

const ATHLETE = "a";
const LOCAL = "11111111-1111-4111-8111-111111111111";
const DAY = "2026-11-12";
const plan: WriteArgs["workout.plan"] = {
  athleteId: ATHLETE, logId: LOCAL, coachId: "c", sessionId: "S1", sessionName: "Haut du corps", date: DAY,
};
const sets1 = { sessionSets: { e1: [{ done: true, kg: 60, reps: 8 }] } };
const sets2 = { sessionSets: { e1: [{ done: true, kg: 60, reps: 8 }, { done: true, kg: 62.5, reps: 6 }] } };

/** RPC de séance simulées : mêmes règles que 20261108100000_workout_rpcs.sql. */
function serverDb(rows: Row[] = []) {
  const find = (a: Record<string, unknown>, t: Record<string, Row[]>) => {
    const r = t.workout_logs.find((x) => x.id === a.p_log);
    if (!r) throw new Error("Séance introuvable");
    return r;
  };
  return fakeDb({ workout_logs: rows }, undefined, {
    patch_workout_entries: (a, t) => {
      const r = find(a, t);
      r.athlete_modifications = mergeEntries(r.athlete_modifications, a.p_patch);
      return r;
    },
    complete_workout: (a, t) => {
      const r = find(a, t);
      Object.assign(r, {
        status: "completed",
        completed_at: r.completed_at ?? `fin-${t.workout_logs.indexOf(r)}-${Date.now()}`,
        athlete_modifications: mergeEntries(r.athlete_modifications, a.p_mods),
        rpe_score: a.p_rpe ?? r.rpe_score ?? null,
      });
      return r;
    },
    set_workout_rpe: (a, t) => Object.assign(find(a, t), { rpe_score: a.p_rpe }),
  });
}

function memStore(): WriteQueueStore & { data: Record<string, WriteOp[]> } {
  const data: Record<string, WriteOp[]> = {};
  return { data, get: async (u) => data[u] ?? [], set: async (u, ops) => { data[u] = ops; } };
}

const netErr = () => new ApiError("Envoi", { message: "TypeError: Failed to fetch", code: "" });

/**
 * Téléphone : file branchée comme dans `writes.ts`. `lose` : l'appel arrive
 * au serveur (écrit) mais la réponse se perd une fois (coupure entre deux
 * écritures). `refuse` : refus définitif du serveur.
 */
function phone(store: WriteQueueStore, opts: { online?: boolean } = {}) {
  let online = opts.online ?? false;
  let n = 0;
  const sentOrder: string[] = [];
  const lose = new Set<WriteKind>();
  const refuse = new Map<WriteKind, unknown>();
  const onDropped = vi.fn();
  const executors = Object.fromEntries(
    (Object.keys(EXECUTORS) as WriteKind[]).map((k) => [k, async (a: never) => {
      if (refuse.has(k)) throw refuse.get(k);
      const r = await (EXECUTORS[k] as (x: never) => Promise<unknown>)(a);
      if (lose.delete(k)) throw netErr();
      sentOrder.push(k);
      return r;
    }]),
  ) as Record<WriteKind, (a: never) => Promise<unknown>>;
  const q = createWriteQueue<WriteKind>({
    store, executors,
    isOnline: () => online,
    merge: mergeWriteArgs,
    cascade: workoutPlanCascade,
    onSent: (op) => markSentDraft(op.kind, op.args),
    onDropped,
    newId: () => `op${++n}`,
    now: () => 1_000_000,
  });
  const submit = <K extends WriteKind>(kind: K, args: WriteArgs[K]) => {
    const w = prepareWrite(kind, args);
    return q.submit(kind, w.key, w.args);
  };
  return {
    q, submit, sentOrder, lose, refuse, onDropped,
    setOnline: (v: boolean) => { online = v; },
    /** Retour du réseau : on relance jusqu'à ce que la file ne bouge plus. */
    async reconnect() {
      online = true;
      for (let i = 0; i < 5 && q.pending() > 0; i++) await q.flush();
    },
  };
}

/** L'athlète, sans réseau : démarre, saisit deux fois, termine, note. */
async function offlineSession(p: ReturnType<typeof phone>) {
  expect((await p.submit("workout.plan", plan)).status).toBe("queued");
  saveDraft(workoutDraftKey(ATHLETE, LOCAL), sets1);
  await p.submit("workout.entries", { athleteId: ATHLETE, logId: LOCAL, patch: sets1 });
  saveDraft(workoutDraftKey(ATHLETE, LOCAL), sets2);
  await p.submit("workout.entries", { athleteId: ATHLETE, logId: LOCAL, patch: sets2 });
  await p.submit("workout.complete", { athleteId: ATHLETE, logId: LOCAL, mods: sets2, rpe: null });
  await p.submit("workout.rpe", { athleteId: ATHLETE, logId: LOCAL, rpe: 7 });
}

let server: ReturnType<typeof serverDb>;
beforeEach(() => {
  localStorage.clear();
  server = serverDb();
  setDbForTests(server.db);
});
afterEach(() => setDbForTests(null));

describe("séance libre démarrée hors ligne", () => {
  it("tout part au retour du réseau, dans l'ordre : une séance, complète, notée", async () => {
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await offlineSession(p);
    // Deux saisies de séries de la même séance : une seule opération (la dernière).
    expect(p.q.pending()).toBe(4);
    expect(server.tables.workout_logs).toHaveLength(0);

    await p.reconnect();

    expect(p.sentOrder).toEqual(["workout.plan", "workout.entries", "workout.complete", "workout.rpe"]);
    expect(p.q.pending()).toBe(0);
    expect(server.tables.workout_logs).toHaveLength(1);
    expect(server.tables.workout_logs[0]).toMatchObject({
      id: LOCAL, athlete_id: ATHLETE, session_id: "S1", scheduled_date: DAY,
      status: "completed", rpe_score: 7, athlete_modifications: sets2, rescheduled_by_athlete: true,
    });
    // Brouillon local intact, marqué synchronisé.
    expect(loadDraft(workoutDraftKey(ATHLETE, LOCAL))).toMatchObject({ value: sets2, synced: true });
  });

  it("réponse perdue entre deux écritures (création, puis fin) : rejeu sans doublon", async () => {
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await offlineSession(p);
    p.lose.add("workout.plan");
    p.lose.add("workout.complete");

    p.setOnline(true);
    await p.q.flush(); // création écrite, réponse perdue : arrêt, rien de retiré
    expect(p.q.pending()).toBe(4);
    expect(server.tables.workout_logs).toHaveLength(1);
    await p.q.flush(); // création rejouée, saisie, fin écrite mais réponse perdue
    expect(p.q.pending()).toBe(2);
    const firstEnd = server.tables.workout_logs[0].completed_at;
    await p.reconnect();

    expect(p.q.pending()).toBe(0);
    expect(server.tables.workout_logs).toHaveLength(1);
    expect(server.tables.workout_logs[0]).toMatchObject({
      id: LOCAL, status: "completed", completed_at: firstEnd, rpe_score: 7, athlete_modifications: sets2,
    });
  });

  it("onglet fermé avant le retour du réseau : la file stockée repart dans un nouvel onglet", async () => {
    const store = memStore();
    const before = phone(store);
    await before.q.setUser(ATHLETE);
    await offlineSession(before);
    // Onglet tué : on ne garde que le stockage (IndexedDB) et le brouillon.

    const after = phone(store);
    await after.q.setUser(ATHLETE);
    expect(after.q.pending()).toBe(4);
    await after.reconnect();

    expect(after.sentOrder).toEqual(["workout.plan", "workout.entries", "workout.complete", "workout.rpe"]);
    expect(server.tables.workout_logs).toHaveLength(1);
    expect(server.tables.workout_logs[0]).toMatchObject({ id: LOCAL, status: "completed", rpe_score: 7 });
    expect(store.data[ATHLETE]).toEqual([]);
  });

  it("onglet fermé juste après l'envoi de la création (pas encore retirée de la file) : pas de 2ᵉ séance", async () => {
    const store = memStore();
    const before = phone(store);
    await before.q.setUser(ATHLETE);
    await offlineSession(before);
    // La création est arrivée au serveur, l'onglet est mort avant de la retirer.
    await planWorkout({ ...plan, id: LOCAL, byAthlete: true });

    const after = phone(store);
    await after.q.setUser(ATHLETE);
    await after.reconnect();

    expect(server.tables.workout_logs).toHaveLength(1);
    expect(server.tables.workout_logs[0]).toMatchObject({ id: LOCAL, status: "completed", athlete_modifications: sets2 });
  });

  it("séance déjà créée puis déplacée par le coach avant le rejeu : même id, saisies dessus", async () => {
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await offlineSession(p);
    await planWorkout({ ...plan, id: LOCAL, byAthlete: true });
    server.tables.workout_logs[0].scheduled_date = "2026-11-14";

    await p.reconnect();

    expect(p.q.pending()).toBe(0);
    expect(server.tables.workout_logs).toHaveLength(1);
    expect(server.tables.workout_logs[0]).toMatchObject({
      id: LOCAL, scheduled_date: "2026-11-14", status: "completed", athlete_modifications: sets2,
    });
  });

  it("place déjà prise par une séance du coach : saisies redirigées vers elle, brouillon gardé sous l'id local", async () => {
    server = serverDb([{
      id: "du-coach", athlete_id: ATHLETE, session_id: "S1", scheduled_date: DAY, status: "planned",
      athlete_modifications: { coachOverride: { blocs: ["coach"] } }, rpe_score: null,
    }]);
    setDbForTests(server.db);
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await offlineSession(p);

    await p.reconnect();

    expect(server.tables.workout_logs).toHaveLength(1);
    expect(server.tables.workout_logs[0]).toMatchObject({
      id: "du-coach", status: "completed", rpe_score: 7,
      athlete_modifications: { ...sets2, coachOverride: { blocs: ["coach"] } },
    });
    // L'écran resté ouvert sur l'id local écrit au bon endroit.
    expect(resolveWorkoutId(LOCAL)).toBe("du-coach");
    expect(prepareWrite("workout.rpe", { athleteId: ATHLETE, logId: LOCAL, rpe: 8 }).key).toBe("workout.rpe:du-coach");
    expect(loadDraft(workoutDraftKey(ATHLETE, LOCAL))).toMatchObject({ value: sets2, synced: true });
  });

  it("création refusée : ses saisies sont retirées avec elle, les autres saisies partent", async () => {
    server = serverDb([{ id: "autre", athlete_id: ATHLETE, session_id: "S2", scheduled_date: "2026-11-11", status: "completed", rpe_score: null }]);
    setDbForTests(server.db);
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await offlineSession(p);
    await p.submit("workout.rpe", { athleteId: ATHLETE, logId: "autre", rpe: 6 });
    p.refuse.set("workout.plan", new ApiError("Ajout", { message: "refus", code: "23502" }));

    await p.reconnect();

    expect(p.onDropped).toHaveBeenCalledTimes(1);
    expect(p.onDropped.mock.calls[0][0].kind).toBe("workout.plan");
    expect(p.sentOrder).toEqual(["workout.rpe"]);
    expect(p.q.pending()).toBe(0);
    expect(server.tables.workout_logs).toEqual([expect.objectContaining({ id: "autre", rpe_score: 6 })]);
    // Brouillon gardé (non synchronisé) : filet pour l'athlète.
    expect(loadDraft(workoutDraftKey(ATHLETE, LOCAL))).toMatchObject({ value: sets2, synced: false });
  });

  it("double appui sur « Démarrer » (même id) : une seule création en file", async () => {
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await p.submit("workout.plan", plan);
    await p.submit("workout.plan", plan);
    expect(p.q.pending()).toBe(1);
    await p.reconnect();
    expect(server.tables.workout_logs).toHaveLength(1);
  });

  it("en ligne mais la création attend encore : les saisies passent derrière elle", async () => {
    const p = phone(memStore());
    await p.q.setUser(ATHLETE);
    await p.submit("workout.plan", plan); // hors ligne
    p.setOnline(true);
    p.lose.add("workout.plan"); // le retour du réseau échoue encore une fois
    await p.q.flush();
    // Réseau revenu : saisie directe impossible tant que la création attend.
    const r = await p.submit("workout.entries", { athleteId: ATHLETE, logId: LOCAL, patch: sets1 });
    expect(r.status).toBe("queued");
    await p.reconnect();
    expect(p.sentOrder).toEqual(["workout.plan", "workout.entries"]);
    expect(server.tables.workout_logs[0]).toMatchObject({ id: LOCAL, athlete_modifications: sets1 });
  });
});
