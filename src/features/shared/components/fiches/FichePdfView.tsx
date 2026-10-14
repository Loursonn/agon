/**
 * FichePdfView — rendu PDF via react-pdf (pdf.js), chargé en lazy.
 * Pages en défilement vertical, largeur adaptée au conteneur (mobile),
 * zoom pincé natif du navigateur. Évite le <iframe> qui n'affiche souvent
 * que la 1re page sur iOS Safari.
 */
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { C } from "@/lib/theme";

// Worker pdf.js servi par Vite (asset séparé)
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props {
  url: string;
  onError?: () => void;
}

export default function FichePdfView({ url, onError }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.min(el.clientWidth, 1000)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const msg = (t: string) => (
    <div style={{ padding: "40px 16px", textAlign: "center", color: C.tx3, fontSize: 13 }}>{t}</div>
  );

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setPages(numPages)}
        onLoadError={() => onError?.()}
        loading={msg("Chargement du PDF…")}
        error={msg("Impossible d'afficher le PDF. Utilise « Ouvrir / Télécharger ».")}
      >
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} style={{ marginBottom: 8, background: "#fff", borderRadius: 2, overflow: "hidden" }}>
            <Page
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              loading={<div style={{ height: width * 1.41, background: C.s2 }} />}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
