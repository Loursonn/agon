import { useState, type ReactNode, type CSSProperties } from "react";
import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { blocColor } from "@/lib/peps";
import { blocLetter, prescriptionLine } from "@/lib/todayPreview";
import type { SessionPreviewItem } from "@/features/shared/hooks/useWeekProgram";
import { TypePill } from "./TypePill";

/**
 * Séance du jour (maquette « Aujourd'hui · aperçu ») : d'abord le nom seul ;
 * « Aperçu » déplie la liste des exercices (lettre du bloc, prescription),
 * le lien vers le détail et le gros bouton « Démarrer la séance ».
 * Pas de volume ni de tonnage.
 */
export function TodaySessionCard({
  color,
  typeLabel,
  title,
  items,
  onStart,
  startLabel = "Démarrer la séance",
  onDetail,
  extra,
  defaultOpen = false,
  time,
  pattern = false,
}: {
  color: string;
  typeLabel: string;
  title: string;
  /** Exercices prévus ; absent = séance sans aperçu (énergie : on ouvre le détail). */
  items?: SessionPreviewItem[];
  onStart?: () => void;
  startLabel?: string;
  onDetail?: () => void;
  /** Contenu supplémentaire sous l'aperçu (fiches du coach). */
  extra?: ReactNode;
  defaultOpen?: boolean;
  /** Heure prévue (« 9 H 00 »), si connue. */
  time?: string;
  /** Motif doré en fond (séance de musculation, maquette). */
  pattern?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasPreview = !!items && items.length > 0;
  const canOpen = hasPreview || !!extra || !!onStart;

  const chevron = (up: boolean) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
      <path d={up ? "M6 15L12 9L18 15" : "M6 9L12 15L18 9"} />
    </svg>
  );
  const headBtn: CSSProperties = {
    flex: "none", height: 36, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 10,
    border: "1px solid rgba(231,211,168,0.18)", background: "rgba(14,12,10,0.35)", color: C.tx,
    fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
  };
  const rowTop = "1px solid rgba(231,211,168,0.10)";

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 14, border: `1px solid ${color}73`, background: `${color}1F` }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color, zIndex: 1 }} />
      {pattern && <div aria-hidden style={{ position: "absolute", inset: 0, background: "url(/maquette/carte-seance-motif.svg) center/cover", opacity: 0.14 }} />}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 17px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TypePill color={color}>{typeLabel}</TypePill>
            {time && <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.08em", color: C.tx2 }}>{time}</span>}
          </div>
          <div style={{ ...DISPLAY, fontSize: 14, fontWeight: 500, lineHeight: 1.3, letterSpacing: "0.06em", color: C.tx, overflowWrap: "anywhere" }}>{title}</div>
        </div>
        {canOpen ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={headBtn}>
            {open ? "Fermer" : "Aperçu"} {chevron(open)}
          </button>
        ) : onDetail ? (
          <button type="button" onClick={onDetail} style={headBtn}>
            Aperçu {chevron(false)}
          </button>
        ) : null}
      </div>

      {open && (
        <div style={{ position: "relative", padding: "0 14px 14px 17px", display: "flex", flexDirection: "column" }}>
          {hasPreview && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 8px" }}>
                <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 }}>Aperçu</span>
                <span style={{ flex: 1 }} />
                <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx3 }}>
                  {items!.length} exercice{items!.length > 1 ? "s" : ""}
                </span>
              </div>
              {items!.map((it, i) => {
                const bi = it.blocIndex ?? 0;
                const bc = blocColor(it.blocColor, bi);
                const line = prescriptionLine(it.mode, it.params);
                return (
                  <div key={it.id + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: rowTop, whiteSpace: "nowrap" }}>
                    <span style={{ ...MONO, width: 20, height: 20, flex: "none", borderRadius: 6, background: bc, color: C.bg, fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {blocLetter(bi)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tx, overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
                    {line && <span style={{ ...MONO, fontSize: 12, color: C.tx2, flex: "none" }}>{line}</span>}
                  </div>
                );
              })}
            </>
          )}
          {extra && <div style={{ padding: "8px 0", borderTop: hasPreview ? rowTop : undefined }}>{extra}</div>}
          {onDetail && (
            <button
              type="button"
              onClick={onDetail}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 0 14px", borderTop: hasPreview || extra ? rowTop : undefined, borderLeft: "none", borderRight: "none", borderBottom: "none", background: "none", color: C.ac, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
            >
              Voir le détail de la séance <span aria-hidden>→</span>
            </button>
          )}
          {onStart && (
            <button
              type="button"
              onClick={onStart}
              style={{ width: "100%", height: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
            >
              {startLabel}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4L20 12L7 20Z" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
