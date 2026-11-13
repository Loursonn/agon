import type { CSSProperties } from "react";
import { C, alpha } from "@/lib/theme";


export const FIELD_BOX: CSSProperties = {
  height: 48, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${alpha(C.tx, 0.18)}`, background: C.s1,
  display: "flex", alignItems: "center", gap: 10, padding: "0 14px", position: "relative",
};

/** « Dim. 22 nov. 2026 » (avec l'année) ou « Mer. 18 nov. » (sans). */
export function fmtLongDay(iso: string, withYear: boolean): string {
  const d = new Date(iso + "T12:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
