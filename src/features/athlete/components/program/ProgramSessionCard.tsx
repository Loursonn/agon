import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR } from "@/lib/peps";

/**
 * Carte d'une séance dans la semaine du Programme (maquette « Programme
 * athlète ») : teintée de la couleur du type, nom, pastille du type, état
 * (« Fait », « Déplacée du ven. »…), bouton « Démarrer » le jour même et
 * menu ⋯ (déplacer, voir le détail).
 */
export function ProgramSessionCard({
  color,
  typeLabel,
  title,
  done = false,
  muted = false,
  status,
  statusColor,
  highlight = false,
  onPress,
  onStart,
  startLabel = "Démarrer",
  onMenu,
  menuLabel = "Options de la séance",
}: {
  color: string;
  typeLabel: string;
  title: string;
  done?: boolean;
  /** Séance manquée : carte estompée. */
  muted?: boolean;
  /** Texte d'état à droite de la pastille (« Déplacée du ven. », « Manquée »). */
  status?: ReactNode;
  statusColor?: string;
  /** Jour même : teinte et bordure plus marquées. */
  highlight?: boolean;
  onPress: () => void;
  onStart?: () => void;
  startLabel?: string;
  onMenu?: () => void;
  menuLabel?: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 6px 9px 12px", borderRadius: 12,
        background: color + (highlight ? "24" : "1A"), border: `1px solid ${color}${highlight ? "73" : "38"}`,
        opacity: muted ? 0.55 : 1,
      }}
    >
      <button
        type="button"
        onClick={onPress}
        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
      >
        <span style={{ fontSize: 14, color: done ? C.tx2 : C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.bg, background: color, borderRadius: 999, padding: "2px 7px" }}>{typeLabel}</span>
          {done && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, ...MONO, fontSize: 10.5, color: TYPE_COLOR.fait }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden><path d="M4 12L10 18L20 6" /></svg>
              Fait
            </span>
          )}
          {status && <span style={{ fontSize: 11.5, color: statusColor ?? C.tx3 }}>{status}</span>}
        </span>
      </button>
      {onStart && (
        <button
          type="button"
          onClick={onStart}
          style={{ flex: "none", height: 32, padding: "0 12px", borderRadius: 10, border: "none", background: C.ac, color: C.bg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          {startLabel}
        </button>
      )}
      {onMenu ? (
        <button
          type="button"
          onClick={onMenu}
          aria-label={menuLabel}
          title={menuLabel}
          style={{ flex: "none", width: 32, height: 32, borderRadius: 9, border: "none", background: "transparent", color: C.tx2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      ) : (
        <span style={{ width: 4 }} />
      )}
    </div>
  );
}
