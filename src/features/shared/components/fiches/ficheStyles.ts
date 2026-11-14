/** Styles inline partagés du module Fiches (charte Agon, tokens C). */
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import type { FicheCategory } from "@/features/shared/types/fiches";

export const CATEGORY_COLOR: Record<FicheCategory, string> = {
  mobilite: C.pat,
  pacing: C.b,
  prevention: C.o,
  recuperation: C.g,
  nutrition: C.ame,
  education: C.ac,
  questionnaire: C.tx2,
  autre: C.tx3,
};

export const btnPrimary: CSSProperties = {
  minHeight: 40, padding: "8px 16px", borderRadius: 4, border: "none",
  background: C.acV, color: C.ink, fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};

export const btnGhost: CSSProperties = {
  minHeight: 40, padding: "8px 14px", borderRadius: 4,
  border: "1px solid " + C.brdL, background: "transparent", color: C.tx2,
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};

export const input: CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 4,
  border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
  fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

export const label: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase",
  letterSpacing: "0.5px", marginBottom: 4, display: "block",
};

export const sectionTitle: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: C.tx3, textTransform: "uppercase",
  letterSpacing: "0.5px", margin: "0 0 8px",
};

export function chip(active: boolean, color: string = C.ac): CSSProperties {
  return {
    minHeight: 32, padding: "6px 12px", borderRadius: 16,
    border: "1px solid " + (active ? color + "80" : C.brdL),
    background: active ? color + "1f" : "transparent",
    color: active ? color : C.tx2, fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };
}

// ── Équivalents en classes Tailwind (à préférer pour tout nouveau code) ──
export const BTN_GHOST = "min-h-10 cursor-pointer whitespace-nowrap rounded-[4px] border border-agon-brd-l bg-transparent px-3.5 py-2 font-[inherit] text-[12px] font-semibold text-agon-tx2";
export const BTN_PRIMARY = "min-h-10 cursor-pointer whitespace-nowrap rounded-[4px] border-none bg-agon-accent px-4 py-2 font-[inherit] text-[13px] font-bold text-agon-ink";
export const INPUT = "box-border min-h-10 w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2.5 py-2 font-[inherit] text-[14px] text-agon-tx [outline:none]";
export const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.5px] text-agon-tx3";
export const CHIP = "min-h-8 cursor-pointer whitespace-nowrap rounded-2xl border px-3 py-1.5 font-[inherit] text-[12px] font-semibold";
export const CHIP_OFF = "border-agon-brd-l bg-transparent text-agon-tx2";
export const CHIP_ON_ACCENT = "border-agon-accent/[0.5] bg-agon-accent/[0.12] text-agon-accent";

/** Puce active et filet gauche par catégorie : mêmes couleurs que CATEGORY_COLOR (ci-dessus). */
export const CATEGORY_CHIP_ON: Record<FicheCategory, string> = {
  mobilite: "border-agon-patine/[0.5] bg-agon-patine/[0.12] text-agon-patine",
  pacing: "border-agon-info/[0.5] bg-agon-info/[0.12] text-agon-info",
  prevention: "border-agon-alerte/[0.5] bg-agon-alerte/[0.12] text-agon-alerte",
  recuperation: "border-agon-succes/[0.5] bg-agon-succes/[0.12] text-agon-succes",
  nutrition: "border-agon-amethyste/[0.5] bg-agon-amethyste/[0.12] text-agon-amethyste",
  education: CHIP_ON_ACCENT,
  questionnaire: "border-agon-tx2/[0.5] bg-agon-tx2/[0.12] text-agon-tx2",
  autre: "border-agon-tx3/[0.5] bg-agon-tx3/[0.12] text-agon-tx3",
};
export const CATEGORY_BORDER_L: Record<FicheCategory, string> = {
  mobilite: "border-l-agon-patine",
  pacing: "border-l-agon-info",
  prevention: "border-l-agon-alerte",
  recuperation: "border-l-agon-succes",
  nutrition: "border-l-agon-amethyste",
  education: "border-l-agon-accent",
  questionnaire: "border-l-agon-tx2",
  autre: "border-l-agon-tx3",
};
/** Carte de fiche posée sur un jour : fond et bord teintés de la couleur de catégorie. */
export const CATEGORY_SOFT: Record<FicheCategory, string> = {
  mobilite: "border-agon-patine/[0.25] bg-agon-patine/[0.08]",
  pacing: "border-agon-info/[0.25] bg-agon-info/[0.08]",
  prevention: "border-agon-alerte/[0.25] bg-agon-alerte/[0.08]",
  recuperation: "border-agon-succes/[0.25] bg-agon-succes/[0.08]",
  nutrition: "border-agon-amethyste/[0.25] bg-agon-amethyste/[0.08]",
  education: "border-agon-accent/[0.25] bg-agon-accent/[0.08]",
  questionnaire: "border-agon-tx2/[0.25] bg-agon-tx2/[0.08]",
  autre: "border-agon-tx3/[0.25] bg-agon-tx3/[0.08]",
};
export const SECTION_TITLE = "m-0 mb-2 text-[12px] font-bold uppercase tracking-[0.5px] text-agon-tx3";
/** Texte coloré par catégorie (libellé de la fiche ouverte). */
export const CATEGORY_TEXT: Record<FicheCategory, string> = {
  mobilite: "text-agon-patine",
  pacing: "text-agon-info",
  prevention: "text-agon-alerte",
  recuperation: "text-agon-succes",
  nutrition: "text-agon-amethyste",
  education: "text-agon-accent",
  questionnaire: "text-agon-tx2",
  autre: "text-agon-tx3",
};
