import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import { KICKER, MONO } from "@/features/shared/components/seance/seanceUi";

/** Titre de section : sur-titre mono en capitales (planche CoachOrdiBStaffFiche, « Suivi »). */
export const tabTitle: CSSProperties = {
  ...KICKER, fontWeight: 400, color: C.tx2, margin: "0 0 10px",
};
/** Ligne de liste : carte arrondie (style peps). */
export const row: CSSProperties = {
  background: C.s1, border: "1px solid " + C.brd, borderRadius: 12, padding: "12px 16px",
};
/** Date ou méta d'une ligne. */
export const meta: CSSProperties = { ...MONO, fontSize: 11, color: C.tx3, letterSpacing: "0.04em" };
export const empty: CSSProperties = { fontSize: 13, color: C.tx3 };

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
