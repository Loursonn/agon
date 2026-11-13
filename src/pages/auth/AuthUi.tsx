import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { LEGAL_ROUTES } from "@/lib/legal";
import { AUTH_LABEL } from "./authStyles";

/**
 * Briques des pages d'accès (planches AccesConnexion / AccesPagesSimples) :
 * logo cercle or + AGON, champs, bouton principal en bas d'écran.
 */

export function AuthLogo({ subtitle, size = "big" }: { subtitle?: string; size?: "big" | "small" }) {
  const big = size === "big";
  return (
    <div style={{ display: "flex", flexDirection: big ? "column" : "row", alignItems: "center", gap: big ? 14 : 10 }}>
      <span style={{ width: big ? 56 : 24, height: big ? 56 : 24, boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${C.ac}`, flex: "none" }} />
      <div style={{ textAlign: big ? "center" : "left" }}>
        <div style={{ ...DISPLAY, fontWeight: 400, fontSize: big ? 22 : 12, letterSpacing: "0.32em", lineHeight: 1, textTransform: "uppercase" }}>Agon</div>
        {subtitle && <div style={{ fontSize: 13, color: C.tx2, marginTop: big ? 8 : 2 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

export function AuthField({ label, hint, error, right, children }: { label: string; hint?: ReactNode; error?: string | null; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={AUTH_LABEL}>{label}</span>
        {right}
      </div>
      {children}
      {error ? <div style={{ fontSize: 12, color: C.r, marginTop: 6 }}>{error}</div>
        : hint ? <div style={{ fontSize: 12, color: C.tx3, marginTop: 6, lineHeight: 1.45 }}>{hint}</div> : null}
    </div>
  );
}

export function AuthButton({ children, disabled, onClick, type = "submit", variant = "primary" }: {
  children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "submit" | "button"; variant?: "primary" | "ghost";
}) {
  const primary = variant === "primary";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%", height: 52, borderRadius: 12, fontSize: 15, fontWeight: 600, fontFamily: "inherit",
        border: primary ? "none" : `1px solid ${alpha(C.tx, 0.18)}`, background: primary ? C.ac : "transparent", color: primary ? C.bg : C.tx,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return <div role="alert" style={{ fontSize: 13, color: C.r, padding: "10px 12px", borderRadius: 10, background: alpha(C.r, 0.1), border: `1px solid ${alpha(C.r, 0.3)}` }}>{children}</div>;
}

export function LegalLinks() {
  const l: CSSProperties = { color: C.tx3, textDecoration: "none" };
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12 }}>
      <Link to={LEGAL_ROUTES.terms} style={l}>CGU</Link>
      <Link to={LEGAL_ROUTES.privacy} style={l}>Confidentialité</Link>
      <Link to={LEGAL_ROUTES.notice} style={l}>Mentions légales</Link>
    </div>
  );
}

/** Page d'accès : colonne de téléphone, contenu en haut, bouton principal collé en bas. */
export function AuthScreen({ top, children, footer }: { top?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.tx, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "calc(env(safe-area-inset-top, 0px) + 28px) 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20 }}>
        {top}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>{children}</div>
        {footer}
      </div>
    </div>
  );
}

export function AuthTitle({ kicker, title, text }: { kicker?: string; title: string; text?: ReactNode }) {
  return (
    <div>
      {kicker && <div style={{ ...AUTH_LABEL, color: C.ac, marginBottom: 8 }}>{kicker}</div>}
      <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 300, fontSize: 26, lineHeight: 1.12, letterSpacing: "0.06em" }}>{title}</h1>
      {text && <div style={{ fontSize: 13.5, color: C.tx2, marginTop: 8, lineHeight: 1.5 }}>{text}</div>}
    </div>
  );
}
