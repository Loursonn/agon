import { useEffect, useLayoutEffect, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TIPS, TIPS_EVENT, pendingTip, setTip, tipPlacement } from "@/lib/onboarding";

type Box = { top: number; bottom: number; left: number; width: number; height: number };

/** Rectangle visible de la cible `[data-tip=…]` (un conteneur `display: contents` prend son 1er enfant). */
function targetBox(target: string): Box | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tip="${target}"]`))) {
    const node = getComputedStyle(el).display === "contents" ? (el.firstElementChild as HTMLElement | null) : el;
    const r = node?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

/**
 * Bulles d'aide d'Aujourd'hui après le premier lancement (planche
 * Ath1Onboarding, écran 04) : séance du jour, Programme, Tests. Chaque bulle
 * pointe sa cible (flèche + halo or) ; cible absente → bulle en bas d'écran.
 */
export function TodayTips({ uid }: { uid: string | null | undefined }) {
  const [index, setIndex] = useState<number | null>(() => pendingTip(uid));
  const [box, setBox] = useState<Box | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const sync = () => setIndex(pendingTip(uid));
    sync();
    window.addEventListener(TIPS_EVENT, sync);
    return () => window.removeEventListener(TIPS_EVENT, sync);
  }, [uid]);

  const target = index == null ? null : TIPS[index]?.target ?? null;
  useLayoutEffect(() => {
    if (!target) return;
    // La séance du jour peut être sous la ligne de flottaison : on l'amène à l'écran.
    const first = document.querySelector<HTMLElement>(`[data-tip="${target}"]`);
    const node = first && getComputedStyle(first).display === "contents" ? first.firstElementChild : first;
    if (target === "seance") (node as HTMLElement | null)?.scrollIntoView?.({ block: "center" });
    const measure = () => { setBox(targetBox(target)); setVp({ w: window.innerWidth, h: window.innerHeight }); };
    measure();
    const t = window.setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [target]);

  if (!uid || index == null) return null;
  const tip = TIPS[index];
  const last = index === TIPS.length - 1;
  const place = box && vp.w ? tipPlacement(box, vp.w, vp.h) : null;

  const card = (
    <>
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
    </>
  );
  const shell = { padding: 16, borderRadius: 16, background: C.s2, border: `1px solid ${alpha(C.ac, 0.5)}`, boxShadow: "0 12px 32px rgba(0,0,0,0.5)", boxSizing: "border-box" as const };

  if (!place || !box) {
    return (
      <div role="dialog" aria-label={`Astuce ${index + 1} sur ${TIPS.length}`} style={{ ...shell, position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)", zIndex: 150, maxWidth: 440, margin: "0 auto" }}>
        {card}
      </div>
    );
  }

  return (
    <>
      {/* Halo or autour de la cible */}
      <div aria-hidden style={{ position: "fixed", zIndex: 149, pointerEvents: "none", top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8, borderRadius: 14, boxShadow: `0 0 0 2px ${C.ac}, 0 0 0 9999px rgba(0,0,0,0.45)` }} />
      <div role="dialog" aria-label={`Astuce ${index + 1} sur ${TIPS.length}`} style={{
        ...shell, position: "fixed", zIndex: 150, left: place.left, width: place.width,
        ...(place.below ? { top: place.y } : { bottom: place.y }),
      }}>
        <span aria-hidden style={{
          position: "absolute", left: place.arrowX - 7, width: 14, height: 14, background: C.s2, transform: "rotate(45deg)",
          ...(place.below
            ? { top: -8, borderLeft: `1px solid ${alpha(C.ac, 0.5)}`, borderTop: `1px solid ${alpha(C.ac, 0.5)}` }
            : { bottom: -8, borderRight: `1px solid ${alpha(C.ac, 0.5)}`, borderBottom: `1px solid ${alpha(C.ac, 0.5)}` }),
        }} />
        {card}
      </div>
    </>
  );
}
