import { C } from "@/lib/theme";
import { CARD, KICKER, MONO } from "./seanceUi";

/** Retour de l'athlète sur la séance prévue rattachée (RPE + commentaire). */
export function SeanceFeedbackCard({ title, rpe, comment }: { title: string; rpe: number | null; comment: string | null }) {
  return (
    <div style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={KICKER}>{title}</span>
      {rpe !== null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 30, color: rpe >= 8 ? C.r : rpe >= 6 ? C.o : C.g }}>{rpe}</span>
          <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>/ 10 · difficulté ressentie</span>
        </div>
      ) : (
        <span style={{ fontSize: 12.5, color: C.tx3 }}>Pas encore de retour sur cette séance.</span>
      )}
      {comment && <p style={{ margin: 0, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>« {comment} »</p>}
    </div>
  );
}
