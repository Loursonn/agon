import type { QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import {
  OFFLINE_CACHE_MAX_AGE_MS,
  OFFLINE_PERSIST_THROTTLE_MS,
  OFFLINE_RESTORE_TIMEOUT_MS,
  cacheKeyFor,
  isCacheKey,
  shouldPersistQuery,
} from "./offlineCache";

/**
 * Copie du cache React Query dans un stockage clé-valeur (IndexedDB en
 * production, une Map en test), par utilisateur.
 *
 * Invariants :
 * - jamais les données de deux utilisateurs dans le même cache (mémoire vidée
 *   au changement d'utilisateur, une seule entrée gardée sur l'appareil) ;
 * - après `clear()`, aucune écriture ni restauration en vol ne peut remettre
 *   de données (compteur `generation`) ;
 * - une erreur de stockage n'empêche jamais l'app de fonctionner : on retombe
 *   sur le réseau.
 */

export interface OfflineStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<unknown[]>;
  clear(): Promise<void>;
}

export interface PersistenceControllerOptions {
  queryClient: QueryClient;
  store: OfflineStore;
  buster: string;
  maxAge?: number;
  throttleMs?: number;
  restoreTimeoutMs?: number;
  /**
   * false = ne rien écrire pour l'instant (hors ligne). La copie IndexedDB
   * reste celle du dernier passage en ligne : une queryFn héritée qui avale
   * l'erreur réseau et renvoie `[]` ne peut pas écraser les vraies données.
   */
  canPersist?: () => boolean;
  onError?: (err: unknown) => void;
}

export interface PersistenceController {
  /** Utilisateur connu (session présente). Restaure son cache puis le suit. */
  setUser(userId: string): Promise<void>;
  /** Déconnexion : vide la mémoire et TOUT le stockage hors ligne. */
  clear(): Promise<void>;
  /** Écrit tout de suite (onglet masqué / fermé). */
  flush(): Promise<void>;
  currentUser(): string | null;
  isRestoring(): boolean;
  subscribeRestoring(listener: () => void): () => void;
}

function isDataCloneError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "DataCloneError";
}

function canClone(value: unknown): boolean {
  if (typeof structuredClone !== "function") return true;
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function createPersistenceController(opts: PersistenceControllerOptions): PersistenceController {
  const {
    queryClient,
    store,
    buster,
    maxAge = OFFLINE_CACHE_MAX_AGE_MS,
    throttleMs = OFFLINE_PERSIST_THROTTLE_MS,
    restoreTimeoutMs = OFFLINE_RESTORE_TIMEOUT_MS,
    canPersist = () => true,
    onError,
  } = opts;

  let userId: string | null = null;
  let generation = 0;
  let restorePromise: Promise<void> | null = null;
  let unsubscribeCache: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let restoring = false;
  const listeners = new Set<() => void>();

  const report = (err: unknown) => { try { onError?.(err); } catch { /* jamais bloquant */ } };

  function setRestoring(v: boolean) {
    if (restoring === v) return;
    restoring = v;
    listeners.forEach((l) => l());
  }

  function persisterFor(id: string, gen: number): Persister {
    const key = cacheKeyFor(id);
    const isCurrent = () => gen === generation && userId === id;
    return {
      async persistClient(client: PersistedClient) {
        if (!isCurrent()) return;
        try {
          await store.set(key, client);
        } catch (err) {
          // Une donnée non copiable (fonction, objet natif…) ferait échouer
          // toute l'écriture : on retire seulement les requêtes fautives.
          if (!isDataCloneError(err) || !isCurrent()) throw err;
          const queries = client.clientState.queries.filter(canClone);
          await store.set(key, { ...client, clientState: { ...client.clientState, queries } });
        }
      },
      async restoreClient() {
        const v = (await store.get(key)) as PersistedClient | undefined;
        // Restauration tardive après un changement d'utilisateur : ignorée.
        return isCurrent() ? v : undefined;
      },
      async removeClient() {
        await store.del(key);
      },
    };
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    unsubscribeCache?.();
    unsubscribeCache = null;
  }

  function save(): Promise<void> {
    const id = userId;
    if (!id || restoring || !canPersist()) return Promise.resolve();
    return persistQueryClientSave({
      queryClient,
      persister: persisterFor(id, generation),
      buster,
      dehydrateOptions: {
        shouldDehydrateQuery: shouldPersistQuery,
        shouldDehydrateMutation: () => false,
      },
    }).catch(report);
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; void save(); }, throttleMs);
  }

  function subscribe() {
    unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "added" || event.type === "removed" || event.type === "updated") schedule();
    });
  }

  async function dropOtherUsers(id: string, gen: number) {
    try {
      const keys = await store.keys();
      if (gen !== generation) return;
      await Promise.all(keys.filter((k) => isCacheKey(k) && k !== cacheKeyFor(id)).map((k) => store.del(k as string)));
    } catch (err) {
      report(err);
    }
  }

  function setUser(id: string): Promise<void> {
    if (id === userId && restorePromise) return restorePromise;
    const previous = userId;
    stop();
    const gen = ++generation;
    // Jamais les requêtes d'un utilisateur dans le cache d'un autre.
    if (previous !== null) queryClient.clear();
    userId = id;
    setRestoring(true);
    restorePromise = (async () => {
      try {
        await withTimeout(
          persistQueryClientRestore({ queryClient, persister: persisterFor(id, gen), maxAge, buster }),
          restoreTimeoutMs,
        );
      } catch (err) {
        report(err);
      }
      if (gen !== generation) return;
      setRestoring(false);
      subscribe();
      schedule();
      await dropOtherUsers(id, gen);
    })();
    return restorePromise;
  }

  async function clear(): Promise<void> {
    generation++;
    stop();
    userId = null;
    restorePromise = null;
    queryClient.clear();
    setRestoring(false);
    try {
      await store.clear();
    } catch (err) {
      report(err);
    }
  }

  async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    await save();
  }

  return {
    setUser,
    clear,
    flush,
    currentUser: () => userId,
    isRestoring: () => restoring,
    subscribeRestoring(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
