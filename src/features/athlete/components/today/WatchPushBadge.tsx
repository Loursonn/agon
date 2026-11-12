import { Watch } from "lucide-react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useWorkoutPushes } from "@/features/shared/hooks/useProviderConnections";

/**
 * « Sur ta montre » : la séance a été envoyée dans le calendrier Garmin
 * Connect (elle arrive sur la montre à la prochaine synchronisation).
 * Rien tant que l'envoi n'a pas réussi.
 */
export function WatchPushBadge({ athleteId, kind, sourceId }: { athleteId: string | null | undefined; kind: "energy" | "strength"; sourceId: string | null | undefined }) {
  const { data } = useWorkoutPushes(athleteId ?? undefined);
  const sent = !!sourceId && (data ?? []).some((p) => p.sourceKind === kind && p.sourceId === sourceId && p.status === "sent");
  if (!sent) return null;
  return (
    <span title="Envoyée sur ta montre Garmin" style={{ ...MONO, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.tx2 }}>
      <Watch size={12} aria-hidden /> Sur ta montre
    </span>
  );
}
