import { describe, it, expect, vi } from "vitest";
import {
  classifyWriteError,
  coalesce,
  createWriteQueue,
  MAX_TRANSIENT_ATTEMPTS,
  retryDelay,
  type QueueBus,
  type QueueLock,
  type WriteOp,
  type WriteQueueStore,
} from "../writeQueue";
import { ApiError } from "@/api/client";

function memStore(initial: Record<string, WriteOp[]> = {}): WriteQueueStore & { data: Record<string, WriteOp[]> } {
  const data: Record<string, WriteOp[]> = { ...initial };
  return {
    data,
    get: async (u) => data[u] ?? [],
    set: async (u, ops) => { data[u] = ops; },
  };
}

const netErr = () => new ApiError("Séance", { message: "TypeError: Failed to fetch", code: "" });
const goneErr = () => new ApiError("Séance", { message: "introuvable", code: "P0002" });

function setup(opts: { online?: boolean; exec?: (args: unknown) => Promise<unknown>; merge?: (k: string, a: unknown, b: unknown) => unknown } = {}) {
  let online = opts.online ?? true;
  let n = 0;
  let clock = 1_000_000;
  const store = memStore();
  const calls: unknown[] = [];
  const exec = vi.fn(opts.exec ?? (async (args: unknown) => { calls.push(args); return "ok"; }));
  const onDropped = vi.fn();
  const onFlushed = vi.fn();
  const q = createWriteQueue<"w">({
    store,
    executors: { w: exec as never },
    isOnline: () => online,
    onDropped,
    onFlushed,
    merge: opts.merge,
    newId: () => `op${++n}`,
    now: () => clock,
  });
  return {
    q, store, exec, calls, onDropped, onFlushed,
    setOnline: (v: boolean) => { online = v; },
    advance: (ms: number) => { clock += ms; },
  };
}

describe("classifyWriteError", () => {
  it("coupure réseau (Chrome, Safari, Firefox)", () => {
    expect(classifyWriteError(netErr())).toBe("network");
    expect(classifyWriteError(new ApiError("x", { message: "TypeError: Load failed", code: "" }))).toBe("network");
    expect(classifyWriteError(new Error("NetworkError when attempting to fetch resource."))).toBe("network");
    expect(classifyWriteError({ network: true })).toBe("network");
    expect(classifyWriteError(goneErr(), true)).toBe("network");
  });
  it("jeton expiré, base injoignable ou en redémarrage : on attend sans compter d'essai", () => {
    for (const code of ["PGRST303", "PGRST301", "PGRST000", "PGRST002", "08006", "57P01", "53300", "57014", "40001"]) {
      expect(classifyWriteError(new ApiError("x", { message: "indisponible", code })), code).toBe("network");
    }
  });
  it("refus définitifs", () => {
    for (const code of ["P0002", "P0001", "22023", "22P02", "23505", "PGRST202"]) {
      expect(classifyWriteError(new ApiError("x", { message: "non", code })), code).toBe("permanent");
    }
  });
  it("droits, erreur sans code, bug JS : à réessayer, pas bloquant à vie", () => {
    expect(classifyWriteError(new ApiError("x", { message: "denied", code: "42501" }))).toBe("transient");
    expect(classifyWriteError(new ApiError("x", { message: "Bad gateway", code: "" }))).toBe("transient");
    expect(classifyWriteError(new TypeError("cannot read properties of undefined"))).toBe("transient");
    expect(classifyWriteError(null)).toBe("transient");
  });
});

