import { useCitationDuJour } from "@/features/shared/hooks/useCitationDuJour";
import { AgonIcon } from "@/components/ui/AgonIcon";
import { C, H } from "@/lib/theme";

const GOLD = C.ac;
const MUTED = C.tx3;
const CREAM = H.creme2;
const WARM = C.tx2;

function formatDateFr(): string {
  const d = new Date();
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
}

function formatCount(n: number): string {
  return n.toLocaleString("fr-FR");
}

/**
 * Citation de l'en-tête de l'accueil athlète (maquette « Aujourd'hui ») :
 * filet or à gauche, texte fin, bouton « Aimer » en pastille.
 */
export function CitationFigure() {
  const { citation, liked, count, toggle } = useCitationDuJour();
  return (
    <figure style={{ position: "relative", margin: "20px 0 0", padding: "0 0 0 14px", borderLeft: `1px solid ${GOLD}` }}>
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

export function CitationDuJour() {
  const { citation, liked, count, toggle } = useCitationDuJour();
  const dateLine = formatDateFr();

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: H.basalte5,
        border: "1px solid rgba(255,201,51,0.35)",
        borderRadius: 6,
        padding: "14px 16px 12px",
      }}
    >
      {/* Equerres */}
      {(["tl", "tr", "bl", "br"] as const).map((pos) => (
        <span
          key={pos}
          aria-hidden
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            pointerEvents: "none",
            ...(pos.includes("t") ? { top: 6 } : { bottom: 6 }),
            ...(pos.includes("l") ? { left: 6 } : { right: 6 }),
            borderColor: GOLD,
            borderStyle: "solid",
            borderWidth: 0,
            ...(pos.includes("t") ? { borderTopWidth: 1.5 } : { borderBottomWidth: 1.5 }),
            ...(pos.includes("l") ? { borderLeftWidth: 1.5 } : { borderRightWidth: 1.5 }),
          }}
        />
      ))}

      {/* Motif arene */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "60%",
          height: "100%",
          backgroundImage: "url(/brand/agon-pattern-arene-sombre.svg)",
          backgroundSize: "700px",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top right",
          opacity: 0.8,
          pointerEvents: "none",
          zIndex: 0,
          maskImage: `radial-gradient(circle at 82% 18%, ${H.noir} 0%, transparent 68%)`,
          WebkitMaskImage: `radial-gradient(circle at 82% 18%, ${H.noir} 0%, transparent 68%)`,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Top line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-data)",
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            Citation du jour · {dateLine}
          </span>
          <span
            style={{
              fontFamily: "var(--font-data)",
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            N° {citation.id} / 365
          </span>
        </div>

        {/* Quote */}
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontWeight: 300,
            fontSize: "clamp(18px, 4.5vw, 22px)",
            lineHeight: 1.36,
            color: C.tx,
            maxWidth: "92%",
            marginBottom: 14,
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", color: GOLD }}>« </span>
          {citation.text}
          <span style={{ fontFamily: "var(--font-display)", color: GOLD }}> »</span>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid rgba(231,211,168,0.12)",
            paddingTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {/* Like + counter */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={toggle}
              aria-pressed={liked}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                minHeight: 34,
                borderRadius: 4,
                border: liked
                  ? "1px solid rgba(255,201,51,0.55)"
                  : "1px solid rgba(231,211,168,0.22)",
                background: liked ? "rgba(255,201,51,0.08)" : "transparent",
                color: liked ? GOLD : WARM,
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                transition: "color 150ms, border-color 150ms, background 150ms",
              }}
            >
              <span style={{ display: "flex", opacity: liked ? 1 : 0.7 }}>
                <AgonIcon
                  name="coeur"
                  size={16}
                  style={liked ? { fill: "rgba(255,201,51,0.2)" } : undefined}
                />
              </span>
              {liked ? "Aime" : "Aimer"}
            </button>

            <span
              style={{
                fontFamily: "var(--font-data)",
                fontSize: 10.5,
                color: MUTED,
              }}
            >
              {count === 0 ? (
                "Sois le premier a aimer."
              ) : (
                <>
                  <strong style={{ color: CREAM, fontWeight: 600 }}>{formatCount(count)}</strong>
                  {" "}
                  {count === 1 ? "athlete a aime" : "athletes ont aime"}
                </>
              )}
            </span>
          </div>

          {/* Theme tag */}
          <span
            style={{
              fontFamily: "var(--font-data)",
              fontSize: 10.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid rgba(255,201,51,0.4)",
              background: "rgba(255,201,51,0.08)",
              color: GOLD,
              whiteSpace: "nowrap",
            }}
          >
            {citation.theme}
          </span>
        </div>
      </div>
    </div>
  );
}
