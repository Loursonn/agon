import { Video, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { WorkoutBlocData } from "@/features/shared/hooks/useWorkoutSession";

/** Demande en attente (ocre) ou vidéo envoyée (vert) : couleurs de la charte. */
const tone = (ok: boolean) =>
  ok
    ? { text: "text-agon-succes", box: "bg-agon-succes/[0.08] border-agon-succes/[0.33]", row: "bg-agon-succes/[0.06] border-agon-succes/[0.27]", color: C.g }
    : { text: "text-agon-alerte", box: "bg-agon-alerte/[0.08] border-agon-alerte/[0.33]", row: "bg-agon-alerte/[0.06] border-agon-alerte/[0.27]", color: C.o };

/** Bandeau en tête de séance : nombre d'exercices pour lesquels le coach attend une vidéo. */
export function VideoRequestBanner({ blocs, videoSent }: { blocs: WorkoutBlocData[]; videoSent?: Record<string, boolean> }) {
  const requested = blocs.flatMap((b) => b.exercices.filter((ex) => ex.video_request));
  if (requested.length === 0) return null;
  const sent = requested.filter((ex) => videoSent?.[ex.id]).length;
  const allSent = sent === requested.length;
  const t = tone(allSent);

  return (
    <div className={cn("flex items-center gap-2.5 rounded-[6px] border px-3.5 py-2.5", t.box)}>
      <Video size={18} color={t.color} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13px] font-extrabold", t.text)}>
          {allSent ? "Retours vidéo envoyés" : "Retour vidéo demandé"}
        </div>
        <div className="mt-0.5 text-[11px] text-agon-tx2">
          {requested.map((ex) => ex.exercise_name).join(", ")}
          {" · "}envoie ta vidéo à ton coach puis coche « Vidéo envoyée »
        </div>
      </div>
      <span className={cn("shrink-0 text-[11px] font-extrabold", t.text)}>
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
  const t = tone(sent);
  return (
    <div className={cn("flex items-center gap-2 rounded-[6px] border px-3 py-2", t.row)}>
      <Video size={14} color={t.color} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className={cn("text-[12px] font-bold", t.text)}>
          Retour vidéo demandé{name ? ` · ${name}` : ""}
        </div>
        {note && <div className="mt-px text-[11px] text-agon-tx2">{note}</div>}
      </div>
      <button
        onClick={canToggle ? onToggle : undefined}
        disabled={!canToggle}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-[4px] border px-2.5 py-1.5 font-[inherit] text-[11px] font-bold",
          sent ? "border-agon-succes bg-agon-succes/[0.13] text-agon-succes" : "border-agon-brd-l bg-transparent text-agon-tx2",
          canToggle ? "cursor-pointer" : "cursor-default",
        )}
      >
        <span className={cn(
          "flex size-3.5 items-center justify-center rounded-[3px] border-2",
          sent ? "border-agon-succes bg-agon-succes" : "border-agon-brd-l bg-transparent",
        )}>
          {sent && <Check size={10} color={C.ink} strokeWidth={4} />}
        </span>
        Vidéo envoyée
      </button>
    </div>
  );
}
