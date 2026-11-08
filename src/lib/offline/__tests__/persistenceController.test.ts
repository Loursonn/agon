import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { cacheKeyFor } from "../offlineCache";
import { createPersistenceController, type OfflineStore } from "../persistenceController";

/** Stockage simulé : copie les valeurs comme IndexedDB (structured clone). */
function memoryStore() {
  const map = new Map<string, unknown>();
  const store: OfflineStore & { map: Map<string, unknown>; writes: number } = {
    map,
    writes: 0,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
    async set(k, v) { store.writes++; map.set(k, structuredClone(v)); },
    async del(k) { map.delete(k); },
    async keys() { return [...map.keys()]; },
    async clear() { map.clear(); },
  };
  return store;
}

const qc = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

function controller(queryClient: QueryClient, store: OfflineStore, extra: Partial<Parameters<typeof createPersistenceController>[0]> = {}) {
  return createPersistenceController({ queryClient, store, buster: "b1", throttleMs: 5, ...extra });
}

/** Écrit dans le stockage le cache de `userId` contenant `data` sous `key`. */
async function seed(store: OfflineStore, userId: string, key: unknown[], data: unknown, buster = "b1") {
  const client = qc();
  const c = controller(client, store, { buster });
  await c.setUser(userId);
  client.setQueryData(key, data);
  await c.flush();
}

describe("createPersistenceController", () => {
  it("restaure le cache de l'utilisateur au démarrage", async () => {
    const store = memoryStore();
    await seed(store, "u1", ["workouts", "u1"], [{ id: "w1" }]);

    const client = qc();
    const c = controller(client, store);
    const p = c.setUser("u1");
    expect(c.isRestoring()).toBe(true);
    await p;
    expect(c.isRestoring()).toBe(false);
    expect(client.getQueryData(["workouts", "u1"])).toEqual([{ id: "w1" }]);
  });

  it("jette un cache écrit par une autre version (buster)", async () => {
    const store = memoryStore();
    await seed(store, "u1", ["workouts", "u1"], [1], "ancienne-version");

    const client = qc();
    await controller(client, store).setUser("u1");
    expect(client.getQueryData(["workouts", "u1"])).toBeUndefined();
  });

  it("jette un cache plus vieux que maxAge", async () => {
    const store = memoryStore();
    await seed(store, "u1", ["workouts", "u1"], [1]);
    const client = qc();
    await controller(client, store, { maxAge: -1 }).setUser("u1");
    expect(client.getQueryData(["workouts", "u1"])).toBeUndefined();
  });

  it("ne montre jamais le cache d'un utilisateur à un autre", async () => {
    const store = memoryStore();
    const client = qc();
    const c = controller(client, store);
    await c.setUser("u1");
    client.setQueryData(["wellness", "u1"], [{ sleep: 7 }]);
    await c.flush();
    expect(store.map.has(cacheKeyFor("u1"))).toBe(true);

    await c.setUser("u2");
    // mémoire vidée au changement de compte…
    expect(client.getQueryData(["wellness", "u1"])).toBeUndefined();
    // …et une seule entrée gardée sur l'appareil
    expect(store.map.has(cacheKeyFor("u1"))).toBe(false);
    client.setQueryData(["wellness", "u2"], []);
    await c.flush();
    expect([...store.map.keys()]).toEqual([cacheKeyFor("u2")]);
  });

  it("clear() vide la mémoire et le stockage, et rien n'est réécrit ensuite", async () => {
    const store = memoryStore();
    const client = qc();
    const c = controller(client, store);
    await c.setUser("u1");
    client.setQueryData(["workouts", "u1"], [1]);
    await c.flush();

    await c.clear();
    expect(store.map.size).toBe(0);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(c.currentUser()).toBeNull();

    client.setQueryData(["workouts", "u1"], [2]);
    await c.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.map.size).toBe(0);
  });

  it("une écriture programmée avant clear() n'aboutit pas", async () => {
    const store = memoryStore();
    const client = qc();
    const c = controller(client, store, { throttleMs: 10 });
    await c.setUser("u1");
    client.setQueryData(["workouts", "u1"], [1]); // programme une écriture
    await c.clear();
    await new Promise((r) => setTimeout(r, 30));
    expect(store.map.size).toBe(0);
  });

  it("ne persiste ni les requêtes exclues ni les erreurs", async () => {
    const store = memoryStore();
    const client = qc();
    const c = controller(client, store);
    await c.setUser("u1");
    client.setQueryData(["workouts", "u1"], [1]);
    client.setQueryData(["docs", "signed-url", "p"], "https://signed");
    await client.prefetchQuery({ queryKey: ["boom"], queryFn: () => Promise.reject(new Error("x")) });
    await c.flush();

    const saved = store.map.get(cacheKeyFor("u1")) as { clientState: { queries: { queryKey: unknown[] }[] } };
    expect(saved.clientState.queries.map((q) => q.queryKey)).toEqual([["workouts", "u1"]]);
  });

  it("n'écrit pas hors ligne (canPersist = false)", async () => {
    const store = memoryStore();
    const client = qc();
    let online = false;
    const c = controller(client, store, { canPersist: () => online });
    await c.setUser("u1");
    client.setQueryData(["workouts", "u1"], []);
    await c.flush();
    expect(store.writes).toBe(0);
    online = true;
    await c.flush();
    expect(store.writes).toBe(1);
  });

  it("écarte seulement la requête non copiable (DataCloneError)", async () => {
    const store = memoryStore();
    const client = qc();
    const c = controller(client, store);
    await c.setUser("u1");
    client.setQueryData(["ok"], { a: 1 });
    client.setQueryData(["ko"], { fn: () => 1 });
    await c.flush();

    const saved = store.map.get(cacheKeyFor("u1")) as { clientState: { queries: { queryKey: unknown[] }[] } };
    expect(saved.clientState.queries.map((q) => q.queryKey)).toEqual([["ok"]]);
  });

  it("n'attend pas indéfiniment un IndexedDB bloqué", async () => {
    const store = memoryStore();
    store.get = () => new Promise(() => { /* ne répond jamais */ });
    const client = qc();
    const c = controller(client, store, { restoreTimeoutMs: 10 });
    await c.setUser("u1");
    expect(c.isRestoring()).toBe(false);
  });

  it("une restauration tardive n'hydrate pas le cache d'un autre utilisateur", async () => {
    const store = memoryStore();
    await seed(store, "u1", ["workouts", "u1"], [1]);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const realGet = store.get.bind(store);
    store.get = async (k) => { await gate; return realGet(k); };

    const client = qc();
    const c = controller(client, store, { restoreTimeoutMs: 5 });
    await c.setUser("u1"); // abandon après 5 ms
    await c.clear();       // déconnexion
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(client.getQueryData(["workouts", "u1"])).toBeUndefined();
  });

  it("prévient les abonnés quand la restauration commence et finit", async () => {
    const store = memoryStore();
    const c = controller(qc(), store);
    const seen: boolean[] = [];
    const unsub = c.subscribeRestoring(() => seen.push(c.isRestoring()));
    await c.setUser("u1");
    unsub();
    expect(seen).toEqual([true, false]);
  });
});
