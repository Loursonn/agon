import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
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
    <div className="fixed inset-0 z-[300] flex flex-col bg-agon-bg">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-agon-brd px-3.5 py-3">
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-[18px] text-agon-tx2"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-agon-tx">Mon point hebdo</div>
          <div className="truncate text-[11px] text-agon-tx3">
            avec {coachName}
          </div>
        </div>
      </div>

      {/* Widget */}
      <div className="flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">
        {embedUrl ? (
          <>
            {!loaded && (
              <div className="px-4 py-8 text-center text-[12px] text-agon-tx3">
                Chargement des créneaux…
              </div>
            )}
            <iframe
              src={embedUrl}
              title="Réserver le point hebdo"
              onLoad={() => setLoaded(true)}
              // La hauteur mini évite un scroll imbriqué sur mobile : Calendly
              // gère sa propre mise en page dès qu'il a la place.
              className={cn("h-full w-full border-none", loaded ? "block" : "hidden")}
              style={{ minHeight: CALENDLY_MIN_HEIGHT }}
            />
          </>
        ) : (
          <div className="px-4 py-8 text-center text-[12px] text-agon-tx3">
            Le lien de réservation de ton coach est invalide. Préviens-le.
          </div>
        )}
      </div>

      {/* Secours : si l'iframe est bloquée (bloqueur, webview), on sort du cadre. */}
      {fallbackUrl && (
        <div className="shrink-0 border-t border-agon-brd px-3.5 py-2.5 text-center">
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-agon-tx3 underline"
          >
            Ouvrir dans Calendly
          </a>
        </div>
      )}
    </div>
  );
}
