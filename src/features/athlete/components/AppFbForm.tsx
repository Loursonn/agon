import { useState } from "react";
import { CircleCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import type { AppFeedbackEntry } from "@/features/shared/types/athlete";

interface Props {
  onClose: () => void;
}

const LABEL = "text-[12px] font-semibold uppercase tracking-[0.5px] text-agon-tx3";

export default function AppFbForm({ onClose }: Props) {
  const { addAppFeedback } = useAthleteContext();
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!rating || sending) return;
    setSending(true);
    const entry: AppFeedbackEntry = { id: "fb_" + Date.now(), date: new Date().toISOString(), rating, text: text.trim() };
    await addAppFeedback(entry);
    setSending(false);
    setDone(true);
    setTimeout(onClose, 1500);
  };

  if (done) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <CircleCheck size={40} strokeWidth={1.5} className="text-agon-succes" aria-hidden />
      <div className="text-[18px] font-extrabold text-agon-succes">Merci !</div>
      <div className="text-[13px] text-agon-tx2">Ton avis nous aide à améliorer l'app.</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <div>
        <div className="mb-1.5 text-[22px] font-black tracking-[-0.5px]">Donne ton avis</div>
        <div className="text-[13px] text-agon-tx2">Ton retour nous aide à améliorer l'expérience. Ça prend 30 secondes.</div>
      </div>
      <div>
        <div className={cn(LABEL, "mb-2.5")}>Note globale</div>
        <div className="flex justify-center gap-2.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRating(n)}
              aria-label={`${n} sur 5`}
              aria-pressed={rating === n}
              className={cn(
                "cursor-pointer border-none bg-transparent px-1.5 py-1 [transition:all_0.15s]",
                rating && n <= rating ? "text-agon-accent" : "text-agon-tx3 opacity-50",
                rating === n ? "scale-[1.2]" : "scale-100",
              )}
            >
              <Star size={32} strokeWidth={1.5} fill={rating && n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-center text-[12px] text-agon-tx3">
          {rating === 1 ? "À améliorer" : rating === 2 ? "Moyen" : rating === 3 ? "Correct" : rating === 4 ? "Bien" : rating === 5 ? "Excellent !" : ""}
        </div>
      </div>
      <div>
        <div className={cn(LABEL, "mb-2")}>Commentaire (optionnel)</div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ce que tu aimes, ce qui manque, un bug rencontré..."
          rows={4}
          className="box-border w-full resize-none rounded-[6px] border border-agon-brd-l bg-agon-s1 px-3.5 py-3 text-[13px] leading-[1.6] text-agon-tx [outline:none]"
        />
      </div>
      <button
        onClick={submit}
        disabled={!rating || sending}
        className={cn(
          "rounded-[6px] border-none py-3.5 text-[14px] font-bold",
          rating ? "cursor-pointer bg-agon-accent text-agon-ink" : "cursor-default bg-agon-s2 text-agon-tx3",
          sending ? "opacity-70" : "opacity-100",
        )}
      >
        {sending ? "Envoi…" : "Envoyer mon avis"}
      </button>
    </div>
  );
}
