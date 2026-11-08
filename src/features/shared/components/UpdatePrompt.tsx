import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { SW_UPDATE_CHECK_MS, currentSwEnvironment, shouldRegisterServiceWorker } from "@/lib/pwa";

let registered = false;

/**
 * Enregistre le service worker et propose la nouvelle version quand elle est
 * prête : « Nouvelle version disponible — Recharger ». Jamais de rechargement
 * automatique (séance en cours). Les brouillons locaux protègent la saisie si
 * l'athlète recharge en pleine séance.
 */
export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  // « × » ne cache l'invite que jusqu'au prochain retour sur l'onglet : un
  // onglet coach ouvert des jours ne doit pas rester sur l'ancienne version.
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (registered || !shouldRegisterServiceWorker(currentSwEnvironment())) return;
    registered = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        updateRef.current = registerSW({
          onNeedRefresh: () => setNeedRefresh(true),
          onRegisteredSW: (_url, registration) => {
            if (!registration) return;
            interval = setInterval(() => {
              if (navigator.onLine) registration.update().catch(() => { /* réessai à la prochaine heure */ });
            }, SW_UPDATE_CHECK_MS);
          },
        });
      })
      .catch(() => { /* pas de SW : l'app marche comme avant, en ligne */ });
    return () => { if (interval) clearInterval(interval); };
  }, []);

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
