import { useEffect, useMemo, useState } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { tipPlacement } from "@/lib/onboarding";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
const DOW_LETTER = ["L", "M", "M", "J", "V", "S", "D"];

const TX2 = C.tx2;
const TX3 = C.pierre;

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

/**
 * Options d'une séance (planche « Programme — déplacer une séance ») :
 * déplacer à un jour de la semaine (jours passés grisés), passer en repos,
 * voir le détail. La semaine suivante s'ajoute quand il reste moins de
 * 3 jours dans la semaine en cours.
 */
export function RescheduleSheet({
  sessionName, scheduledDate, today, weekMondayISO, typeColor, typeLabel,
  missed, onConfirm, onRest, onDetail, isPending, onClose,
}: {
  sessionName: string;
  scheduledDate: string;
  today: string;
  weekMondayISO: string;
  typeColor: string;
  typeLabel: string;
  /** Séance manquée : « Manquée » au lieu de « Prévue ». */
  missed?: boolean;
  onConfirm: (newDate: string) => void;
  onRest?: () => void;
  onDetail?: () => void;
  isPending?: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState("");
  // Ordinateur (planche AthOrdiAProgramme) : popover ancré sur le bouton qui l'a ouvert.
  const isDesktop = useIsDesktop();
  const [anchor] = useState(() => {
    const el = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const r = el && el !== document.body ? el.getBoundingClientRect() : null;
    return r && r.width > 0 ? { top: r.top, bottom: r.bottom, left: r.left, width: r.width } : null;
  });
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, onClose]);
  const days = useMemo(() => {
    const mon = new Date(weekMondayISO + "T12:00:00");
    const make = (i: number) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return { iso: isoOf(d), dow: (d.getDay() + 6) % 7, num: d.getDate() }; };
    const week = Array.from({ length: 7 }, (_, i) => make(i));
    const left = week.filter((d) => d.iso >= today).length;
    return left < 3 ? [week, Array.from({ length: 7 }, (_, i) => make(7 + i))] : [week];
  }, [weekMondayISO, today]);
  const canConfirm = !!selected && selected !== scheduledDate && selected >= today && !isPending;

  const dayBtn = (d: { iso: string; dow: number; num: number }) => {
    const past = d.iso < today;
    const sel = d.iso === selected;
    const cur = d.iso === scheduledDate;
    return (
      <button
        key={d.iso}
        type="button"
        disabled={past}
        aria-pressed={sel}
        aria-label={new Date(d.iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        onClick={() => setSelected(d.iso)}
        className={cn(
          "box-border flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl p-0 font-[inherit]",
          past ? "cursor-default" : "cursor-pointer",
          sel
            ? "border-none bg-agon-accent text-agon-ink"
            : past
              ? "border border-agon-sable/[0.08] bg-transparent text-agon-tx3 opacity-[0.45]"
              : cur
                ? "border border-dashed border-agon-sable/[0.35] bg-transparent text-agon-tx2"
                : "border border-agon-brd-l bg-transparent text-agon-tx",
        )}
      >
        <span className="agon-mono text-[12px] font-medium">{DOW_LETTER[d.dow]}</span>
        <span className="agon-mono text-[10px] opacity-80">{d.num}</span>
      </button>
    );
  };

  const row = (icon: React.ReactNode, title: string, sub: string | null, onClick: () => void, chevron = false) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3.5 border-none bg-transparent px-0 py-1.5 text-left font-[inherit] text-agon-tx"
    >
      <span className="flex size-[34px] flex-none items-center justify-center rounded-[10px] bg-agon-s2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{title}</span>
        {sub && <span className="mt-px block text-[12px] text-agon-tx3">{sub}</span>}
      </span>
      {chevron && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="1.8" strokeLinecap="square" aria-hidden><path d="M9 5L16 12L9 19" /></svg>}
    </button>
  );

  const titleCls = "text-left text-[17px] font-medium leading-[1.25] text-agon-tx";
  const titleEl = isDesktop
    ? <div id="reschedule-title" className={titleCls}>{sessionName}</div>
    : <DrawerTitle className={titleCls}>{sessionName}</DrawerTitle>;
  const content = (
      <div className="flex flex-col gap-[18px] px-5 pb-[34px] pt-2.5">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="agon-mono whitespace-nowrap rounded-full px-[7px] py-0.5 text-[9.5px] font-medium uppercase leading-[1.3] tracking-[0.08em] text-agon-ink" style={{ background: typeColor }}>{typeLabel}</span>
                <span className="agon-mono whitespace-nowrap text-[11px] text-agon-tx3">{missed ? "Manquée" : "Prévue"} {fmtDay(scheduledDate)}</span>
              </div>
              {titleEl}
            </div>
            <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-[9px] border-none bg-agon-s2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="2" strokeLinecap="square" aria-hidden><path d="M5 5L19 19M19 5L5 19" /></svg>
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="agon-mono text-[10.5px] uppercase tracking-[0.12em] text-agon-tx2">Déplacer au</span>
            {days.map((week, i) => (
              <div key={i} className="flex gap-1.5">{week.map(dayBtn)}</div>
            ))}
            <span className="text-[12px] text-agon-tx3">Ton coach verra le changement dans son planning.</span>
          </div>

          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={!canConfirm}
            className={cn(
              "h-[52px] w-full rounded-xl border-none font-[inherit] text-[15px] font-semibold",
              canConfirm ? "cursor-pointer bg-agon-accent text-agon-ink" : "cursor-default bg-agon-s2 text-agon-tx3",
            )}
          >
            {isPending ? "Déplacement…" : !selected || selected === scheduledDate || selected < today ? "Choisis un jour" : `Déplacer au ${fmtDay(selected)}`}
          </button>

          {(onRest || onDetail) && (
            <div className="flex flex-col border-t border-agon-sable/[0.12] pt-1">
              {onRest && row(
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="1.6" strokeLinecap="square" aria-hidden><path d="M20 14.5A8 8 0 1 1 9.5 4A6.5 6.5 0 0 0 20 14.5Z" /></svg>,
                "Passer en repos", "La séance est retirée de ta journée", onRest,
              )}
              {onRest && onDetail && <div className="ml-12 h-px bg-agon-sable/[0.08]" />}
              {onDetail && row(
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="1.6" strokeLinecap="square" aria-hidden><path d="M2 12C4.5 7 8 5 12 5S19.5 7 22 12C19.5 17 16 19 12 19S4.5 17 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
                "Voir le détail", null, onDetail, true,
              )}
            </div>
          )}
        </div>
  );

  if (isDesktop) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const place = anchor ? tipPlacement(anchor, vw, vh, 400) : null;
    return (
      <>
        <div aria-hidden onClick={onClose} className="fixed inset-0 z-[300] bg-black/25" />
        <div role="dialog" aria-modal="true" aria-labelledby="reschedule-title" className="fixed z-[301] max-h-[calc(100vh-32px)] overflow-y-auto rounded-[18px] border border-agon-brd-l bg-agon-s1 shadow-[0_16px_40px] shadow-black/[0.55]" style={{
          width: place?.width ?? 400,
          ...(place
            ? { left: place.left, ...(place.below ? { top: Math.min(place.y, vh - 16 - 420) } : { bottom: place.y }) }
            : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }),
        }}>
          {content}
        </div>
      </>
    );
  }

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent aria-describedby={undefined} className="rounded-t-[24px] border-t-agon-brd-l bg-agon-s1 p-0">
        {content}
      </DrawerContent>
    </Drawer>
  );
}
