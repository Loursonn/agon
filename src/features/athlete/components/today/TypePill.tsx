import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

/** Pastille pleine d'un type (« MUSCULATION », « HARD », « REMPLIR → »). */
export function TypePill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ ...MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", flex: "none", color: C.bg, background: color, borderRadius: 999, padding: "3px 8px" }}>
      {children}
    </span>
  );
}
