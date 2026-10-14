/** Texte prêt à l'emploi d'une nouveauté : copier, télécharger (.md), afficher. */
import { useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import type { ReleaseNoteResource } from "@/data/releaseNotes";

const btn = {
  minHeight: 36, padding: "6px 12px", borderRadius: 4, border: "1px solid " + C.brdL,
  background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
} as const;

export function ReleaseNoteResourceBox({ resource }: { resource: ReleaseNoteResource }) {
  const [open, setOpen] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resource.text);
      toast.success("Copié ! Colle-le dans Claude ou ChatGPT.");
    } catch {
      setOpen(true);
      toast.error("Copie impossible : sélectionne le texte affiché et copie-le à la main.");
    }
  };

  const download = () => {
    const blob = new Blob([resource.text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resource.filename ?? "agon.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ border: "1px solid " + C.ac + "40", background: C.acS, borderRadius: 6, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>📋 {resource.label}</div>
      {resource.description && <div style={{ fontSize: 12, color: C.tx2, marginTop: 2 }}>{resource.description}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={copy} style={{ ...btn, border: "none", background: C.acV, color: "#0E0C0A", fontWeight: 700 }}>Copier</button>
        {resource.filename && <button onClick={download} style={btn}>Télécharger (.md)</button>}
        <button onClick={() => setOpen((v) => !v)} style={btn}>{open ? "Masquer" : "Afficher"}</button>
      </div>
      {open && (
        <pre style={{
          marginTop: 10, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap",
          background: C.bg, border: "1px solid " + C.brd, borderRadius: 4, padding: 10,
          fontSize: 11, lineHeight: 1.5, color: C.tx2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}>{resource.text}</pre>
      )}
    </div>
  );
}
