import { useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useSendAppFeedback, FEEDBACK_KIND_LABEL } from "@/features/shared/hooks/useAppFeedback";
import type { AppFeedbackKind } from "@/features/shared/hooks/useAppFeedback";

const KINDS: { k: AppFeedbackKind; emoji: string }[] = [
  { k: "bug", emoji: "BG" }, { k: "idea", emoji: "ID" }, { k: "other", emoji: "MS" },
];

/** Bas de "Mon profil" : signaler un bug / proposer une idée → table app_feedback (vue coach "Avis athlètes"). */
export function AppFeedbackSection() {
  const { user } = useAuth();
  const location = useLocation();
  const send = useSendAppFeedback();
  const [kind, setKind] = useState<AppFeedbackKind>("bug");
  const [text, setText] = useState("");

  const submit = () => {
    const content = text.trim();
    if (!content || !user?.id) return;
    send.mutate(
      { authorId: user.id, kind, content, page: location.pathname },
      {
        onSuccess: () => { setText(""); toast.success("Merci, ton retour a bien été envoyé"); },
        onError: () => toast.error("Envoi impossible, réessaie plus tard"),
      },
    );
  };

  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "14px 14px 12px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 2 }}>Signaler un bug / une idée</div>
      <div style={{ fontSize: 11, color: C.tx3, marginBottom: 10 }}>Ton retour arrive directement à l'équipe pour améliorer l'app.</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {KINDS.map(({ k, emoji }) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            style={{
              flex: 1, padding: "6px 0", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              border: "1px solid " + (kind === k ? C.ac : C.brd), background: kind === k ? C.acS : "transparent", color: kind === k ? C.ac : C.tx2,
            }}
          >
            {emoji} {FEEDBACK_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={4000}
        rows={3}
        placeholder={kind === "bug" ? "Que s'est-il passé ? Sur quelle page ?" : kind === "idea" ? "Quelle fonctionnalité aimerais-tu ?" : "Ton message…"}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim() || send.isPending}
        style={{
          width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 4, border: "none", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
          background: text.trim() ? C.ac : C.s2, color: text.trim() ? "#fff" : C.tx3, cursor: text.trim() ? "pointer" : "default",
        }}
      >
        {send.isPending ? "Envoi…" : "Envoyer"}
      </button>
    </div>
  );
}
