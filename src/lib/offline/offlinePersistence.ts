import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { clear, createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import { db } from "@/api/client";
import { appBuster, authStorageKey, readStoredAuthUserId } from "./offlineCache";
import { pendingWrites } from "./writes";
import {
  createPersistenceController,
  type OfflineStore,
  type PersistenceController,
} from "./persistenceController";

/**
 * Branchement du cache hors ligne : IndexedDB + session Supabase.
 *
 * - Au démarrage, l'utilisateur est lu dans la session enregistrée (sans
 *   réseau) et son cache est restauré AVANT que les requêtes ne partent
 *   (`isRestoring`, voir `OfflineQueryProvider`).
 * - `SIGNED_IN` / `TOKEN_REFRESHED` / `INITIAL_SESSION` avec session : suit
 *   l'utilisateur (changement de compte = cache de l'autre effacé).
 * - `SIGNED_OUT` : tout est effacé (mémoire + IndexedDB).
 * - `INITIAL_SESSION` SANS session n'efface rien : hors ligne avec un jeton
 *   expiré, supabase-js renvoie `null` alors que la session est encore là.
 *
 * Une déconnexion faite HORS LIGNE n'émet pas `SIGNED_OUT` (supabase-js
 * échoue sur l'appel réseau et garde la session) : le bouton « Se
 * déconnecter » doit donc appeler `clearOfflineCache()` lui-même, avant
 * `signOut()`.
 */

let idbStore: UseStore | null = null;
let idbUnavailable = false;

function idb(): UseStore {
  if (idbUnavailable) throw new Error("IndexedDB indisponible");
  if (!idbStore) {
    try {
      idbStore = createStore("agon-offline", "react-query");
    } catch (err) {
      idbUnavailable = true;
      throw err;
    }
  }
  return idbStore;
}

const indexedDbStore: OfflineStore = {
  get: async (key) => get(key, idb()),
  set: async (key, value) => set(key, value, idb()),
  del: async (key) => del(key, idb()),
  keys: async () => keys(idb()),
  clear: async () => clear(idb()),
};

let controller: PersistenceController | null = null;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** À appeler une fois, juste après la création du QueryClient. */
export function startOfflinePersistence(queryClient: QueryClient): PersistenceController {
  if (controller) return controller;
  const c = createPersistenceController({
    queryClient,
    store: indexedDbStore,
    buster: appBuster(),
    // Hors ligne on n'écrit pas (une ancienne queryFn qui avale l'erreur réseau
    // pourrait écraser le cache avec du vide), SAUF si des saisies attendent :
    // leur affichage optimiste (séance validée…) doit survivre à un rechargement.
    canPersist: () => onlineManager.isOnline() || pendingWrites() > 0,
    onError: (err) => {
      if (import.meta.env.DEV) console.warn("[offline] cache hors ligne :", err);
    },
  });
  controller = c;

  const storedUser = readStoredAuthUserId(safeLocalStorage(), import.meta.env.VITE_SUPABASE_URL);
  if (storedUser) void c.setUser(storedUser);

  try {
    db().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") return c.clear();
      const id = session?.user?.id;
      if (id) void c.setUser(id);
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[offline] abonnement auth impossible :", err);
  }

  if (typeof window !== "undefined") {
    // Déconnexion dans un AUTRE onglet (même hors ligne, où SIGNED_OUT n'est
    // pas émis) : la session disparaît du stockage → on efface ici aussi.
    const authKey = authStorageKey(import.meta.env.VITE_SUPABASE_URL);
    window.addEventListener("storage", (e) => {
      if (authKey && e.key === authKey && e.newValue === null) void c.clear();
    });
  }

  if (typeof document !== "undefined") {
    // iOS tue les onglets en arrière-plan sans prévenir : on écrit en sortant.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void c.flush();
    });
    window.addEventListener("pagehide", () => { void c.flush(); });
  }
  return c;
}

/**
 * Efface le cache hors ligne (mémoire + IndexedDB, tous utilisateurs).
 * À appeler AVANT `supabase.auth.signOut()` dans chaque bouton de
 * déconnexion et à la suppression de compte.
 */
export async function clearOfflineCache(): Promise<void> {
  if (controller) {
    await controller.clear();
    return;
  }
  try {
    await clear(idb());
  } catch {
    /* rien à effacer */
  }
}
