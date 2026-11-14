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
  /** Page visible et nombre de pages, pour la barre « 1 / 3 » de l'aperçu. */
  onPage?: (page: number, total: number) => void;
}

export default function FichePdfView({ url, onError, onPage }: Props) {
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

  // Page la plus visible : suivie au défilement (conteneur ou page).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || pages === 0) return;
    onPage?.(1, pages);
    const seen = new Map<number, number>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio));
      let best = 1, ratio = -1;
      seen.forEach((r, p) => { if (r > ratio) { ratio = r; best = p; } });
      onPage?.(best, pages);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    el.querySelectorAll<HTMLElement>("[data-page]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [pages, onPage]);

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
        error={msg("Impossible d'afficher le PDF. Utilise « Plein écran ».")}
      >
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} data-page={i + 1} style={{ marginBottom: 8, background: C.tx, borderRadius: 2, overflow: "hidden" }}>
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
