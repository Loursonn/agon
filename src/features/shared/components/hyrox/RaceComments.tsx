import { useState } from "react";
import { Send } from "lucide-react";
import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { useUpdateHyroxResult } from "@/features/shared/hooks/hyrox/useHyroxResults";
import type { HyroxResult } from "@/features/shared/types/hyrox";

/** Commentaires de la course (athlète, coach), sous l'analyse. Rien si aucun. */
export function RaceComments({ race }: { race: HyroxResult }) {
  if (!race.athlete_comment && !race.coach_comment) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={KICKER}>Commentaires</span>
      <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {race.athlete_comment && (
          <div><div style={LABEL}>Athlète</div><div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{race.athlete_comment}</div></div>
        )}
        {race.coach_comment && (
          <div><div style={LABEL}>Coach</div><div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{race.coach_comment}</div></div>
        )}
      </div>
    </div>
  );
}

/**
 * « En parler à {coach} » (athlète, onglet Gains) : écrit le commentaire de
 * la course, visible par le coach sous l'analyse.
 */
export function TalkToCoach({ race, coachFirstName }: { race: HyroxResult; coachFirstName: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(race.athlete_comment ?? "");
  const update = useUpdateHyroxResult(race.athlete_id);
  const who = coachFirstName ?? "ton coach";
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...buttonStyle("primary"), height: 48, fontSize: 14, width: "100%" }}>
        <Send size={15} /> En parler à {who}
      </button>
    );
  }
  return (
    <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <label htmlFor="race-comment" style={LABEL}>Ton message à {who} sur cette course</label>
      <textarea id="race-comment" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000}
        placeholder="Ce que tu as ressenti, ce que tu veux travailler…"
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, padding: 10, fontSize: 14, fontFamily: "inherit" }} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={() => setOpen(false)} style={buttonStyle()}>Annuler</button>
        <button type="button" disabled={update.isPending}
          onClick={() => update.mutate({ id: race.id, athlete_comment: text.trim() || null }, { onSuccess: () => setOpen(false) })}
          style={buttonStyle("primary", update.isPending)}>
          Envoyer
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: C.tx3 }}>{who} le lira sous l'analyse de la course.</div>
    </div>
  );
}
