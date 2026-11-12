import { useState, type ReactNode } from "react";
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
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasPreview = !!items && items.length > 0;
  const canOpen = hasPreview || !!extra || !!onStart;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: `1px solid ${color}73`, background: `${color}1F` }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 17px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div><TypePill color={color}>{typeLabel}</TypePill></div>
          <div style={{ ...DISPLAY, fontSize: 17, fontWeight: 400, lineHeight: 1.2, color: C.tx, overflowWrap: "anywhere" }}>{title}</div>
        </div>
        {canOpen ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={{ flex: "none", height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
          >
            {open ? "Masquer" : "Aperçu"}
          </button>
        ) : onDetail ? (
          <button
            type="button"
            onClick={onDetail}
            style={{ flex: "none", height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
          >
            Voir
          </button>
        ) : null}
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 12px 14px 17px" }}>
          {hasPreview && (
            <>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx3 }}>
                Aperçu · {items!.length} exercice{items!.length > 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items!.map((it, i) => {
                  const bi = it.blocIndex ?? 0;
                  const bc = blocColor(it.blocColor, bi);
                  const line = prescriptionLine(it.mode, it.params);
                  return (
                    <div key={it.id + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.s1, border: `1px solid ${C.brd}` }}>
                      <span style={{ ...MONO, width: 22, height: 22, flex: "none", borderRadius: 5, background: bc, color: C.bg, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {blocLetter(bi)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                      {line && <span style={{ ...MONO, fontSize: 12, color: C.tx2, flex: "none" }}>{line}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {extra}
          {onDetail && (
            <button
              type="button"
              onClick={onDetail}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
            >
              Voir le détail de la séance →
            </button>
          )}
          {onStart && (
            <button
              type="button"
              onClick={onStart}
              style={{ width: "100%", height: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontSize: 16, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
            >
              {startLabel} ▶
            </button>
          )}
        </div>
      )}
    </div>
  );
}
