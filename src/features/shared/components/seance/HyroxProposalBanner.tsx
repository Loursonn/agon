import { Check, Pencil, Star } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { buttonStyle } from "./seanceUi";

interface Props {
  watchLapCount: number;
  proposedCount: number;
  /** Numéros (1..n) des tours dont la limite est à vérifier. */
  review: number[];
  /** Les tours de la montre ont simplement été nommés d'après la séance (même nombre). */
  namedOnly: boolean;
  summary: string | null;
  onAdjust: () => void;
  onValidate: () => void;
  saving: boolean;
  compact: boolean;
}

/** « Tours proposés d'après la séance prévue : vérifie et ajuste » (HYROX). */
export function HyroxProposalBanner(p: Props) {
  const text = p.namedOnly
    ? `La montre a enregistré ${p.watchLapCount} tours, comme la séance prévue : chaque tour a pris le nom de son bloc.`
    : `La montre a enregistré ${p.watchLapCount} tour${p.watchLapCount > 1 ? "s" : ""}. Agon en propose ${p.proposedCount}${p.summary ? ` (${p.summary})` : ""}.`;
  return (
    <div style={{ display: "flex", alignItems: p.compact ? "stretch" : "center", flexDirection: p.compact ? "column" : "row", gap: 12, padding: "14px 16px", borderRadius: 14, background: alpha(C.ac, 0.07), border: `1px solid ${alpha(C.ac, 0.4)}` }}>
      <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
        <Star size={18} color={C.ac} strokeWidth={1.5} style={{ flex: "none", marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Tours proposés d’après la séance prévue : vérifie et ajuste</div>
          <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 3 }}>
            {text}
            {p.review.length > 0 && (
              <> <span style={{ color: C.ac }}>{p.review.length} limite{p.review.length > 1 ? "s" : ""} à vérifier</span> (tour{p.review.length > 1 ? "s" : ""} {p.review.join(" et ")}).</>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" style={{ ...buttonStyle(), flex: p.compact ? 1 : undefined }} onClick={p.onAdjust}><Pencil size={14} />Ajuster</button>
        <button type="button" style={{ ...buttonStyle("primary"), flex: p.compact ? 1 : undefined }} onClick={p.onValidate} disabled={p.saving}><Check size={14} />Valider</button>
      </div>
    </div>
  );
}
