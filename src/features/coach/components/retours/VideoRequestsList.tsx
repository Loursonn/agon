import { Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VideoRequestStatus } from "@/features/shared/types/retours.types";

/** Envoyée → vert de la charte ; en attente → alerte (remplace le miel hérité). */
const TONE = {
  sent: { text: "text-agon-succes", row: "border-agon-succes/25 bg-agon-succes/[0.071]" },
  pending: { text: "text-agon-alerte", row: "border-agon-alerte/25 bg-agon-alerte/[0.071]" },
};

/** Pastille compacte « 🎥 1/2 » : vidéos envoyées / demandées. */
export function VideoRequestsPill({ requests }: { requests?: VideoRequestStatus[] }) {
  if (!requests?.length) return null;
  const sent = requests.filter((r) => r.sent).length;
  const tone = sent === requests.length ? TONE.sent : TONE.pending;
  return (
    <span
      title={requests.map((r) => `${r.exercise_name} : ${r.sent ? "vidéo envoyée" : "pas envoyée"}`).join("\n")}
      className={cn("inline-flex shrink-0 items-center gap-0.5 text-[8px] font-extrabold", tone.text)}
    >
      <Video size={9} /> {sent}/{requests.length}
    </span>
  );
}

/** Liste détaillée des retours vidéo demandés et de leur suivi. */
export function VideoRequestsList({ requests }: { requests?: VideoRequestStatus[] }) {
  if (!requests?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {requests.map((r) => {
        const tone = r.sent ? TONE.sent : TONE.pending;
        return (
          <div key={r.exercise_id} className={cn("flex items-center gap-1.5 rounded-[4px] border px-2 py-[5px] text-[11px]", tone.row)}>
            <Video size={12} className={cn("shrink-0", tone.text)} />
            <span className="font-bold text-agon-tx">{r.exercise_name}</span>
            {r.note && <span className="truncate text-agon-tx3">· {r.note}</span>}
            <span className={cn("ml-auto shrink-0 font-bold", tone.text)}>
              {r.sent ? "Vidéo envoyée" : "Pas envoyée"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
