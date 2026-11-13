import { useState } from "react";
import { X, ChevronDown, ChevronUp, Check, Minus } from "lucide-react";
import { C } from "@/lib/theme";
import { ATHLETE_CHOICE_LABEL } from "@/lib/athleteChoices";
import { hasIso, isIsoAt } from "@/lib/formatSetsReps";
import { IsoBadge } from "@/features/shared/components/IsoBadge";
import { ExoRow, fmtPlanned, exoQuickSummary } from "./dayDetailsUtils";

/** Accordion exercise row */
export function ExoAccordionRow({ exo, isCompleted, exerciceComment }: {
  exo: ExoRow; isCompleted: boolean; exerciceComment?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasActual = exo.actual.length > 0;
  const summary = exoQuickSummary(exo, isCompleted);
  const statusIcon = hasActual
    ? (exo.actual.length >= (exo.planned?.nb_series ?? exo.actual.length)
      ? <Check size={12} style={{ color: C.g }} />
      : <Minus size={12} style={{ color: C.o }} />)
    : (isCompleted ? <X size={12} style={{ color: C.r }} /> : null);

  return (
    <div style={{
      background: C.s2, borderRadius: 4, border: "1px solid " + C.brd,
      overflow: "hidden", transition: "all 150ms",
    }}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        {/* Status dot */}
        {statusIcon && <span style={{ flexShrink: 0, lineHeight: 0 }}>{statusIcon}</span>}

        {/* Name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {exo.name}
            {exo.mode === "methode" && exo.methodeId && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: C.coachS, color: C.coach, fontWeight: 600, verticalAlign: "middle" }}>
                Méthode
              </span>
            )}
            {exo.planned && hasIso(exo.planned) && <IsoBadge />}
            {exo.mode === "libre" && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: C.oS, color: C.o, fontWeight: 600, verticalAlign: "middle" }}>
                Libre
              </span>
            )}
            {!exo.planned && hasActual && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B", fontWeight: 600, verticalAlign: "middle" }}>
                {ATHLETE_CHOICE_LABEL}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: summary.color, marginTop: 2 }}>{summary.text}</div>
        </div>

        {/* Chevron */}
        {open ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />}
      </button>

      {/* Expanded details */}
      {open && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid " + C.brd }}>
          {exo.comment && (
            <div style={{ fontSize: 10, color: C.tx3, fontStyle: "italic", paddingTop: 8 }}>
              {exo.comment}
            </div>
          )}
          {exo.mode === "libre" && exo.libreText && (
            <div style={{ fontSize: 10, color: C.tx2, paddingTop: exo.comment ? 0 : 8 }}>
              {exo.libreText}
            </div>
          )}

          {/* Prévu vs Réalisé side-by-side */}
          <div style={{
            display: "grid",
            gridTemplateColumns: hasActual && exo.planned ? "1fr 1fr" : "1fr",
            gap: 8, paddingTop: 6,
          }}>
            {/* Planned */}
            {exo.planned && (
              <div style={{
                padding: "8px 10px", borderRadius: 4,
                background: C.s1, border: "1px dashed " + C.brd,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 6 }}>
                  Prévu
                </div>
                <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5 }}>
                  {fmtPlanned(exo.planned)}
                </div>
              </div>
            )}

            {/* Actual */}
            {hasActual && (
              <div style={{
                padding: "8px 10px", borderRadius: 4,
                background: C.gS + "30",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.g, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 6 }}>
                  Réalisé ({exo.actual.length} série{exo.actual.length > 1 ? "s" : ""})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {exo.actual.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.tx2 }}>
                      <span style={{ color: C.tx3, minWidth: 18, fontSize: 10, fontWeight: 600 }}>S{i + 1}</span>
                      {s.kg != null && <span style={{ fontWeight: 700, color: C.tx }}>{s.kg}kg</span>}
                      {s.reps != null && <span>×{s.reps}{isIsoAt(exo.planned, i) ? " s" : ""}</span>}
                      {s.rir != null && <span style={{ color: C.tx3, fontSize: 10 }}>RIR{s.rir}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Not done */}
          {!hasActual && isCompleted && (
            <div style={{ fontSize: 10, color: C.r, fontStyle: "italic", paddingTop: 4 }}>Non réalisé</div>
          )}

          {/* Exercise comment */}
          {exerciceComment && (
            <div style={{ fontSize: 10, color: C.tx2, fontStyle: "italic", padding: "6px 8px", background: C.acS + "30", borderRadius: 6 }}>
              {exerciceComment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
