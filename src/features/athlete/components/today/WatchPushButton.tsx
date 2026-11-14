import { Check, Loader2, Watch } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useAuth } from "@/hooks/useAuth";
import { connectionFor, useProviderConnections, usePushWorkoutNow, useWorkoutPushes } from "@/features/shared/hooks/useProviderConnections";
import { localIsoDay } from "@shared/domain/dates";
import { watchPushState } from "@/lib/watchPush";

const MONTRES = "/athlete/montres";

/** Refus qui se règlent dans l'écran Montres (interrupteur, reconnexion). */
const TO_MONTRES = new Set(["envoi_coupe", "permission_absente", "reconnexion", "pas_de_garmin"]);

const BLOCKED_TEXT = {
  off: "L'envoi des séances sur ta montre est coupé. Active-le dans Montres.",
  no_permission: "Garmin n'autorise pas l'import de séances. Reconnecte Garmin en cochant « Workout Import ».",
  reauth: "Garmin demande de reconnecter ton compte.",
} as const;

/**
 * « Envoyer sur ma montre » : pousse cette séance prévue dans le calendrier
 * Garmin Connect tout de suite, même au-delà des 7 jours envoyés
 * automatiquement. Déjà envoyée : « Sur ta montre », un appui la renvoie.
 * Athlète seulement, et seulement sur ses propres séances.
 */
export function WatchPushButton({
  athleteId, kind, sourceId, sessionStatus, date,
}: {
  athleteId: string | null | undefined;
  kind: "energy" | "strength";
  sourceId: string | null | undefined;
  sessionStatus: string | null | undefined;
  date: string | null | undefined;
}) {
  const { user } = useAuth();
  const own = !!user && !!athleteId && user.id === athleteId;
  const { data: connections } = useProviderConnections();
  const { data: pushes } = useWorkoutPushes(own ? athleteId ?? undefined : undefined);
  const push = usePushWorkoutNow();
  const navigate = useNavigate();

  if (!own || !sourceId) return null;
  const sent = (pushes ?? []).some((p) => p.provider === "garmin" && p.sourceKind === kind && p.sourceId === sourceId && p.status === "sent");
  const state = watchPushState({ connection: connectionFor(connections, "garmin"), sessionStatus, date, today: localIsoDay(), sent });
  if (state === "hidden") return null;

  if (state === "sent_only") {
    return (
      <span title="Envoyée sur ta montre Garmin" style={{ ...MONO, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx2 }}>
        <Watch size={12} aria-hidden /> Sur ta montre
      </span>
    );
  }

  const goMontres = { label: "Montres", onClick: () => navigate(MONTRES) };

  const onClick = () => {
    if (state === "off" || state === "no_permission" || state === "reauth") {
      toast(BLOCKED_TEXT[state], { action: goMontres });
      return;
    }
    push.mutate(
      { kind, sourceId },
      {
        onSuccess: (r) => {
          if (r.status === "sent") {
            toast.success(sent ? "Séance renvoyée sur ta montre" : "Séance envoyée sur ta montre", {
              description: r.warnings.length ? `${r.message} ${r.warnings.join(" ")}` : r.message,
            });
          } else {
            toast.error(r.status === "rejected" ? "Séance non envoyée" : "Envoi pas encore fait", { description: r.message });
          }
        },
        onError: (e) => {
          if (e.code && TO_MONTRES.has(e.code)) toast(e.message, { action: goMontres });
          else toast.error("Envoi non fait", { description: e.message });
        },
      },
    );
  };

  const pending = push.isPending;
  const label = pending ? "Envoi…" : state === "sent" ? "Sur ta montre" : "Envoyer sur ma montre";
  const Icon = pending ? Loader2 : state === "sent" ? Check : Watch;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={state === "sent" ? "Sur ta montre Garmin : renvoyer la séance" : "Envoyer la séance sur ma montre Garmin"}
      title={state === "sent" ? "Déjà dans ton calendrier Garmin Connect. Appuie pour la renvoyer." : "Envoyer cette séance dans ton calendrier Garmin Connect"}
      style={{
        ...MONO, display: "inline-flex", alignItems: "center", gap: 5, flex: "none",
        height: 28, padding: "0 10px", borderRadius: 999,
        border: `1px solid ${C.brdL}`, background: "transparent",
        color: state === "ready" ? C.tx : C.tx2,
        fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      <Icon size={12} aria-hidden className={pending ? "animate-spin" : undefined} /> {label}
    </button>
  );
}
