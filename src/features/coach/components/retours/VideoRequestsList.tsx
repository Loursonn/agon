import { Video } from "lucide-react";
import { C } from "@/lib/theme";
import type { VideoRequestStatus } from "@/features/shared/types/retours.types";

const AMBER = "#F5A623";
const GREEN = "#22c55e";

/** Pastille compacte « 🎥 1/2 » : vidéos envoyées / demandées. */
export function VideoRequestsPill({ requests }: { requests?: VideoRequestStatus[] }) {
  if (!requests?.length) return null;
  const sent = requests.filter((r) => r.sent).length;
  const color = sent === requests.length ? GREEN : AMBER;
  return (
    <span
      title={requests.map((r) => `${r.exercise_name} : ${r.sent ? "vidéo envoyée" : "pas envoyée"}`).join("\n")}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 8, fontWeight: 800, color, flexShrink: 0 }}
    >
      <Video size={9} /> {sent}/{requests.length}
    </span>
  );
}

/** Liste détaillée des retours vidéo demandés et de leur suivi. */
export function VideoRequestsList({ requests }: { requests?: VideoRequestStatus[] }) {
  if (!requests?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {requests.map((r) => {
        const color = r.sent ? GREEN : AMBER;
        return (
          <div key={r.exercise_id} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px", borderRadius: 4,
            background: color + "12", border: "1px solid " + color + "40",
            fontSize: 11,
          }}>
            <Video size={12} color={color} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: C.tx }}>{r.exercise_name}</span>
            {r.note && <span style={{ color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {r.note}</span>}
            <span style={{ marginLeft: "auto", fontWeight: 700, color, flexShrink: 0 }}>
              {r.sent ? "Vidéo envoyée" : "Pas envoyée"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
