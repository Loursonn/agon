/**
 * SessionEndForm — post-session feedback form.
 * RPE (1-10), respected (oui/adaptée), free text comment.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onSubmit: (data: { rpe: number; respected: boolean; comment: string }) => void;
  isPending?: boolean;
}

const LABEL = "mb-2 block text-[12px] font-semibold text-agon-tx3";
const CHOICE = "cursor-pointer rounded-[4px] border font-semibold";
const IDLE = "border-agon-brd bg-agon-s2 text-agon-tx3";

export default function SessionEndForm({ onSubmit, isPending }: Props) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [respected, setRespected] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");

  function handleSubmit() {
    onSubmit({
      rpe: rpe ?? 5,
      respected: respected ?? true,
      comment: comment.trim(),
    });
  }

  return (
    <div className="rounded-[6px] border border-agon-brd bg-agon-s1 p-[18px]">
      {/* RPE */}
      <div className="mb-4">
        <label className={LABEL}>RPE global (1-10)</label>
        <div className="flex flex-wrap gap-[5px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
            <button
              key={v}
              onClick={() => setRpe(v)}
              className={cn(
                "min-w-[30px] flex-1 cursor-pointer rounded-[4px] border py-[9px] text-[13px] font-bold",
                rpe === v ? "border-agon-erreur bg-agon-erreur/[0.15] text-agon-erreur" : IDLE,
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Respected */}
      <div className="mb-4">
        <label className={LABEL}>Séance respectée ?</label>
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <button
            onClick={() => setRespected(true)}
            className={cn(CHOICE, "p-2.5", respected === true ? "border-agon-succes bg-agon-succes/[0.1] text-agon-succes" : IDLE)}
          >
            Oui ✓
          </button>
          <button
            onClick={() => setRespected(false)}
            className={cn(CHOICE, "p-2.5", respected === false ? "border-agon-alerte bg-agon-alerte/[0.1] text-agon-alerte" : IDLE)}
          >
            Adaptée
          </button>
        </div>
      </div>

      {/* Comment */}
      <div className="mb-4">
        <label className={LABEL}>Ressenti / commentaire</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Dernier tour dur, cardio ok…"
          className="box-border w-full resize-y rounded-[4px] border border-agon-brd bg-agon-s2 px-3 py-2.5 text-[14px] text-agon-tx [outline:none]"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className={cn(
          "w-full cursor-pointer rounded-[6px] border-none bg-agon-succes p-[13px] text-[15px] font-bold text-agon-ink",
          isPending ? "opacity-70" : "opacity-100",
        )}
      >
        {isPending ? "Enregistrement…" : "Terminer la séance"}
      </button>
    </div>
  );
}
