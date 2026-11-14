import { useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
      <div className="flex items-center justify-between">
        <span className="agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-accent">Astuce {index + 1} / {TIPS.length}</span>
        <button type="button" onClick={() => setTip(uid, null)} className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[12.5px] text-agon-tx3">Passer</button>
      </div>
      <div className="mt-2 text-[15px] font-medium text-agon-tx">{tip.title}</div>
      <div className="mt-1 text-[13px] leading-[1.5] text-agon-tx2">{tip.text}</div>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => setTip(uid, index + 1)} className="h-9 cursor-pointer rounded-[10px] border-none bg-agon-accent px-4 font-[inherit] text-[13.5px] font-semibold text-agon-ink">
          {last ? "Compris" : "Suivant"}
        </button>
      </div>
    </>
  );
  const shell = "box-border rounded-2xl border border-agon-accent/50 bg-agon-s2 p-4 shadow-[0_12px_32px] shadow-black/50";

  if (!place || !box) {
    return (
      <div
        role="dialog"
        aria-label={`Astuce ${index + 1} sur ${TIPS.length}`}
        className={cn(shell, "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[150] mx-auto max-w-[440px]")}
      >
        {card}
      </div>
    );
  }

  return (
    <>
      {/* Halo or autour de la cible */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[149] rounded-[14px] shadow-[0_0_0_9999px] shadow-black/[0.45] ring-2 ring-agon-accent"
        style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
      />
      <div
        role="dialog"
        aria-label={`Astuce ${index + 1} sur ${TIPS.length}`}
        className={cn(shell, "fixed z-[150]")}
        style={{ left: place.left, width: place.width, ...(place.below ? { top: place.y } : { bottom: place.y }) }}
      >
        <span
          aria-hidden
          className={cn(
            "absolute size-3.5 rotate-45 bg-agon-s2",
            place.below ? "-top-2 border-l border-t border-agon-accent/50" : "-bottom-2 border-b border-r border-agon-accent/50",
          )}
          style={{ left: place.arrowX - 7 }}
        />
        {card}
      </div>
    </>
  );
}
