import { forgetStoredSession, signOut } from "@/api/auth";
import { clearOfflineProfile } from "./offlineCache";
import { clearOfflineCache } from "./offlinePersistence";
import { clearPendingWrites, logoutWarning } from "./writes";

/**
 * Des saisies attendent encore le réseau : demande confirmation avant de les
 * perdre. `true` = on peut se déconnecter.
 */
export function confirmLogout(): boolean {
  const msg = logoutWarning();
  if (!msg || typeof window === "undefined") return true;
  return window.confirm(msg);
}

/**
 * Déconnexion de CET appareil, réseau ou pas : efface les copies hors ligne
 * (fiche, cache des requêtes) puis la session. Hors ligne, `signOut` oublie
 * quand même la session enregistrée mais lève : l'appelant doit alors vider
 * l'écran lui-même (rechargement vers /login, ou état remis à zéro).
 *
 * Seul chemin de déconnexion des boutons de l'app. Les saisies pas encore
 * envoyées sont effacées : appeler `confirmLogout()` avant.
 */
export async function logoutDevice(): Promise<void> {
  const wipe = async () => {
    await clearPendingWrites().catch((e) => console.error("[logout] saisies en attente", e));
    try {
      clearOfflineProfile(typeof localStorage !== "undefined" ? localStorage : null);
    } catch {
      /* stockage bloqué */
    }
    await clearOfflineCache().catch((e) => console.error("[logout] cache hors ligne", e));
  };
  await wipe();
  // Hors ligne, `signOut` attend un rafraîchissement de jeton (~25 s) avant
  // d'échouer : on oublie d'abord la session, il se termine alors en local.
  if (typeof navigator !== "undefined" && navigator.onLine === false) forgetStoredSession();
  try {
    await signOut("local");
  } finally {
    // Un rafraîchissement déjà parti a pu réécrire cache ou fiche entre-temps.
    await wipe();
  }
}
