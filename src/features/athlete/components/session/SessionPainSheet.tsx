import { useState } from "react";
import { SessionPainQuestion } from "@/features/athlete/components/session/SessionPainQuestion";
import { type SessionPainTarget, useSaveSessionPain } from "@/features/shared/hooks/useSessionPain";
import { EMPTY_SESSION_PAIN, sessionPainPayload, type SessionPainAnswer } from "@/lib/sessionPain";

/**
 * Feuille du bas « Une douleur pendant la séance ? », pour les fins de séance
 * qui n'ont pas d'écran RPE (séance classique validée depuis le Programme).
 * « Passer » ou Non : rien n'est écrit.
 */
export function SessionPainSheet({
  target,
  athleteId,
  onClose,
}: {
  target: SessionPainTarget;
  athleteId: string;
  onClose: () => void;
}) {
  const [pain, setPain] = useState<SessionPainAnswer>(EMPTY_SESSION_PAIN);
  const save = useSaveSessionPain();
  const payload = sessionPainPayload(pain);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-agon-ink/[0.65]" />
      <div className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[6px] border-t border-agon-brd bg-agon-s1 px-5 pb-10 pt-6">
        <div className="mx-auto mb-5 h-1 w-9 rounded-[2px] bg-agon-brd-l" />
        <div className="mb-4 text-[16px] font-extrabold text-agon-tx">Séance validée</div>
        <SessionPainQuestion value={pain} onChange={setPain} />
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            if (payload) save.mutate({ target, athleteId, ...payload }, { onSettled: onClose });
            else onClose();
          }}
          className={
            "mt-6 w-full rounded-[6px] border-none py-[15px] font-[inherit] text-[14px] font-bold " +
            (payload ? "cursor-pointer bg-agon-accent text-agon-ink" : "cursor-pointer bg-agon-s2 text-agon-tx2")
          }
        >
          {save.isPending ? "Enregistrement…" : payload ? "Enregistrer" : "Terminer"}
        </button>
        <button type="button" onClick={onClose} className="mt-3 w-full cursor-pointer border-none bg-transparent py-2.5 font-[inherit] text-[13px] text-agon-tx3">
          Passer
        </button>
      </div>
    </>
  );
}
