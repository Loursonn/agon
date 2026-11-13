/**
 * Briques communes de l'app coach sur téléphone (planches « Coach tél. » du
 * canvas Claude Design). Les couleurs viennent du design system (`C`).
 */
import type { CSSProperties, ReactNode } from "react";
import { C, alpha } from "@/lib/theme";

export const MONO: CSSProperties = { fontFamily: "var(--agon-font-data)", fontVariantNumeric: "tabular-nums" };
export const DISPLAY: CSSProperties = {
  fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", fontWeight: 300, letterSpacing: "0.06em",
};
export const KICKER: CSSProperties = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 };
export const CARD: CSSProperties = { background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14 };

/** Hauteur de la barre du bas (contenu à laisser libre en bas de page). */
export const TAB_BAR_H = 78;

/** Page téléphone : colonne avec les marges de la planche. */
export function PhonePage({ children, gap = 14, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return (
    <div style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap, color: C.tx, ...style }}>
      {children}
    </div>
  );
}

/** Titre de rubrique « 01 — À traiter  4 ». */
export function Section({ n, title, count, right, children }: {
  n?: number; title: string; count?: ReactNode; right?: ReactNode; children?: ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px" }}>
        <span style={{ ...KICKER, color: C.tx2 }}>
          {n != null ? `${String(n).padStart(2, "0")} — ` : ""}{title}
        </span>
        {count != null && <span style={{ ...MONO, fontSize: 11, color: C.ac }}>{count}</span>}
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </section>
  );
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Pastille ronde aux initiales (or = athlète mis en avant). */
export function Avatar({ name, size = 40, gold = false }: { name: string; size?: number; gold?: boolean }) {
  const col = gold ? C.ac : C.tx2;
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: "none", boxSizing: "border-box", borderRadius: "50%", border: `1px solid ${col}`,
      display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 12, color: col,
    }}>{initials(name)}</span>
  );
}

/** Étiquette arrondie (« 2 coachs », « J-12 »). */
export function Tag({ children, color = C.tx2, filled = false }: { children: ReactNode; color?: string; filled?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999,
      border: filled ? "none" : `1px solid ${C.brdL}`, background: filled ? color : "transparent",
      color: filled ? C.bg : color, ...MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase",
      fontWeight: filled ? 500 : 400, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

/** Pastille de couleur (feu, wellness). `null` = gris, sans halo. */
export function Dot({ color, size = 10 }: { color: string | null; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: "none", borderRadius: "50%", background: color ?? C.s2,
      boxShadow: color ? `0 0 ${size - 2}px ${color}` : "none",
    }} />
  );
}

/** Puce de filtre (« Tous · 6 »). */
export function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{
      height: 30, padding: "0 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, flex: "none",
      fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
      background: active ? (color ? C.s2 : C.tx) : "transparent",
      color: active ? (color ? C.tx : C.bg) : C.tx2,
      border: active ? "1px solid transparent" : `1px solid ${C.brdL}`, fontWeight: active ? 500 : 400,
    }}>
      {color && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: color }} />}
      {children}
    </button>
  );
}

export function Chevron({ dir = "right", color = C.tx3, size = 16 }: { dir?: "right" | "left" | "down" | "up"; color?: string; size?: number }) {
  const d = dir === "right" ? "M9 5L16 12L9 19" : dir === "left" ? "M15 5L8 12L15 19" : dir === "down" ? "M5 9L12 16L19 9" : "M5 15L12 8L19 15";
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <path d={d} />
    </svg>
  );
}

/** Bouton plein or (action principale) ou bordé. */
export function PhoneButton({ children, onClick, primary = false, disabled = false, danger = false, style, type = "button" }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; danger?: boolean; style?: CSSProperties; type?: "button" | "submit";
}) {
  const col = danger ? C.r : C.ac;
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      height: 44, padding: "0 14px", borderRadius: 11, fontFamily: "inherit", fontSize: 13.5, cursor: disabled ? "default" : "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      background: primary ? col : "transparent", color: primary ? C.bg : danger ? C.r : C.tx2,
      border: primary ? "none" : `1px solid ${danger ? alpha(C.r, 0.5) : C.brdL}`, fontWeight: primary ? 600 : 400,
      opacity: disabled ? 0.45 : 1, ...style,
    }}>{children}</button>
  );
}

/** Vide ou absent : « — » (jamais 0). */
export const dash = (v: number | string | null | undefined, unit = ""): string =>
  v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)) ? "—" : `${v}${unit}`;

export const fmtDec = (n: number | null | undefined, digits = 1): string =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: digits });

/** « Dim. 8 nov. » */
export function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Couleur du feu / score wellness. */
export function lightColor(light: "green" | "orange" | "red" | null | undefined): string | null {
  return light === "red" ? C.r : light === "orange" ? C.o : light === "green" ? C.g : null;
}

/** Filet entre deux lignes d'une carte (ombre interne : pas de mélange border / borderTop). */
export const rowLine = (i: number): string => (i > 0 ? `inset 0 1px 0 ${C.brd}` : "none");
