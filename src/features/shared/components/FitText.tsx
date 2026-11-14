import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fitFontSize, type FitResult } from "@/lib/fitText";

/**
 * Texte sur une ligne qui rapetisse pour tenir dans sa zone, quelle que soit
 * sa longueur (chrono « 1:20:00 », cible « 10:00–12:30/km », durée « 1 h 20 min »).
 *
 * - La largeur d'un texte est proportionnelle à sa taille : mesurée à la taille
 *   courante, elle donne la largeur « naturelle » à la taille de base.
 * - La boîte prend cette largeur naturelle, plafonnée à `maxWidth` (100 % du parent
 *   par défaut) : ça marche dans un parent étiré comme dans un parent ajusté au contenu.
 * - Sous `min`, le texte garde `min` et passe à la ligne : jamais coupé, jamais débordant.
 *
 * Les éléments enfants (unité « /km »…) doivent avoir une taille en `em` pour
 * rapetisser avec le reste.
 */
export function FitText({
  children, base, min = Math.round(base * 0.45), maxWidth = "100%", style, className, ...aria
}: {
  children: ReactNode;
  /** Taille voulue en px. */
  base: number;
  /** Plancher en px (45 % de la base par défaut). */
  min?: number;
  /** Largeur maximale de la zone (« 100% », « 80% », 160…). */
  maxWidth?: CSSProperties["maxWidth"];
  /** Styles du texte (police, couleur, interlignage…) ; la taille est gérée ici. */
  style?: CSSProperties;
  className?: string;
  "aria-label"?: string;
  "aria-live"?: "off" | "polite" | "assertive";
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<FitResult>({ size: base, wrap: false });
  const [natural, setNatural] = useState(0);
  const st = useRef({ fit, natural, text: "" as string | null, base, min });
  st.current.fit = fit;
  st.current.natural = natural;
  st.current.base = base;
  st.current.min = min;

  const measure = useCallback(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const s = st.current;
    const content = text.textContent;
    const changed = content !== s.text;
    s.text = content;
    let n = s.natural;
    if (!s.fit.wrap) {
      // Sur une ligne : largeur mesurée → largeur à la taille de base.
      const w = text.getBoundingClientRect().width;
      if (w > 0) n = (w * s.base) / s.fit.size;
    } else if (changed) {
      // Texte changé alors qu'il passe à la ligne : on remesure depuis la taille de base.
      setFit({ size: s.base, wrap: false });
      return;
    }
    if (Math.abs(n - s.natural) > 0.5) {
      // La boîte va prendre la nouvelle largeur : on recalcule au rendu suivant.
      setNatural(n);
      return;
    }
    // La boîte a la largeur naturelle plafonnée par maxWidth : sa largeur est la place offerte.
    const next = fitFontSize({ base: s.base, min: s.min, naturalWidth: n, available: box.clientWidth });
    if (next.size !== s.fit.size || next.wrap !== s.fit.wrap) setFit(next);
  }, []);

  // Après chaque rendu (le chrono change chaque seconde) : remesure, ne met à jour que si ça change.
  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box);
    if (box.parentElement) ro.observe(box.parentElement);
    // Les polices web changent la largeur une fois chargées.
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) measure(); }).catch(() => {});
    return () => { alive = false; ro.disconnect(); };
  }, [measure]);

  return (
    <span
      ref={boxRef}
      className={className}
      {...aria}
      style={{
        ...style,
        display: "block",
        boxSizing: "content-box",
        // +1 px : évite qu'un arrondi fasse passer le dernier caractère à la ligne.
        width: natural ? Math.ceil(natural) + 1 : undefined,
        maxWidth,
        minWidth: 0,
        fontSize: fit.size,
      }}
    >
      <span
        ref={textRef}
        style={fit.wrap
          ? { display: "inline", whiteSpace: "normal", overflowWrap: "anywhere" }
          : { display: "inline-block", whiteSpace: "nowrap" }}
      >{children}</span>
    </span>
  );
}
