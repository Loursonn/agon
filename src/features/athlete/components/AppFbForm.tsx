import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import type { AppFeedbackEntry } from "@/features/shared/types/athlete";

interface Props {
  onClose: () => void;
}

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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, padding: 32 }}>
      <div style={{ fontSize: 40 }}></div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.g }}>Merci !</div>
      <div style={{ fontSize: 13, color: C.tx2 }}>Ton avis nous aide à améliorer l'app.</div>
    </div>
  );

  return (
    <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px", marginBottom: 6 }}>Donne ton avis</div>
        <div style={{ fontSize: 13, color: C.tx2 }}>Ton retour nous aide à améliorer l'expérience. Ça prend 30 secondes.</div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 10 }}>Note globale</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRating(n)} style={{ fontSize: 32, background: "none", border: "none", cursor: "pointer", opacity: rating && n <= rating ? 1 : 0.3, transform: rating === n ? "scale(1.2)" : "scale(1)", transition: "all 0.15s", padding: "4px 6px" }}></button>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: C.tx3, marginTop: 6 }}>
          {rating === 1 ? "À améliorer" : rating === 2 ? "Moyen" : rating === 3 ? "Correct" : rating === 4 ? "Bien" : rating === 5 ? "Excellent !" : ""}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 8 }}>Commentaire (optionnel)</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ce que tu aimes, ce qui manque, un bug rencontré..." rows={4} style={{ width: "100%", padding: "12px 14px", borderRadius: 6, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }} />
      </div>
      <button onClick={submit} disabled={!rating || sending} style={{ padding: "14px 0", borderRadius: 6, border: "none", background: rating ? C.ac : "#333", color: rating ? "#fff" : C.tx3, fontSize: 14, fontWeight: 700, cursor: rating ? "pointer" : "default", fontFamily: "inherit", opacity: sending ? 0.7 : 1 }}>
        {sending ? "Envoi…" : "Envoyer mon avis"}
      </button>
    </div>
  );
}
