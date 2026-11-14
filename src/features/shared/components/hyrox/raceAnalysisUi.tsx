import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { CARD, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";

/** Briques d'affichage communes de l'analyse de course HYROX. */

export function Sources({ children }: { children: ReactNode }) {
  return <div style={{ ...LABEL, fontSize: 10, letterSpacing: "0.08em", textTransform: "none", lineHeight: 1.5 }}>Sources · {children}</div>;
}

export function Stat({ label, value, unit, sub, note, bare }: { label: string; value: string; unit?: string; sub?: string; note?: string; bare?: boolean }) {
  // bare : sans cadre, séparé par un filet gauche (chiffres posés dans l'en-tête teinté, planche HyroxAnaCoachOrdi).
  const shell = bare
    ? { borderLeft: `1px solid ${C.brdL}`, padding: "2px 0 2px 20px" }
    : { ...CARD, padding: "12px 14px" };
  return (
    <div style={{ ...shell, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={LABEL}>{label}</span>
      <span style={{ ...MONO, fontSize: 24 }}>{value}{unit && <span style={{ fontSize: 12, color: C.tx3 }}> {unit}</span>}</span>
      {sub && <span style={{ fontSize: 11.5, color: C.tx2, lineHeight: 1.4 }}>{sub}</span>}
      {note && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3, lineHeight: 1.4 }}>{note}</span>}
    </div>
  );
}
