import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { SW_UPDATE_CHECK_MS, currentSwEnvironment, shouldRegisterServiceWorker } from "@/lib/pwa";
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
    registered = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    import("virtual:pwa-register")
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
      .catch(() => { /* pas de SW : l'app marche comme avant, en ligne */ });
    return () => { if (interval) clearInterval(interval); };
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
      style={{
        position: "fixed",
        left: "50%",
        // En haut : le bas de l'écran athlète est occupé (onglets, minuteur, reprise de séance).
        top: "calc(8px + env(safe-area-inset-top, 0px))",
        transform: "translateX(-50%)",
        zIndex: 1000,
        maxWidth: "calc(100vw - 32px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px 8px 14px",
        borderRadius: 6,
        background: C.s1,
        border: "1px solid " + C.brdL,
        boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        color: C.tx,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span>Nouvelle version disponible</span>
      <button
        disabled={reloading}
        onClick={() => {
          setReloading(true);
          void updateRef.current?.(true);
        }}
        style={{ padding: "5px 10px", borderRadius: 4, border: "none", background: C.ac, color: C.bg, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
      >
        {reloading ? "…" : "Recharger"}
      </button>
      <button
        aria-label="Plus tard"
        onClick={() => setDismissed(true)}
        style={{ padding: "4px 6px", border: "none", background: "transparent", color: C.tx3, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
      >
        ×
      </button>
    </div>
  );
}
