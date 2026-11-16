import type { LapPhase } from "@/lib/lapEdits";
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";

/** Styles communs de l'onglet Séance (maquettes P40, design system Agon). */
export const MONO: CSSProperties = { fontFamily: "var(--agon-font-data)", fontVariantNumeric: "tabular-nums" };
export const DISPLAY: CSSProperties = {
  fontFamily: "var(--agon-font-display)",
  fontStretch: "125%",
  textTransform: "uppercase",
  fontWeight: 300,
  letterSpacing: "0.05em",
};
export const KICKER: CSSProperties = {
  ...MONO,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.tx2,
};
export const CARD: CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.brd}`,
  borderRadius: 14,
};
export const LABEL: CSSProperties = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 };

export function pillStyle(color: string, filled = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 22,
    padding: "0 9px",
    borderRadius: 999,
    background: filled ? color : "transparent",
    border: `1px solid ${filled ? color : color + "88"}`,
    color: filled ? C.bg : color,
    ...MONO,
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

export function buttonStyle(kind: "primary" | "ghost" = "ghost", disabled = false): CSSProperties {
  const base: CSSProperties = kind === "primary"
    ? {
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        height: 36, padding: "0 16px", borderRadius: 10, border: "none",
        background: C.ac, color: C.bg, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
      }
    : {
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.brdL}`,
        background: "transparent", color: C.tx, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        whiteSpace: "nowrap",
      };
  return disabled ? { ...base, opacity: 0.4, cursor: "default" } : base;
}

/** Couleur de chaque type de tour (« Modifier tours ») : Échauffement, Effort, Récup, Retour au calme. */
export const PHASE_COLOR: Record<LapPhase, string> = {
  warmup: C.b,
  work: C.ac,
  recovery: C.g,
  cooldown: C.ame,
};

/** Garde le pointeur sur l'élément pendant un glisser (sans planter si le navigateur l'a déjà relâché). */
export function capturePointer(e: { target: EventTarget | null; pointerId: number }): void {
  try {
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
  } catch {
    // Pointeur déjà relâché : le glisser continue sans capture.
  }
}
