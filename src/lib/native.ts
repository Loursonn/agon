/**
 * App native (Capacitor : App Store / Play Store). Voir docs/MOBILE_CAPACITOR.md.
 *
 * Dans l'app native, le même bundle web tourne dans une WebView dont
 * l'origine est `capacitor://localhost` (iOS) ou `https://localhost`
 * (Android). Ce module isole les quelques différences avec le web :
 *   - liens partagés (invitation, réclamation, mot de passe oublié) : ils
 *     doivent pointer vers le site public, pas vers `localhost` ;
 *   - liens ouverts depuis l'extérieur (lien universel / App Link
 *     `https://agon-training.com/...`) : routés dans l'app ;
 *   - bouton retour Android : page précédente, ou sortie de l'app.
 * Sur le web, rien de tout cela ne s'exécute.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { COMPANY } from "@/lib/legal";

/** Hôtes dont les liens s'ouvrent dans l'app (liens universels / App Links). */
const APP_LINK_HOSTS = new Set(["agon-training.com", "www.agon-training.com"]);

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Origine à mettre dans un lien envoyé à quelqu'un (email, copier-coller).
 * Web : l'origine courante (préprod, local). Natif : le site public.
 */
export function publicWebOrigin(native = isNativeApp()): string {
  if (native) return COMPANY.websiteUrl;
  return typeof window !== "undefined" ? window.location.origin : COMPANY.websiteUrl;
}

/**
 * Chemin de l'app à ouvrir pour un lien reçu par le système, ou `null` s'il
 * ne vient pas de notre site (jamais de navigation vers un hôte inconnu).
 */
export function deepLinkPath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !APP_LINK_HOSTS.has(parsed.hostname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
}

/** Navigation SPA sans rechargement : BrowserRouter écoute `popstate`. */
function navigateInApp(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** À appeler une fois au démarrage (src/main.tsx). Sans effet sur le web. */
export function initNativeShell(): void {
  if (!isNativeApp()) return;

  void App.addListener("appUrlOpen", ({ url }) => {
    const path = deepLinkPath(url);
    if (path) navigateInApp(path);
  });

  if (Capacitor.getPlatform() === "android") {
    void App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  }
}
