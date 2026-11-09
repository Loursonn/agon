import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { reportClientBuild } from "@/api/account";
import { currentBuild, shouldCheckNow } from "@/lib/versionCheck";

/** Au plus un envoi toutes les 5 minutes côté appareil (le serveur limite déjà à 1 h par build). */
const REPORT_MIN_GAP_MS = 5 * 60 * 1000;

/**
 * Dit au serveur quelle version de l'app tourne sur cet appareil (démarrage et
 * retour au premier plan), pour compter les clients restés sur une vieille
 * version avant de supprimer l'ancien stockage santé. Silencieux : hors ligne
 * ou refus, on réessaiera au prochain retour au premier plan. Rien en
 * développement (les builds `local-…` fausseraient le comptage).
 */
export default function ClientBuildReporter() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    const build = currentBuild();
    if (!userId || !build || !import.meta.env.PROD) return;
    let last: number | null = null;
    const report = () => {
      const now = Date.now();
      if (!navigator.onLine || !shouldCheckNow(last, now, REPORT_MIN_GAP_MS)) return;
      last = now;
      reportClientBuild(build.id).catch(() => { last = null; });
    };
    const onVisible = () => { if (document.visibilityState === "visible") report(); };
    report();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  return null;
}
