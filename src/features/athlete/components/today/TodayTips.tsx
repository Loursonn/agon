import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TIPS, TIPS_EVENT, pendingTip, setTip } from "@/lib/onboarding";

/**
 * Bulles d'aide d'Aujourd'hui après le premier lancement (planche
 * Ath1Onboarding, écran 04) : séance du jour, Programme, Tests.
 */
export function TodayTips({ uid }: { uid: string | null | undefined }) {
  const [index, setIndex] = useState<number | null>(() => pendingTip(uid));
  useEffect(() => {
    const sync = () => setIndex(pendingTip(uid));
    sync();
    window.addEventListener(TIPS_EVENT, sync);
    return () => window.removeEventListener(TIPS_EVENT, sync);
  }, [uid]);
  if (!uid || index == null) return null;
  const tip = TIPS[index];
  const last = index === TIPS.length - 1;
  return (
    <div role="dialog" aria-label={`Astuce ${index + 1} sur ${TIPS.length}`} style={{
      position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)", zIndex: 150, maxWidth: 440, margin: "0 auto",
      padding: 16, borderRadius: 16, background: C.s2, border: `1px solid ${C.ac}80`, boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ac, whiteSpace: "nowrap" }}>Astuce {index + 1} / {TIPS.length}</span>
        <button type="button" onClick={() => setTip(uid, null)} style={{ fontSize: 12.5, color: C.tx3, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>Passer</button>
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, marginTop: 8, color: C.tx }}>{tip.title}</div>
      <div style={{ fontSize: 13, color: C.tx2, marginTop: 4, lineHeight: 1.5 }}>{tip.text}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" onClick={() => setTip(uid, index + 1)} style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: C.ac, color: C.bg, fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
          {last ? "Compris" : "Suivant"}
        </button>
      </div>
    </div>
  );
}
