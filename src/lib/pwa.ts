/**
 * Service worker (app installable + ouverture hors ligne).
 *
 * Le SW ne met en cache QUE l'application (HTML, JS, CSS, icônes, polices) ;
 * les données passent par le cache React Query persisté (`src/lib/offline`),
 * jamais par le SW. Mise à jour en mode « prompt » : la nouvelle version
 * attend que l'utilisateur clique « Recharger » (`UpdatePrompt`), pour ne
 * jamais recharger l'app en pleine séance.
 */

export interface SwEnvironment {
  prod: boolean;
  hasServiceWorker: boolean;
  /** `window.Capacitor` s'il existe. */
  capacitor?: { isNativePlatform?: () => boolean } | undefined;
}

export function shouldRegisterServiceWorker(env: SwEnvironment): boolean {
  // `npm run dev` : pas de SW (il servirait un vieux bundle pendant le dev).
  if (!env.prod) return false;
  if (!env.hasServiceWorker) return false;
  // Capacitor (App Store / Play Store) : les fichiers de l'app sont déjà dans
  // le paquet natif et mis à jour par le store. Un SW y serait inutile et
  // pourrait servir un ancien bundle après une mise à jour de l'app.
  if (env.capacitor?.isNativePlatform?.()) return false;
  return true;
}

export function currentSwEnvironment(): SwEnvironment {
  const w = typeof window !== "undefined"
    ? (window as unknown as { Capacitor?: SwEnvironment["capacitor"] })
    : undefined;
  return {
    prod: import.meta.env.PROD,
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    capacitor: w?.Capacitor,
  };
}

/** Vérification d'une nouvelle version : l'app reste souvent ouverte des jours. */
export const SW_UPDATE_CHECK_MS = 60 * 60 * 1000;
