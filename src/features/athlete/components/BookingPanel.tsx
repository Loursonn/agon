import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import {
  CALENDLY_MIN_HEIGHT,
  buildCalendlyEmbedUrl,
  buildCalendlyFallbackUrl,
  isCalendlyScheduledMessage,
} from "@/lib/booking";

interface Props {
  /** Lien Calendly du coach (déjà validé par le hook). */
  bookingUrl: string;
  coachName: string;
  athleteName?: string | null;
  athleteEmail?: string | null;
  onClose: () => void;
  /** Appelé quand Calendly confirme un créneau. */
  onScheduled: () => void;
}

/**
 * Panneau plein écran avec le widget Calendly en iframe inline.
 *
 * Pas d'API Calendly, pas de script tiers : juste l'iframe plus l'écoute du
 * postMessage `calendly.event_scheduled`, dont on vérifie l'origine.
 */
export default function BookingPanel({
  bookingUrl,
  coachName,
  athleteName,
  athleteEmail,
  onClose,
  onScheduled,
}: Props) {
  const [loaded, setLoaded] = useState(false);

  const embedUrl = useMemo(
    () =>
      buildCalendlyEmbedUrl({
        url: bookingUrl,
        name: athleteName,
        email: athleteEmail,
        // Calendly n'émet ses postMessage que si embed_domain correspond à l'hôte.
        embedDomain: typeof window === "undefined" ? null : window.location.hostname,
      }),
    [bookingUrl, athleteName, athleteEmail],
  );

  const fallbackUrl = useMemo(() => buildCalendlyFallbackUrl(bookingUrl), [bookingUrl]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isCalendlyScheduledMessage(event)) return;
      onScheduled();
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onScheduled]);

  // Échap pour fermer, et on bloque le scroll du fond pendant le plein écran.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: C.bg, display: "flex", flexDirection: "column",
      }}
    >
      {/* En-tête */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", borderBottom: "1px solid " + C.brd,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{
            width: 28, height: 28, borderRadius: 4,
            border: "1px solid " + C.brdL, background: "transparent",
            color: C.tx2, fontSize: 18, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          ×
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Mon point hebdo</div>
          <div
            style={{
              fontSize: 11, color: C.tx3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            avec {coachName}
          </div>
        </div>
      </div>

      {/* Widget */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {embedUrl ? (
          <>
            {!loaded && (
              <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 12, color: C.tx3 }}>
                Chargement des créneaux…
              </div>
            )}
            <iframe
              src={embedUrl}
              title="Réserver le point hebdo"
              onLoad={() => setLoaded(true)}
              // La hauteur mini évite un scroll imbriqué sur mobile : Calendly
              // gère sa propre mise en page dès qu'il a la place.
              style={{
                display: loaded ? "block" : "none",
                width: "100%", border: "none",
                height: "100%", minHeight: CALENDLY_MIN_HEIGHT,
              }}
            />
          </>
        ) : (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 12, color: C.tx3 }}>
            Le lien de réservation de ton coach est invalide. Préviens-le.
          </div>
        )}
      </div>

      {/* Secours : si l'iframe est bloquée (bloqueur, webview), on sort du cadre. */}
      {fallbackUrl && (
        <div
          style={{
            padding: "10px 14px", borderTop: "1px solid " + C.brd,
            textAlign: "center", flexShrink: 0,
          }}
        >
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: C.tx3, textDecoration: "underline" }}
          >
            Ouvrir dans Calendly
          </a>
        </div>
      )}
    </div>
  );
}
