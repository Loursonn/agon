import { useCitationDuJour } from "@/features/shared/hooks/useCitationDuJour";
import { C } from "@/lib/theme";

const GOLD = C.ac;

/**
 * Citation de l'en-tête de l'accueil athlète (maquette « Aujourd'hui ») :
 * filet or à gauche, texte fin. Plus de « J'aime » (retirés le 14/11/2026).
 */
export function CitationFigure({ barWidth = 1, margin = "20px 0 0" }: { barWidth?: number; margin?: string } = {}) {
  const { citation } = useCitationDuJour();
  return (
    <figure style={{ position: "relative", margin, padding: `0 0 0 ${barWidth > 1 ? 16 : 14}px`, borderLeft: `${barWidth}px solid ${GOLD}` }}>
      <span style={{ fontFamily: "var(--agon-font-data)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.pierre }}>
        Citation du jour
      </span>
      <blockquote style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.5, color: C.tx, fontWeight: 300 }}>
        « {citation.text} »
      </blockquote>
    </figure>
  );
}
