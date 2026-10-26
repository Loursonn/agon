/**
 * Styles partagés par les écrans médicaux.
 *
 * Extraits de `MedicalEntriesSection` quand la déclaration rapide de blessure a
 * eu besoin des mêmes champs : un seul endroit à changer pour que le formulaire
 * complet et la déclaration en dix secondes restent identiques à l'œil.
 */
import type React from "react";
import { C } from "@/lib/theme";

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 4,
  border: "1px solid " + C.brd, background: C.s2, color: C.tx,
  fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase",
  letterSpacing: "0.4px", marginBottom: 4, display: "block",
};

export const card: React.CSSProperties = {
  background: C.s1, borderRadius: 6, padding: 14, border: "1px solid " + C.brd,
};

export const ghostBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4,
  border: "1px solid " + C.brdL, background: "transparent", color: C.tx3,
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

export const primaryBtn: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 4, border: "none", background: C.acV,
  color: "#0E0C0A", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
