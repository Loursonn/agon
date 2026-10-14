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
  background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700,
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
