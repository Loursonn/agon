/**
 * Briques communes des planches « ordinateur » du canvas Claude Design
 * (coach ordi, espace staff) : en-tête de page, rubriques numérotées
 * « 01 — », cartes, boutons, pastilles, avatars à initiales.
 * Valeurs relevées dans les planches CoachOrdi* (Archivo 30 px, Geist Mono 11 px
 * espacé 0,14 em, cartes #1E1A16 rayon 14, boutons rayon 10).
 */
import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";

export { MONO, DISPLAY };
export { ORDI_CARD, KICK } from "./ordiStyles";
import { initials, KICK } from "./ordiStyles";

export function PageHead({ title, kicker, actions, sub }: { title: ReactNode; kicker?: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 500, fontSize: 30, lineHeight: 1.1, letterSpacing: "0.06em", color: C.tx }}>{title}</h1>
          {kicker != null && <span style={{ ...KICK, color: C.ac, whiteSpace: "normal" }}>{kicker}</span>}
        </div>
        {actions && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {sub && <div style={{ fontSize: 13, color: C.tx3 }}>{sub}</div>}
    </div>
  );
}

/** Rubrique numérotée : « 01 — Titre », info à droite, filet dessous, phrase d'aide. */
export function SectionHead({ n, title, right, hint }: { n?: number; title: ReactNode; right?: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ paddingBottom: 10, borderBottom: `1px solid ${C.brd}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 22, flexWrap: "wrap" }}>
          <span style={KICK}>
            {n != null && <span style={{ color: C.ac }}>{String(n).padStart(2, "0")} —</span>} {title}
          </span>
          {right && <span style={{ fontSize: 12, color: C.tx3 }}>{right}</span>}
        </div>
      </div>
      {hint && <div style={{ fontSize: 13, color: C.tx3, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

export function Pill({ color, filled = false, children, style }: { color: string; filled?: boolean; children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999,
        background: filled ? color : "transparent",
        border: filled ? "none" : `1px solid ${color === C.tx2 ? C.brdL : color + "88"}`,
        color: filled ? C.bg : color,
        ...MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase",
        fontWeight: filled ? 500 : 400, whiteSpace: "nowrap", ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Pastille douce (fond teinté) : « 1 blessure en cours ». */
export function SoftTag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 999, background: color + "24", color, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function Avatar({ name, color = C.ac, size = 44, dashed = false, children }: { name?: string | null; color?: string; size?: number; dashed?: boolean; children?: ReactNode }) {
  return (
    <span
      style={{
        width: size, height: size, boxSizing: "border-box", flex: "none", borderRadius: "50%",
        border: dashed ? `1px dashed ${C.brdL}` : `1px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color, ...MONO, fontSize: size >= 40 ? 12 : 10.5,
      }}
    >
      {children ?? initials(name)}
    </span>
  );
}

/** Contrôle segmenté (Aucun / Lecture / Écriture, 3 / 5 / 7 zones…). */
export function Segmented<T extends string>({
  value, options, onChange, width = 74, colorOf, ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange?: (v: T) => void;
  width?: number;
  colorOf?: (v: T) => string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, border: `1px solid ${C.brd}`, flex: "none" }}>
      {options.map((o) => {
        const on = o.value === value;
        const col = colorOf ? colorOf(o.value) : C.ac;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={!onChange}
            onClick={() => onChange?.(o.value)}
            style={{
              width, height: 30, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8, fontSize: 12, fontFamily: "inherit",
              border: `1px solid ${on ? col : "transparent"}`,
              background: on ? col + "29" : "transparent",
              color: on ? col : C.tx3, fontWeight: on ? 500 : 400,
              cursor: onChange ? "pointer" : "default",
              opacity: !onChange && !on ? 0.55 : 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Coche carrée 18 px de la planche. */
export function CheckBox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span
        aria-hidden
        style={{
          width: 18, height: 18, boxSizing: "border-box", borderRadius: 5, flex: "none", marginTop: 1,
          border: `1px solid ${checked ? C.ac : C.brdL}`, background: checked ? C.ac : C.s2,
          display: "flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 12, fontWeight: 700,
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: C.tx }}>{label}</span>
        {hint && <span style={{ display: "block", fontSize: 12, color: C.tx3 }}>{hint}</span>}
      </span>
    </label>
  );
}

/** Icône « check » vert de la planche. */
export function CheckIcon({ color = C.g, size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <path d="M4 12.5L9.5 18L20 6" />
    </svg>
  );
}

export function PlusIcon({ color = "currentColor", size = 15 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <path d="M12 5V19M5 12H19" />
    </svg>
  );
}

export function LockIcon({ color = C.tx3, size = 12 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <rect x="5" y="11" width="14" height="10" rx="1" />
      <path d="M8 11V7A4 4 0 0 1 16 7V11" />
    </svg>
  );
}

export function PenIcon({ color = C.ac, size = 12 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <path d="M4 20H8L19 9L15 5L4 16Z" />
    </svg>
  );
}

export function ChevronRight({ color = C.tx3, size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <path d="M9 5L16 12L9 19" />
    </svg>
  );
}

export function LinkIcon({ color = C.tx3, size = 17 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="square" style={{ flex: "none" }}>
      <path d="M10 14A4 4 0 0 0 16 14L19 11A4 4 0 0 0 13 5L12 6" />
      <path d="M14 10A4 4 0 0 0 8 10L5 13A4 4 0 0 0 11 19L12 18" />
    </svg>
  );
}

/** « Écriture Blessures, Fiches · Lecture Séances, Tests » coloré. */
export function PermissionsLine({ write, read }: { write: string[]; read: string[] }) {
  if (!write.length && !read.length) return <div style={{ fontSize: 12.5, color: C.tx3 }}>Aucun accès</div>;
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
      {write.length > 0 && (<><span style={{ color: C.ac }}>Écriture</span> <span style={{ color: C.tx2 }}>{write.join(", ")}</span></>)}
      {write.length > 0 && read.length > 0 && <span style={{ color: C.tx3 }}>&nbsp; · &nbsp;</span>}
      {read.length > 0 && (<><span style={{ color: C.b }}>Lecture</span> <span style={{ color: C.tx2 }}>{read.join(", ")}</span></>)}
    </div>
  );
}
