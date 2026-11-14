import { useCitationDuJour } from "@/features/shared/hooks/useCitationDuJour";
import { C } from "@/lib/theme";

const GOLD = C.ac;
const WARM = C.tx2;

function formatCount(n: number): string {
  return n.toLocaleString("fr-FR");
}

/**
 * Citation de l'en-tête de l'accueil athlète (maquette « Aujourd'hui ») :
 * filet or à gauche, texte fin, bouton « Aimer » en pastille.
 */
export function CitationFigure({ barWidth = 1, margin = "20px 0 0" }: { barWidth?: number; margin?: string } = {}) {
  const { citation, liked, count, toggle } = useCitationDuJour();
  return (
    <figure style={{ position: "relative", margin, padding: `0 0 0 ${barWidth > 1 ? 16 : 14}px`, borderLeft: `${barWidth}px solid ${GOLD}` }}>
      <span style={{ fontFamily: "var(--agon-font-data)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.pierre }}>
        Citation du jour
      </span>
      <blockquote style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.5, color: C.tx, fontWeight: 300 }}>
        « {citation.text} »
      </blockquote>
      <figcaption style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={liked}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: liked ? "rgba(255,201,51,0.08)" : "none",
            border: `1px solid ${liked ? "rgba(255,201,51,0.55)" : "rgba(231,211,168,0.18)"}`, borderRadius: 999,
            padding: "5px 11px", color: liked ? GOLD : WARM, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? "rgba(255,201,51,0.25)" : "none"} stroke={liked ? GOLD : C.sable} strokeWidth="1.5" strokeLinecap="square" aria-hidden>
            <path d="M12 20L4.5 12.5A4.6 4.6 0 0 1 12 6.6A4.6 4.6 0 0 1 19.5 12.5Z" />
          </svg>
          {liked ? "Aimé" : "Aimer"}
        </button>
        <span style={{ fontSize: 12, color: C.pierre }}>
          {count === 0 ? "Sois la première à aimer." : `${formatCount(count)} ${count === 1 ? "personne aime" : "personnes aiment"}`}
        </span>
      </figcaption>
    </figure>
  );
}
