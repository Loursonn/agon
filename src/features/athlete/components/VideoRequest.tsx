import { Video, Check } from "lucide-react";
import { C } from "@/lib/theme";
import type { WorkoutBlocData } from "@/features/shared/hooks/useWorkoutSession";

const AMBER = "#F5A623";
const GREEN = "#22c55e";

/** Bandeau en tête de séance : nombre d'exercices pour lesquels le coach attend une vidéo. */
export function VideoRequestBanner({ blocs, videoSent }: { blocs: WorkoutBlocData[]; videoSent?: Record<string, boolean> }) {
  const requested = blocs.flatMap((b) => b.exercices.filter((ex) => ex.video_request));
  if (requested.length === 0) return null;
  const sent = requested.filter((ex) => videoSent?.[ex.id]).length;
  const allSent = sent === requested.length;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: 6,
      background: (allSent ? GREEN : AMBER) + "14",
      border: "1px solid " + (allSent ? GREEN : AMBER) + "55",
    }}>
      <Video size={18} color={allSent ? GREEN : AMBER} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: allSent ? GREEN : AMBER }}>
          {allSent ? "Retours vidéo envoyés" : "Retour vidéo demandé"}
        </div>
        <div style={{ fontSize: 11, color: C.tx2, marginTop: 2 }}>
          {requested.map((ex) => ex.exercise_name).join(", ")}
          {" · "}envoie ta vidéo à ton coach puis coche « Vidéo envoyée »
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color: allSent ? GREEN : AMBER, flexShrink: 0 }}>
        {sent}/{requested.length}
      </span>
    </div>
  );
}

/** Ligne sous un exercice : consigne vidéo + case « Vidéo envoyée ». */
export function VideoRequestRow({
  name, note, sent, canToggle, onToggle,
}: {
  name?: string;
  note?: string;
  sent: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  const color = sent ? GREEN : AMBER;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", borderRadius: 6,
      background: color + "10", border: "1px solid " + color + "45",
    }}>
      <Video size={14} color={color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>
          Retour vidéo demandé{name ? ` · ${name}` : ""}
        </div>
        {note && <div style={{ fontSize: 11, color: C.tx2, marginTop: 1 }}>{note}</div>}
      </div>
      <button
        onClick={canToggle ? onToggle : undefined}
        disabled={!canToggle}
        style={{
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          padding: "6px 10px", borderRadius: 4, fontFamily: "inherit",
          border: "1px solid " + (sent ? GREEN : C.brdL),
          background: sent ? GREEN + "22" : "transparent",
          color: sent ? GREEN : C.tx2, fontSize: 11, fontWeight: 700,
          cursor: canToggle ? "pointer" : "default",
        }}
      >
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          border: "2px solid " + (sent ? GREEN : C.brdL),
          background: sent ? GREEN : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {sent && <Check size={10} color="#0E0C0A" strokeWidth={4} />}
        </span>
        Vidéo envoyée
      </button>
    </div>
  );
}
