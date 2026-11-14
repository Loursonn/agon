/**
 * Styles et petites fonctions des planches « ordinateur » (séparés des
 * composants d'OrdiUi.tsx pour le rechargement à chaud).
 */
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

export const ORDI_CARD: CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.brd}`,
  borderRadius: 14,
};

export const KICK: CSSProperties = {
  ...MONO,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.tx2,
  whiteSpace: "nowrap",
};

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Titre de page : h1 Archivo + sous-titre mono or, actions à droite. */
type BtnKind = "primary" | "ghost" | "danger" | "link" | "success";

export function btnStyle(kind: BtnKind = "ghost", size: "sm" | "md" | "lg" = "md", disabled = false): CSSProperties {
  const h = size === "sm" ? 34 : size === "lg" ? 40 : 36;
  const fs = size === "sm" ? 12.5 : 13;
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    height: h, padding: "0 14px", borderRadius: 10, fontSize: fs, whiteSpace: "nowrap",
    cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.45 : 1,
  };
  switch (kind) {
    case "primary":
      return { ...base, padding: "0 16px", border: "none", background: C.ac, color: C.bg, fontWeight: 600 };
    case "danger":
      return { ...base, border: `1px solid ${C.r}`, background: "transparent", color: C.r };
    case "success":
      return { ...base, padding: "0 12px", border: `1px solid ${C.g}66`, background: "transparent", color: C.g };
    case "link":
      return { ...base, height: "auto", padding: 0, border: "none", background: "none", color: C.ac, fontWeight: 500 };
    default:
      return { ...base, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2 };
  }
}

/** Date courte « 28 oct. 2026 ». */
export function frDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}
