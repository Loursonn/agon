import { useEffect, useRef, useState } from "react";
import { SW_REGISTER_DELAY_MS, SW_UPDATE_CHECK_MS, currentSwEnvironment, shouldRegisterServiceWorker } from "@/lib/pwa";
import {
  VERSION_RETRY_MS, canReloadNow, currentBuild, fetchServedBuild, isNewerBuild, shouldCheckNow,
} from "@/lib/versionCheck";
import { pendingWrites } from "@/lib/offline/writes";

let registered = false;

/**
 * Enregistre le service worker et propose la nouvelle version quand elle est
 * prête : « Nouvelle version disponible — Recharger ». Les brouillons locaux
 * protègent la saisie si l'athlète recharge en pleine séance.
 *
 * Rechargement automatique uniquement quand `/version.json` annonce un build
 * plus récent (src/lib/versionCheck.ts) ET qu'aucune écriture n'attend le
 * réseau ET qu'aucune saisie de séance n'est ouverte ; sinon l'invite reste.
 */
export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  // « × » ne cache l'invite que jusqu'au prochain retour sur l'onglet : un
  // onglet coach ouvert des jours ne doit pas rester sur l'ancienne version.
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const needRefreshRef = useRef(false);
  // Le serveur sert un build plus récent que le bundle en cours (version.json).
  const staleRef = useRef(false);
  const lastCheckRef = useRef<number | null>(null);

  useEffect(() => {
    if (registered || !shouldRegisterServiceWorker(currentSwEnvironment())) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    // Enregistrement différé : à la première visite (ou après une mise en
    // ligne), le SW télécharge toute l'app (~6 Mo) pour le hors ligne. Lancé
    // au démarrage, ce téléchargement se partageait le réseau avec le premier
    // écran (pages et données) ; il attend maintenant que celui-ci soit là.
    const start = window.setTimeout(() => { registered = true; return import("virtual:pwa-register")
      .then(({ registerSW }) => {
        updateRef.current = registerSW({
          onNeedRefresh: () => { needRefreshRef.current = true; setNeedRefresh(true); },
          onRegisteredSW: (_url, registration) => {
            if (!registration) return;
            registrationRef.current = registration;
            interval = setInterval(() => {
              if (navigator.onLine) registration.update().catch(() => { /* réessai à la prochaine heure */ });
            }, SW_UPDATE_CHECK_MS);
            void checkVersion();
          },
        });
      })
      .catch(() => { /* pas de SW : l'app marche comme avant, en ligne */ }); }, SW_REGISTER_DELAY_MS);
    return () => { window.clearTimeout(start); if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contrôle de version (P4) : au démarrage, au retour au premier plan, puis
  // rechargement propre dès que plus rien n'est en cours de saisie.
  function applyIfSafe() {
    if (!staleRef.current || !needRefreshRef.current) return;
    if (!canReloadNow({ pendingWrites: pendingWrites(), pathname: window.location.pathname })) return;
    staleRef.current = false;
    void updateRef.current?.(true);
  }

  async function checkVersion() {
    const now = Date.now();
    if (!registrationRef.current || !navigator.onLine || !shouldCheckNow(lastCheckRef.current, now)) return;
    lastCheckRef.current = now;
    const served = await fetchServedBuild();
    if (!isNewerBuild(served, currentBuild())) return;
    staleRef.current = true;
    try { await registrationRef.current.update(); } catch { /* réessai au prochain contrôle */ }
    applyIfSafe();
  }

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void checkVersion(); };
    document.addEventListener("visibilitychange", onVisible);
    const retry = setInterval(applyIfSafe, VERSION_RETRY_MS);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { applyIfSafe(); }, [needRefresh]);

  useEffect(() => {
    if (!needRefresh || !dismissed) return;
    const onVisible = () => { if (document.visibilityState === "visible") setDismissed(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [needRefresh, dismissed]);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="status"
      // En haut : le bas de l'écran athlète est occupé (onglets, minuteur, reprise de séance).
      className="fixed left-1/2 top-[calc(8px+env(safe-area-inset-top,0px))] z-[1000] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded-[6px] border border-agon-brd-l bg-agon-s1 py-2 pl-3.5 pr-2.5 text-[12px] font-semibold text-agon-tx shadow-[0_6px_24px_rgba(0,0,0,0.45)]"
    >
      <span>Nouvelle version disponible</span>
      <button
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          void updateRef.current?.(true);
        }}
        className="cursor-pointer rounded-[4px] border-none bg-agon-accent px-2.5 py-[5px] font-[inherit] text-[12px] font-bold text-agon-ink"
      >
        {reloading ? "…" : "Recharger"}
      </button>
      <button
        aria-label="Plus tard"
        onClick={() => setDismissed(true)}
        className="cursor-pointer border-none bg-transparent px-1.5 py-1 font-[inherit] text-[14px] text-agon-tx3"
      >
        ×
      </button>
    </div>
  );
}
