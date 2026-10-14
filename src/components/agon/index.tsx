/**
 * Agon Design System — primitives visuelles
 *
 * Module, ModuleHeader, Stat, DataRow, Tag, Equerres, EmptyState
 * Styles via C (theme.ts). Aucune logique métier.
 */
import React from "react";
import { C } from "@/lib/theme";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Equerres — 4 petites équerres de 8px aux coins (signature visuelle)      */
/* ────────────────────────────────────────────────────────────────────────── */

const EQ_SIZE = 8;
const EQ_THICK = 1.5;

function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: EQ_SIZE,
    height: EQ_SIZE,
    pointerEvents: "none",
  };
  const bdr = `${EQ_THICK}px solid ${color}`;
  const styles: Record<string, React.CSSProperties> = {
    tl: { top: -1, left: -1, borderTop: bdr, borderLeft: bdr },
    tr: { top: -1, right: -1, borderTop: bdr, borderRight: bdr },
    bl: { bottom: -1, left: -1, borderBottom: bdr, borderLeft: bdr },
    br: { bottom: -1, right: -1, borderBottom: bdr, borderRight: bdr },
  };
  return <span style={{ ...base, ...styles[pos] }} aria-hidden />;
}

export function Equerres({ color = C.ac }: { color?: string }) {
  return (
    <>
      <Corner pos="tl" color={color} />
      <Corner pos="tr" color={color} />
      <Corner pos="bl" color={color} />
      <Corner pos="br" color={color} />
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  ModuleHeader — kicker + titre + action à droite + filet dégradé          */
/* ────────────────────────────────────────────────────────────────────────── */

interface ModuleHeaderProps {
  kicker?: string;
  title: string;
  action?: React.ReactNode;
  color?: string;
}

export function ModuleHeader({ kicker, title, action, color = C.ac }: ModuleHeaderProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          {kicker && (
            <div
              style={{
                fontFamily: "var(--font-data)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase" as const,
                color: C.tx3,
                marginBottom: 4,
              }}
            >
              {kicker}
            </div>
          )}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontStretch: "125%",
              fontWeight: 300,
              fontSize: 16,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              color: C.tx,
            }}
          >
            {title}
          </div>
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      <div
        style={{
          height: 1,
          marginTop: 12,
          background: `linear-gradient(90deg, ${color}73, transparent)`,
        }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Module — conteneur principal (default | featured | flat)                 */
/* ────────────────────────────────────────────────────────────────────────── */

type Motif = "arene" | "frise" | "monogramme";

const MOTIF_URL: Record<Motif, string> = {
  arene:       "/brand/agon-pattern-arene-sombre.svg",
  frise:       "/brand/agon-pattern-frise-meandre-sombre.svg",
  monogramme:  "/brand/agon-pattern-monogramme-sombre.svg",
};

function MotifLayer({ motif }: { motif: Motif }) {
  const common: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    backgroundImage: `url(${MOTIF_URL[motif]})`,
    backgroundRepeat: "no-repeat",
    zIndex: 0,
  };

  if (motif === "arene") {
    return (
      <div
        aria-hidden
        style={{
          ...common,
          top: 0, right: 0, width: 320, height: 320,
          backgroundSize: "700px",
          backgroundPosition: "top right",
          opacity: 0.35,
          maskImage: "radial-gradient(circle at 80% 20%, #000 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at 80% 20%, #000 0%, transparent 70%)",
        }}
      />
    );
  }

  if (motif === "frise") {
    return (
      <div
        aria-hidden
        style={{
          ...common,
          top: 0, left: 0, right: 0, height: 28,
          backgroundSize: "600px",
          backgroundRepeat: "repeat-x",
          opacity: 0.35,
          maskImage: "linear-gradient(90deg, #000 0%, transparent 85%)",
          WebkitMaskImage: "linear-gradient(90deg, #000 0%, transparent 85%)",
        }}
      />
    );
  }

  // monogramme
  return (
    <div
      aria-hidden
      style={{
        ...common,
        top: "50%", left: "50%",
        width: 220, height: 220,
        transform: "translate(-50%, -50%)",
        backgroundSize: "1200px",
        backgroundPosition: "center",
        opacity: 0.25,
        maskImage: "radial-gradient(circle, #000 20%, transparent 70%)",
        WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 70%)",
      }}
    />
  );
}

interface ModuleProps {
  variant?: "default" | "featured" | "flat";
  motif?: Motif;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export function Module({ variant = "default", motif, color = C.ac, children, style, className }: ModuleProps) {
  const base: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    padding: "20px 20px",
    borderRadius: 6,
    background: variant === "flat" ? "transparent" : C.s1,
    border:
      variant === "featured"
        ? `1px solid ${color}59`
        : variant === "flat"
          ? "none"
          : `1px solid ${C.brd}`,
    ...style,
  };

  return (
    <div style={base} className={className}>
      {motif && <MotifLayer motif={motif} />}
      {variant === "featured" && <Equerres color={color} />}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Stat — chiffre + unité + delta (optionnel)                               */
/* ────────────────────────────────────────────────────────────────────────── */

interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaColor?: string;
  style?: React.CSSProperties;
}

export function Stat({ label, value, unit, delta, deltaColor = C.g, style }: StatProps) {
  return (
    <div style={style}>
      <div
        style={{
          fontFamily: "var(--font-data)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: C.tx3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-data)",
          fontSize: 22,
          fontWeight: 500,
          marginTop: 6,
          color: C.tx,
          lineHeight: 1,
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 12, color: C.tx3, marginLeft: 2 }}>{unit}</span>
        )}
      </div>
      {delta && (
        <div
          style={{
            fontFamily: "var(--font-data)",
            fontSize: 11,
            color: deltaColor,
            marginTop: 4,
          }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  DataRow — ligne bordée pour listes                                       */
/* ────────────────────────────────────────────────────────────────────────── */

interface DataRowProps {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function DataRow({ children, onClick, style }: DataRowProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${C.brd}`,
        background: hover ? C.s2 : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.12s",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tag — badge carré (radius 4), bordure + fond translucide                 */
/* ────────────────────────────────────────────────────────────────────────── */

interface TagProps {
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Tag({ color = C.ac, children, style }: TagProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 4,
        border: `1px solid ${color}40`,
        background: `${color}18`,
        color,
        fontFamily: "var(--font-data)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
        lineHeight: 1.3,
        whiteSpace: "nowrap" as const,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  EmptyState — état vide avec pattern en fond                              */
/* ────────────────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        position: "relative",
        padding: "40px 24px",
        textAlign: "center",
        overflow: "hidden",
        borderRadius: 6,
      }}
    >
      <MotifLayer motif="monogramme" />
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontStretch: "125%",
            fontWeight: 300,
            fontSize: 14,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            color: C.tx3,
          }}
        >
          {title}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: C.tx3, marginTop: 8, maxWidth: 280, margin: "8px auto 0" }}>
            {description}
          </div>
        )}
        {action && <div style={{ marginTop: 16 }}>{action}</div>}
      </div>
    </div>
  );
}
