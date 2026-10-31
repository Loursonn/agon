import type { CSSProperties } from "react";
import { C } from "@/lib/theme";

export const tabTitle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px",
};
export const row: CSSProperties = {
  background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "8px 12px",
};
export const empty: CSSProperties = { fontSize: 13, color: C.tx3 };

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
