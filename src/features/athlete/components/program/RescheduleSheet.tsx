import { useEffect, useMemo, useState } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { tipPlacement } from "@/lib/onboarding";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { MONO } from "@/features/shared/components/seance/seanceUi";
const DOW_LETTER = ["L", "M", "M", "J", "V", "S", "D"];

const TX2 = "#B9AE9C";
const TX3 = "#8E8780";
const GOLD = "#FFC933";

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
        style={{
          flex: 1, height: 54, boxSizing: "border-box", borderRadius: 12, padding: 0, fontFamily: "inherit",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
          cursor: past ? "default" : "pointer",
          ...(sel
            ? { background: GOLD, color: "#0E0C0A", border: "none" }
            : past
              ? { background: "transparent", border: "1px solid rgba(231,211,168,0.08)", color: TX3, opacity: 0.45 }
              : cur
                ? { background: "transparent", border: "1px dashed rgba(231,211,168,0.35)", color: TX2 }
                : { background: "transparent", border: "1px solid rgba(231,211,168,0.18)", color: "#FFFFFF" }),
        }}
      >
        <span style={{ ...MONO, fontSize: 12, fontWeight: 500 }}>{DOW_LETTER[d.dow]}</span>
        <span style={{ ...MONO, fontSize: 10, opacity: 0.8 }}>{d.num}</span>
      </button>
    );
  };

  const row = (icon: React.ReactNode, title: string, sub: string | null, onClick: () => void, chevron = false) => (
    <button
      type="button"
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 52, padding: "6px 0", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#FFFFFF" }}
    >
      <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: "#27221D", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: TX3, marginTop: 1 }}>{sub}</span>}
      </span>
      {chevron && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TX3} strokeWidth="1.8" strokeLinecap="square" aria-hidden><path d="M9 5L16 12L9 19" /></svg>}
    </button>
  );

  const titleStyle = { fontSize: 17, fontWeight: 500, lineHeight: 1.25, color: "#FFFFFF", textAlign: "left" as const };
  const titleEl = isDesktop
    ? <div id="reschedule-title" style={titleStyle}>{sessionName}</div>
    : <DrawerTitle style={titleStyle}>{sessionName}</DrawerTitle>;
  const content = (
      <div style={{ padding: "10px 20px 34px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", color: "#0E0C0A", background: typeColor, borderRadius: 999, padding: "2px 7px", lineHeight: 1.3 }}>{typeLabel}</span>
                <span style={{ ...MONO, fontSize: 11, color: TX3, whiteSpace: "nowrap" }}>{missed ? "Manquée" : "Prévue"} {fmtDay(scheduledDate)}</span>
              </div>
              {titleEl}
            </div>
            <button type="button" aria-label="Fermer" onClick={onClose} style={{ width: 32, height: 32, flex: "none", borderRadius: 9, background: "#27221D", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="2" strokeLinecap="square" aria-hidden><path d="M5 5L19 19M19 5L5 19" /></svg>
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: TX2 }}>Déplacer au</span>
            {days.map((week, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>{week.map(dayBtn)}</div>
            ))}
            <span style={{ fontSize: 12, color: TX3 }}>Ton coach verra le changement dans son planning.</span>
          </div>

          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={!canConfirm}
            style={{ height: 52, width: "100%", border: "none", borderRadius: 12, background: canConfirm ? GOLD : "#27221D", color: canConfirm ? "#0E0C0A" : TX3, fontWeight: 600, fontSize: 15, cursor: canConfirm ? "pointer" : "default", fontFamily: "inherit" }}
          >
            {isPending ? "Déplacement…" : !selected || selected === scheduledDate || selected < today ? "Choisis un jour" : `Déplacer au ${fmtDay(selected)}`}
          </button>

          {(onRest || onDetail) && (
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(231,211,168,0.12)", paddingTop: 4 }}>
              {onRest && row(
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="1.6" strokeLinecap="square" aria-hidden><path d="M20 14.5A8 8 0 1 1 9.5 4A6.5 6.5 0 0 0 20 14.5Z" /></svg>,
                "Passer en repos", "La séance est retirée de ta journée", onRest,
              )}
              {onRest && onDetail && <div style={{ height: 1, background: "rgba(231,211,168,0.08)", marginLeft: 48 }} />}
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
        <div aria-hidden onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.25)" }} />
        <div role="dialog" aria-modal="true" aria-labelledby="reschedule-title" style={{
          position: "fixed", zIndex: 301, width: place?.width ?? 400, maxHeight: "calc(100vh - 32px)", overflowY: "auto",
          background: "#1E1A16", border: "1px solid rgba(231,211,168,0.18)", borderRadius: 18, boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
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
      <DrawerContent aria-describedby={undefined} style={{ background: "#1E1A16", borderTop: "1px solid rgba(231,211,168,0.18)", borderRadius: "24px 24px 0 0", padding: 0 }}>
        {content}
      </DrawerContent>
    </Drawer>
  );
}