describe("coalesce", () => {
  const op = (id: string, key: string, args: unknown): WriteOp => ({ id, kind: "w", key, args, createdAt: 0, attempts: 2 });
  it("remplace à sa place la saisie de même clé, état des essais gardé", () => {
    const out = coalesce([{ ...op("a", "k1", 1), nextAt: 99 }, op("b", "k2", 2)], { ...op("c", "k1", 3), attempts: 0 });
    expect(out.map((o) => [o.id, o.args, o.attempts, o.nextAt])).toEqual([["a", 3, 2, 99], ["b", 2, 2, undefined]]);
  });
  it("fusion des arguments si demandée", () => {
    const out = coalesce([op("a", "k", { x: 1 })], op("b", "k", { y: 2 }), (_k, p, n) => ({ ...(p as object), ...(n as object) }));
    expect(out[0].args).toEqual({ x: 1, y: 2 });
  });
  it("ajoute en fin sinon", () => {
    expect(coalesce([op("a", "k1", 1)], op("b", "k2", 2)).map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("createWriteQueue", () => {
  it("en ligne : envoie tout de suite", async () => {
    const { q, calls } = setup();
    await q.setUser("u1");
    expect(await q.submit("w", "k", { a: 1 })).toEqual({ status: "sent", result: "ok" });
    expect(calls).toEqual([{ a: 1 }]);
    expect(q.pending()).toBe(0);
  });

  it("hors ligne : garde, puis envoie dans l'ordre au retour du réseau", async () => {
    const { q, calls, store, setOnline, onFlushed } = setup({ online: false });
    await q.setUser("u1");
    expect((await q.submit("w", "k1", 1)).status).toBe("queued");
    await q.submit("w", "k2", 2);
    await q.submit("w", "k1", 3); // même cible : remplace la première
    expect(q.pending()).toBe(2);
    expect(store.data.u1.map((o) => o.args)).toEqual([3, 2]);
    setOnline(true);
    await q.flush();
    expect(calls).toEqual([3, 2]);
    expect(q.pending()).toBe(0);
    expect(store.data.u1).toEqual([]);
    expect(onFlushed).toHaveBeenCalledWith(2);
  });

  it("des saisies attendent : la nouvelle passe derrière (ordre gardé)", async () => {
    const { q, calls, setOnline } = setup({ online: false });
    await q.setUser("u1");
    await q.submit("w", "k1", 1);
    setOnline(true);
    expect((await q.submit("w", "k2", 2)).status).toBe("queued");
    await q.flush();
    expect(calls).toEqual([1, 2]);
  });

  it("coupure pendant l'envoi direct : gardée", async () => {
    const { q } = setup({ exec: async () => { throw netErr(); } });
    await q.setUser("u1");
    expect(await q.submit("w", "k", 1)).toEqual({ status: "queued" });
    expect(q.pending()).toBe(1);
  });

  it("refus définitif à l'envoi direct : levé à l'appelant, rien gardé", async () => {
    const { q } = setup({ exec: async () => { throw goneErr(); } });
    await q.setUser("u1");
    await expect(q.submit("w", "k", 1)).rejects.toThrow("introuvable");
    expect(q.pending()).toBe(0);
  });

  it("refus définitif à la reprise : abandonnée et signalée, la suite part", async () => {
    let first = true;
    const sent: unknown[] = [];
    const { q, setOnline, onDropped } = setup({
      online: false,
      exec: async (a) => { if (first) { first = false; throw goneErr(); } sent.push(a); return null; },
    });
    await q.setUser("u1");
    await q.submit("w", "k1", 1);
    await q.submit("w", "k2", 2);
    setOnline(true);
    await q.flush();
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(onDropped.mock.calls[0][0].args).toBe(1);
    expect(sent).toEqual([2]);
    expect(q.pending()).toBe(0);
  });

  it("coupure à la reprise : on s'arrête, tout reste", async () => {
    const { q, setOnline, exec } = setup({ online: false, exec: async () => { throw netErr(); } });
    await q.setUser("u1");
    await q.submit("w", "k1", 1);
    await q.submit("w", "k2", 2);
    setOnline(true);
    await q.flush();
    expect(exec).toHaveBeenCalledTimes(1);
    expect(q.pending()).toBe(2);
  });

  it(`erreur inconnue : essais espacés, abandon après ${MAX_TRANSIENT_ATTEMPTS} essais seulement`, async () => {
    const { q, setOnline, onDropped, exec, advance } = setup({
      online: false,
      exec: async () => { throw new ApiError("x", { message: "Bad gateway", code: "" }); },
    });
    await q.setUser("u1");
    await q.submit("w", "k1", 1);
    setOnline(true);
    await q.flush();
    expect(exec).toHaveBeenCalledTimes(1);
    // Taper vite pendant la panne (même cible) : aucun essai en plus, rien d'abandonné.
    for (let i = 0; i < 20; i++) { await q.submit("w", "k1", i); await q.flush(); }
    expect(exec).toHaveBeenCalledTimes(1);
    expect(q.pending()).toBe(1);
    for (let i = 1; i < MAX_TRANSIENT_ATTEMPTS; i++) {
      advance(retryDelay(i));
      await q.flush();
      expect(q.pending()).toBe(i === MAX_TRANSIENT_ATTEMPTS - 1 ? 0 : 1);
    }
    expect(exec).toHaveBeenCalledTimes(MAX_TRANSIENT_ATTEMPTS);
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("erreur inconnue à l'envoi direct : gardée, pas de nouvel essai immédiat", async () => {
    const { q, exec } = setup({ exec: async () => { throw new ApiError("x", { message: "Bad gateway", code: "" }); } });
    await q.setUser("u1");
    expect((await q.submit("w", "k", 1)).status).toBe("queued");
    await q.flush();
    expect(exec).toHaveBeenCalledTimes(1);
    expect(q.pending()).toBe(1);
  });

  it("refus de l'ancienne version pendant qu'une nouvelle arrive : la nouvelle reste", async () => {
    let release!: () => void;
    let first = true;
    const { q, setOnline, onDropped } = setup({
      online: false,
      exec: async () => {
        if (first) { first = false; await new Promise<void>((r) => { release = r; }); throw goneErr(); }
        return null;
      },
    });
    await q.setUser("u1");
    await q.submit("w", "k", 1);
    setOnline(true);
    const running = q.flush();
    await Promise.resolve();
    await q.submit("w", "k", 2);
    release();
    await running;
    expect(onDropped).not.toHaveBeenCalled();
    expect(q.pending()).toBe(1);
    await q.flush();
    expect(q.pending()).toBe(0);
  });

  it("saisie faite avant que l'utilisateur soit connu : gardée et enregistrée pour lui", async () => {
    const { q, store, calls, setOnline } = setup({ online: false });
    await q.submit("w", "k", "avant");
    await q.setUser("u1");
    expect(q.pending()).toBe(1);
    expect(store.data.u1).toHaveLength(1);
    setOnline(true);
    await q.flush();
    expect(calls).toEqual(["avant"]);
  });

  it("pas prêt (session pas rafraîchie) : rien n'est envoyé", async () => {
    const store = memStore();
    const exec = vi.fn(async () => "ok");
    let ok = false;
    const q = createWriteQueue<"w">({ store, executors: { w: exec as never }, isOnline: () => true, ready: async () => ok });
    await q.setUser("u1");
    await store.set("u1", []);
    // forcer une saisie en attente
    const offline = createWriteQueue<"w">({ store, executors: { w: exec as never }, isOnline: () => false });
    await offline.setUser("u1");
    await offline.submit("w", "k", 1);
    await q.setUser(null);
    await q.setUser("u1");
    await q.flush();
    expect(exec).not.toHaveBeenCalled();
    ok = true;
    await q.flush();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("saisie remplacée pendant son envoi : la nouvelle version reste à envoyer", async () => {
    let release!: () => void;
    const sent: unknown[] = [];
    const { q, setOnline } = setup({
      online: false,
      exec: async (a) => {
        sent.push(a);
        if (sent.length === 1) await new Promise<void>((r) => { release = r; });
        return null;
      },
    });
    await q.setUser("u1");
    await q.submit("w", "k", 1);
    setOnline(true);
    const running = q.flush();
    await Promise.resolve();
    await q.submit("w", "k", 2);
    release();
    await running;
    await q.flush();
    expect(sent).toEqual([1, 2]);
    expect(q.pending()).toBe(0);
  });

  it("par utilisateur : jamais les saisies d'un autre", async () => {
    const { q, store, calls, setOnline } = setup({ online: false });
    await q.setUser("u1");
    await q.submit("w", "k", "de u1");
    await q.setUser("u2");
    expect(q.pending()).toBe(0);
    setOnline(true);
    await q.flush();
    expect(calls).toEqual([]);
    expect(store.data.u1).toHaveLength(1);
    await q.setUser(null);
    await q.flush();
    expect(calls).toEqual([]);
  });

  it("sans utilisateur : gardée en mémoire, pas envoyée", async () => {
    const { q, calls } = setup();
    expect((await q.submit("w", "k", 1)).status).toBe("queued");
    await q.flush();
    expect(calls).toEqual([]);
  });

  it("clearCurrent vide le compte connecté seulement et prévient les abonnés", async () => {
    const { q, store } = setup({ online: false });
    await q.setUser("u2");
    await q.submit("w", "k", "de u2");
    await q.setUser("u1");
    await q.submit("w", "k", 1);
    expect(q.keys()).toEqual(["k"]);
    const cb = vi.fn();
    q.subscribe(cb);
    await q.clearCurrent();
    expect(q.pending()).toBe(0);
    expect(store.data.u1).toEqual([]);
    expect(store.data.u2).toHaveLength(1);
    expect(cb).toHaveBeenCalled();
  });

  it("type inconnu (ancienne version) : abandonné", async () => {
    const store = memStore({ u1: [{ id: "x", kind: "disparu", key: "k", args: 1, createdAt: 0, attempts: 0 }] });
    const onDropped = vi.fn();
    const q = createWriteQueue<"w">({ store, executors: { w: async () => null }, isOnline: () => true, onDropped });
    await q.setUser("u1");
    await q.flush();
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(q.pending()).toBe(0);
  });
});

// ── Plusieurs onglets sur le même stockage ───────────────────────────────────

/** Stockage lent (lecture / écriture asynchrones) : fait apparaître les courses. */
function slowStore(): WriteQueueStore & { data: Record<string, WriteOp[]> } {
  const data: Record<string, WriteOp[]> = {};
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    data,
    get: async (u) => { await tick(); return [...(data[u] ?? [])]; },
    set: async (u, ops) => { await tick(); data[u] = ops; },
  };
}

/** `navigator.locks` simulé : une exécution à la fois par nom. */
function fakeLocks(): QueueLock {
  const tails = new Map<string, Promise<unknown>>();
  return <T,>(name: string, fn: () => Promise<T>) => {
    const prev = tails.get(name) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    tails.set(name, run.catch(() => undefined));
    return run;
  };
}

/** `BroadcastChannel` simulé : l'onglet qui poste ne reçoit pas son message. */
function fakeBus() {
  const subs = new Set<(u: string) => void>();
  return (): QueueBus => {
    const mine = new Set<(u: string) => void>();
    return {
      post: (u) => { for (const s of subs) if (!mine.has(s)) setTimeout(() => s(u), 0); },
      subscribe: (cb) => { mine.add(cb); subs.add(cb); return () => { subs.delete(cb); mine.delete(cb); }; },
    };
  };
}

function twoTabs(opts: { online?: boolean; exec?: (args: unknown) => Promise<unknown>; withLock?: boolean } = {}) {
  let online = opts.online ?? false;
  const store = slowStore();
  const lock = opts.withLock === false ? undefined : fakeLocks();
  const bus = fakeBus();
  const sent: unknown[] = [];
  const exec = vi.fn(opts.exec ?? (async (a: unknown) => { sent.push(a); return "ok"; }));
  let n = 0;
  const make = (tab: string) => createWriteQueue<"w">({
    store, lock, bus: bus(),
    executors: { w: exec as never },
    isOnline: () => online,
    newId: () => `${tab}${++n}`,
  });
  return { a: make("A"), b: make("B"), store, sent, exec, setOnline: (v: boolean) => { online = v; } };
}

describe("plusieurs onglets", () => {
  it("deux saisies simultanées dans deux onglets : aucune n'écrase l'autre", async () => {
    const { a, b, store } = twoTabs();
    await Promise.all([a.setUser("u1"), b.setUser("u1")]);
    await Promise.all([a.submit("w", "k1", "de A"), b.submit("w", "k2", "de B"), a.submit("w", "k3", "de A bis")]);
    expect(store.data.u1.map((o) => o.args).sort()).toEqual(["de A", "de A bis", "de B"]);
  });

  it("le compteur de l'autre onglet suit (canal entre onglets)", async () => {
    const { a, b } = twoTabs();
    await a.setUser("u1");
    await b.setUser("u1");
    const cb = vi.fn();
    b.subscribe(cb);
    await a.submit("w", "k1", 1);
    await vi.waitFor(() => expect(b.pending()).toBe(1));
    expect(cb).toHaveBeenCalled();
    await b.clearCurrent();
    await vi.waitFor(() => expect(a.pending()).toBe(0));
  });

  it("même cible dans deux onglets : la plus récente gagne, une seule opération", async () => {
    const { a, b, store } = twoTabs();
    await a.setUser("u1");
    await b.setUser("u1");
    await a.submit("w", "k", "ancienne");
    await b.submit("w", "k", "récente");
    expect(store.data.u1.map((o) => o.args)).toEqual(["récente"]);
  });

  it("en ligne, un onglet qui n'a rien en mémoire passe derrière la file de l'autre", async () => {
    const { a, b, sent, setOnline } = twoTabs();
    await a.setUser("u1");
    await b.setUser("u1");
    await a.submit("w", "k1", "ancienne de A");
    setOnline(true);
    // B n'a pas encore reçu le message du canal : il relit le stockage.
    expect((await b.submit("w", "k2", "de B")).status).toBe("queued");
    await b.flush();
    await a.flush();
    expect(sent).toEqual(["ancienne de A", "de B"]);
  });

  it("deux onglets qui envoient en même temps : chaque saisie part une fois", async () => {
    const { a, b, sent, setOnline, store } = twoTabs();
    await a.setUser("u1");
    await b.setUser("u1");
    await a.submit("w", "k1", 1);
    await b.submit("w", "k2", 2);
    setOnline(true);
    await Promise.all([a.flush(), b.flush()]);
    expect(sent).toEqual([1, 2]);
    expect(store.data.u1).toEqual([]);
    expect(a.pending() + b.pending()).toBe(0);
  });

  it("saisie remplacée par l'autre onglet pendant l'envoi : la nouvelle reste à envoyer", async () => {
    let release!: () => void;
    const { a, b, sent, setOnline } = twoTabs({
      exec: async (x) => {
        sent.push(x);
        if (sent.length === 1) await new Promise<void>((r) => { release = r; });
        return null;
      },
    });
    await a.setUser("u1");
    await b.setUser("u1");
    await a.submit("w", "k", "v1");
    setOnline(true);
    const running = a.flush();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await b.submit("w", "k", "v2");
    release();
    await running;
    await a.flush();
    expect(sent).toEqual(["v1", "v2"]);
    expect(a.pending()).toBe(0);
  });
});

describe("cascade (suite d'un envoi)", () => {
  function setupCascade(exec: (a: { kind: string; id: string }) => Promise<unknown>) {
    const store = memStore();
    let online = false;
    let n = 0;
    const onDropped = vi.fn();
    const seen: unknown[] = [];
    const q = createWriteQueue<"plan" | "entries">({
      store,
      executors: {
        plan: (async (a: { id: string }) => exec({ kind: "plan", id: a.id })) as never,
        entries: (async (a: { id: string }) => { seen.push(a.id); return null; }) as never,
      },
      isOnline: () => online,
      onDropped,
      newId: () => `op${++n}`,
      cascade: (op, outcome) => {
        if (op.kind !== "plan") return null;
        const clientId = (op.args as { id: string }).id;
        if (!outcome.ok) return (o) => ((o.args as { id: string }).id === clientId ? null : o);
        const serverId = (outcome.result as { id: string }).id;
        return (o) => ((o.args as { id: string }).id === clientId
          ? { ...o, key: `entries:${serverId}`, args: { id: serverId } } : o);
      },
    });
    return { q, store, seen, onDropped, setOnline: (v: boolean) => { online = v; } };
  }

  it("id attribué par le serveur : les saisies suivantes visent la bonne séance", async () => {
    const { q, seen, setOnline } = setupCascade(async () => ({ id: "serveur" }));
    await q.setUser("u1");
    await q.submit("plan", "plan:local", { id: "local" });
    await q.submit("entries", "entries:local", { id: "local" });
    await q.submit("entries", "entries:autre", { id: "autre" });
    setOnline(true);
    await q.flush();
    expect(seen).toEqual(["serveur", "autre"]);
    expect(q.pending()).toBe(0);
  });

  it("séance refusée : ses saisies sont retirées avec elle, pas les autres", async () => {
    const { q, seen, setOnline, onDropped } = setupCascade(async () => { throw goneErr(); });
    await q.setUser("u1");
    await q.submit("plan", "plan:local", { id: "local" });
    await q.submit("entries", "entries:local", { id: "local" });
    await q.submit("entries", "entries:autre", { id: "autre" });
    setOnline(true);
    await q.flush();
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["autre"]);
    expect(q.pending()).toBe(0);
  });
});
