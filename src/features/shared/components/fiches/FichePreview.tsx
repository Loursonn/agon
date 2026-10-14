/**
 * FichePreview — aperçu d'une fiche (image ou PDF) depuis une URL signée.
 */
import { lazy, Suspense, useState } from "react";
import { C } from "@/lib/theme";
import { useDocSignedUrl } from "@/features/shared/hooks/fiches/useDocs";
import type { Doc } from "@/features/shared/types/fiches";
import { btnGhost } from "./ficheStyles";

const FichePdfView = lazy(() => import("./FichePdfView"));

interface Props {
  doc: Doc;
  /** Hauteur max (coach : aperçu dans un panneau) ; absent = pleine hauteur */
  maxHeight?: number;
}

export function FichePreview({ doc, maxHeight }: Props) {
  const { data: url, isLoading, isError } = useDocSignedUrl(doc.file_path);
  const [pdfFailed, setPdfFailed] = useState(false);

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
          <FichePdfView url={url} onError={() => setPdfFailed(true)} />
        </Suspense>
      )}
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          Ouvrir / Télécharger
        </a>
      </div>
    </div>
  );
}
