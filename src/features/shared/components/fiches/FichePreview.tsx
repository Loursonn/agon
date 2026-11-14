/**
 * FichePreview — aperçu d'une fiche (image ou PDF) depuis une URL signée.
 */
import { lazy, Suspense, useCallback, useState } from "react";
import { Maximize2 } from "lucide-react";
import { C } from "@/lib/theme";
import { useDocSignedUrl } from "@/features/shared/hooks/fiches/useDocs";
import type { Doc } from "@/features/shared/types/fiches";
import { MONO } from "@/features/shared/components/seance/seanceUi";

const FichePdfView = lazy(() => import("./FichePdfView"));

interface Props {
  doc: Doc;
  /** Hauteur max (coach : aperçu dans un panneau) ; absent = pleine hauteur */
  maxHeight?: number;
}

export function FichePreview({ doc, maxHeight }: Props) {
  const { data: url, isLoading, isError } = useDocSignedUrl(doc.file_path);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [page, setPage] = useState<{ n: number; total: number } | null>(null);
  const onPage = useCallback((n: number, total: number) => setPage({ n, total }), []);

  const box = (t: string) => (
    <div style={{ padding: "40px 16px", textAlign: "center", color: C.tx3, fontSize: 13 }}>{t}</div>
  );

  if (isLoading) return box("Chargement…");
  if (isError || !url) return box("Fichier indisponible.");

  return (
    <div style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined }}>
      {doc.kind === "image" ? (
        <img src={url} alt={doc.title} style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }} />
      ) : pdfFailed ? (
        box("Aperçu indisponible sur cet appareil.")
      ) : (
        <Suspense fallback={box("Chargement du lecteur PDF…")}>
          <FichePdfView url={url} onError={() => setPdfFailed(true)} onPage={onPage} />
        </Suspense>
      )}
      <div style={{
        position: maxHeight ? "sticky" : undefined, bottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "10px 2px", background: C.s1, borderTop: `1px solid ${C.brd}`,
      }}>
        <span style={{ ...MONO, fontSize: 11.5, color: C.tx3 }}>
          {doc.kind !== "image" && page ? `${page.n} / ${page.total}` : ""}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir / Télécharger"
          style={{ ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ac, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Maximize2 size={13} /> Plein écran
        </a>
      </div>
    </div>
  );
}
