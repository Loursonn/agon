import type { CSSProperties } from "react";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

export const AUTH_INPUT: CSSProperties = {
  width: "100%", height: 50, padding: "0 14px", borderRadius: 12, boxSizing: "border-box",
  border: `1px solid ${alpha(C.tx, 0.18)}`, background: C.s1, color: C.tx,
  fontSize: 15, fontFamily: "inherit", outline: "none",
};

export const AUTH_LABEL: CSSProperties = {
  ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3, display: "block", marginBottom: 6,
};
