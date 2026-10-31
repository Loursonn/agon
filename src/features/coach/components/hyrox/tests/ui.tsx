/** Petits composants partagés par la partie Tests HYROX. */
import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/theme";
import { fr, type MetricSource } from "@/lib/hyrox/tests";
import { NOTE_LABELS, noteColor } from "./format";

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "14px 16px", ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "22px 0 10px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.6px" }}>{children}</div>
      {right}
    </div>
  );
}

export function NoteBadge({ note, size = 22 }: { note: number | null | undefined; size?: number }) {
  const c = noteColor(note);
  return (
    <span
      title={note == null ? "Non noté" : `${fr(note, Number.isInteger(note) ? 0 : 1)} · ${NOTE_LABELS[Math.max(1, Math.min(5, Math.round(note))) - 1]}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: size, height: size, padding: "0 5px",
        borderRadius: 4, background: note == null ? "transparent" : c + "22", border: "1px solid " + (note == null ? C.brd : c + "66"),
        color: c, fontSize: size * 0.55, fontWeight: 800, flexShrink: 0,
      }}
    >
      {note == null ? "—" : fr(note, Number.isInteger(note) ? 0 : 1)}
    </span>
  );
}

export function SourceTag({ source }: { source: MetricSource }) {
  return (
    <span style={{ fontSize: 9, color: C.tx3, border: "1px solid " + C.brd, borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>
      {source}
    </span>
  );
}

export function Btn({
  children, onClick, primary, disabled, small, style, title,
}: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; small?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? "5px 10px" : "8px 14px", borderRadius: 4, fontSize: small ? 11 : 12, fontWeight: 700, fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
        background: primary ? C.ac : "transparent", color: primary ? "#000" : C.tx2,
        border: "1px solid " + (primary ? C.ac : C.brdL), whiteSpace: "nowrap", ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5, ...style }}>{children}</div>;
}
