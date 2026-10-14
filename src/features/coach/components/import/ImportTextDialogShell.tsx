/**
 * Cadre commun des fenêtres « Importer un texte » (format YOXX) :
 * zone de collage à gauche, aperçu / rapport à droite, aide du format.
 */
import { useState, type ReactNode } from "react";
import { C } from "@/lib/theme";

export const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const ghostBtn: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 4, border: `1px solid ${C.brdL}`,
  background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};

export default function ImportTextDialogShell({
  title, text, onTextChange, placeholder, example, cheatsheet, children,
  canImport, importLabel = "Importer", importing, onImport, onClose, footerNote,
}: {
  title: string;
  text: string;
  onTextChange: (t: string) => void;
  placeholder: string;
  example: string;
  cheatsheet: [string, string][];
  /** Panneau de droite (aperçu + rapport) quand du texte est collé */
  children: ReactNode;
  canImport: boolean;
  importLabel?: string;
  importing?: boolean;
  onImport: () => void;
  onClose: () => void;
  footerNote?: ReactNode;
}) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%, -50%)",
        width: 960, maxWidth: "96vw", height: "88vh",
        background: C.s1, borderRadius: 6, border: `1px solid ${C.brd}`,
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{title}</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              Colle le texte au format YOXX. L'aperçu et le rapport se mettent à jour en direct.
            </div>
          </div>
          <button onClick={() => setShowHelp((v) => !v)} style={ghostBtn}>
            {showHelp ? "Masquer le format" : "Voir le format"}
          </button>
          {!text && <button onClick={() => onTextChange(example)} style={ghostBtn}>Exemple</button>}
        </div>

        {showHelp && (
          <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.brd}`, background: C.s2, flexShrink: 0, maxHeight: 240, overflowY: "auto" }}>
            {cheatsheet.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 4 }}>
                <span style={{ width: 80, flexShrink: 0, fontWeight: 700, color: C.tx2 }}>{k}</span>
                <span style={{ color: C.tx, fontFamily: mono }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 6 }}>Référence complète : docs/format-seance-yoxx.md</div>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", minHeight: 0, flexWrap: "wrap" }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            style={{
              flex: "1 1 380px", minHeight: 200, resize: "none",
              background: C.bg, color: C.tx, border: "none", borderRight: `1px solid ${C.brd}`,
              padding: 16, fontSize: 12, lineHeight: 1.6, fontFamily: mono, outline: "none",
            }}
          />
          <div style={{ flex: "1 1 360px", minWidth: 0, overflowY: "auto", padding: 16, maxHeight: "100%" }}>
            {text.trim() ? children : (
              <div style={{ color: C.tx3, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
                L'aperçu et le rapport d'import s'affichent ici dès que tu colles le texte.
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {footerNote}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>Annuler</button>
          <button
            disabled={!canImport || importing}
            onClick={onImport}
            style={{
              padding: "8px 16px", borderRadius: 4, border: "none",
              background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700,
              cursor: canImport && !importing ? "pointer" : "not-allowed",
              opacity: canImport && !importing ? 1 : 0.4, fontFamily: "inherit",
            }}
          >
            {importing ? "Import…" : importLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** Titre de section du panneau de droite */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", margin: "14px 0 8px" }}>
      {children}
    </div>
  );
}
