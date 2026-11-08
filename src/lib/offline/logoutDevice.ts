import { signOut } from "@/api/auth";
import { clearOfflineProfile } from "./offlineCache";
import { clearOfflineCache } from "./offlinePersistence";

/**
 * Déconnexion de CET appareil, réseau ou pas : efface les copies hors ligne
 * (fiche, cache des requêtes) puis la session. Hors ligne, `signOut` oublie
 * quand même la session enregistrée mais lève : l'appelant doit alors vider
 * l'écran lui-même (rechargement vers /login, ou état remis à zéro).
 *
 * Seul chemin de déconnexion des boutons de l'app.
 */
export async function logoutDevice(): Promise<void> {
  try {
    clearOfflineProfile(typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    /* stockage bloqué */
  }
  await clearOfflineCache().catch((e) => console.error("[logout] cache hors ligne", e));
  await signOut("local");
}
